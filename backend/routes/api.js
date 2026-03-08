// ──────────────────────────────────────────────────────────────────
//  routes/api.js  –  All Express route handlers for SCPADPAS
// ──────────────────────────────────────────────────────────────────
const express  = require("express");
const multer   = require("multer");
const axios    = require("axios");
const FormData = require("form-data");
const { db }   = require("../firebase");

const router = express.Router();

// Multer – keep uploaded images in memory (no disk writes needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ── Firestore collection / document names ─────────────────────────
const HISTORY_COL  = "detections";       // each doc = one detection
const COMMANDS_DOC = "device_commands";  // single doc in "devices" col
const COMMANDS_COL = "devices";

// ═════════════════════════════════════════════════════════════════
//  AUTO-TRIGGER HELPER
//  Called after every detection — updates Firestore device commands
//  Wild     → Siren ON,  Deterrent OFF
//  NonWild  → Siren OFF, Deterrent ON
//  NoAnimal → Siren OFF, Deterrent OFF
// ═════════════════════════════════════════════════════════════════
async function autoTrigger(prediction) {
  let commands = {};

  if (prediction === "Wild") {
    commands = { system_enabled: true, siren: true, deterrent: false };
    console.log("[AutoTrigger] 🦊 WILD → Siren ON, Deterrent OFF");

  } else if (prediction === "NonWild") {
    commands = { system_enabled: true, siren: false, deterrent: true };
    console.log("[AutoTrigger] 🌿 NONWILD → Siren OFF, Deterrent ON");

  } else if (prediction === "NoAnimal") {
    commands = { system_enabled: true, siren: false, deterrent: false };
    console.log("[AutoTrigger] ✅ NO ANIMAL → Both OFF");

  } else {
    commands = { system_enabled: true, siren: false, deterrent: false };
    console.log("[AutoTrigger] ❓ Unknown → Both OFF (safe mode)");
  }

  commands.updated_at   = new Date().toISOString();
  commands.triggered_by = prediction;

  await db
    .collection(COMMANDS_COL)
    .doc(COMMANDS_DOC)
    .set(commands, { merge: true });
}

// ═════════════════════════════════════════════════════════════════
//  POST /api/test-image
//  Accepts multipart/form-data with field "image"
//  Forwards image to the AI API and returns the prediction
// ═════════════════════════════════════════════════════════════════
router.post("/test-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename:    req.file.originalname || "image.jpg",
      contentType: req.file.mimetype,
    });

    const aiResponse = await axios.post(
      process.env.AI_API_URL || "https://scpadpas-hmt7.onrender.com/predict",
      form,
      { headers: form.getHeaders(), timeout: 120000 }
    );

    const { prediction, confidence } = aiResponse.data;

    const record = {
      device_id:  req.body.device_id || "web-tester",
      prediction,
      confidence: parseFloat((confidence * 100).toFixed(2)),
      timestamp:  new Date().toISOString(),
      source:     "ai-test-page",
    };
    await db.collection(HISTORY_COL).add(record);

    // ── AUTO-TRIGGER device commands based on prediction ──────────
    await autoTrigger(prediction);

    return res.json({ prediction, confidence, logged: true, triggered: true });
  } catch (err) {
    console.error("[/test-image] Error:", err.message);
    if (err.response) {
      console.error("[/test-image] Flask status:", err.response.status);
      console.error("[/test-image] Flask data:",   JSON.stringify(err.response.data));
    }
    const status = err.response?.status || 500;
    const msg    = err.response?.data?.error || err.response?.data?.message || err.message;
    return res.status(status).json({ error: msg, flask_response: err.response?.data });
  }
});

// ═════════════════════════════════════════════════════════════════
//  GET /api/history
// ═════════════════════════════════════════════════════════════════
router.get("/history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const snapshot = await db
      .collection(HISTORY_COL)
      .orderBy("timestamp", "desc")
      .limit(Math.min(limit, 200))
      .get();

    const records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ count: records.length, records });
  } catch (err) {
    console.error("[/history] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  POST /api/log  (called by ESP32)
// ═════════════════════════════════════════════════════════════════
router.post("/log", async (req, res) => {
  try {
    const { device_id, prediction, confidence, timestamp } = req.body;

    if (!device_id || !prediction || confidence === undefined) {
      return res.status(400).json({ error: "Required: device_id, prediction, confidence" });
    }

    const record = {
      device_id,
      prediction,
      confidence: parseFloat(parseFloat(confidence).toFixed(2)),
      timestamp:  timestamp || new Date().toISOString(),
    };

    const docRef = await db.collection(HISTORY_COL).add(record);

    // ── AUTO-TRIGGER device commands based on prediction ──────────
    await autoTrigger(prediction);

    return res.json({ success: true, id: docRef.id, record, triggered: true });
  } catch (err) {
    console.error("[/log] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  POST /api/device-control  (manual override from dashboard)
// ═════════════════════════════════════════════════════════════════
router.post("/device-control", async (req, res) => {
  try {
    const { system_enabled, siren, deterrent } = req.body;

    const update = {};
    if (system_enabled !== undefined) update.system_enabled = Boolean(system_enabled);
    if (siren         !== undefined) update.siren           = Boolean(siren);
    if (deterrent     !== undefined) update.deterrent       = Boolean(deterrent);
    update.updated_at = new Date().toISOString();

    if (Object.keys(update).length === 1) {
      return res.status(400).json({ error: "No control fields provided." });
    }

    await db.collection(COMMANDS_COL).doc(COMMANDS_DOC).set(update, { merge: true });
    return res.json({ success: true, updated: update });
  } catch (err) {
    console.error("[/device-control] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  GET /api/device-status
// ═════════════════════════════════════════════════════════════════
router.get("/device-status", async (req, res) => {
  try {
    const doc = await db.collection(COMMANDS_COL).doc(COMMANDS_DOC).get();
    if (!doc.exists) {
      return res.json({ system_enabled: false, siren: false, deterrent: false, updated_at: null });
    }
    return res.json(doc.data());
  } catch (err) {
    console.error("[/device-status] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  GET /api/dashboard-stats
// ═════════════════════════════════════════════════════════════════
router.get("/dashboard-stats", async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const snapshot = await db
      .collection(HISTORY_COL)
      .where("timestamp", ">=", todayISO)
      .orderBy("timestamp", "desc")
      .get();

    const records = snapshot.docs.map((d) => d.data());

    const stats = {
      total_today:     records.length,
      wild:            records.filter((r) => r.prediction === "Wild").length,
      non_wild:        records.filter((r) => r.prediction === "NonWild").length,
      no_animal:       records.filter((r) => r.prediction === "NoAnimal").length,
      last_detection:  records.length > 0 ? records[0].timestamp : null,
      last_prediction: records.length > 0 ? records[0].prediction : null,
    };

    return res.json(stats);
  } catch (err) {
    console.error("[/dashboard-stats] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

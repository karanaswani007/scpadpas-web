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
const HISTORY_COL   = "detections";          // each doc = one detection
const COMMANDS_DOC  = "device_commands";     // single doc in "devices" col
const COMMANDS_COL  = "devices";

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

    // Build a multipart body to send to the Flask AI API
    // NOTE: field name must match what Flask expects — "file" is the default
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename:    req.file.originalname || "image.jpg",
      contentType: req.file.mimetype,
    });

    const aiResponse = await axios.post(
      process.env.AI_API_URL || "https://scpadpas-hmt7.onrender.com/predict",
      form,
      { headers: form.getHeaders(), timeout: 120000 }  // 2 min for cold starts
    );

    const { prediction, confidence } = aiResponse.data;

    // Auto-log to Firestore when tested via the AI Testing page
    const record = {
      device_id:  req.body.device_id || "web-tester",
      prediction,
      confidence: parseFloat((confidence * 100).toFixed(2)),
      timestamp:  new Date().toISOString(),
      source:     "ai-test-page",
    };
    await db.collection(HISTORY_COL).add(record);

    return res.json({ prediction, confidence, logged: true });
  } catch (err) {
    console.error("[/test-image] Error:", err.message);
    // Log the full Flask response so we can debug field name issues
    if (err.response) {
      console.error("[/test-image] Flask response status:", err.response.status);
      console.error("[/test-image] Flask response data:",   JSON.stringify(err.response.data));
    }
    const status = err.response?.status || 500;
    const msg    = err.response?.data?.error || err.response?.data?.message || err.message;
    return res.status(status).json({ error: msg, flask_response: err.response?.data });
  }
});

// ═════════════════════════════════════════════════════════════════
//  GET /api/history
//  Returns detection history from Firestore (newest first, max 200)
// ═════════════════════════════════════════════════════════════════
router.get("/history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const snapshot = await db
      .collection(HISTORY_COL)
      .orderBy("timestamp", "desc")
      .limit(Math.min(limit, 200))
      .get();

    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json({ count: records.length, records });
  } catch (err) {
    console.error("[/history] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  POST /api/log
//  Manually log a detection record (called by ESP32 or other clients)
//  Body: { device_id, prediction, confidence, timestamp? }
// ═════════════════════════════════════════════════════════════════
router.post("/log", async (req, res) => {
  try {
    const { device_id, prediction, confidence, timestamp } = req.body;

    if (!device_id || !prediction || confidence === undefined) {
      return res.status(400).json({
        error: "Required fields: device_id, prediction, confidence",
      });
    }

    const record = {
      device_id,
      prediction,
      confidence: parseFloat(parseFloat(confidence).toFixed(2)),
      timestamp:  timestamp || new Date().toISOString(),
    };

    const docRef = await db.collection(HISTORY_COL).add(record);
    return res.json({ success: true, id: docRef.id, record });
  } catch (err) {
    console.error("[/log] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  POST /api/device-control
//  Update the Firestore device_commands document
//  Body: { system_enabled?, siren?, deterrent? }
// ═════════════════════════════════════════════════════════════════
router.post("/device-control", async (req, res) => {
  try {
    const { system_enabled, siren, deterrent } = req.body;

    // Build only the fields that were actually sent
    const update = {};
    if (system_enabled !== undefined) update.system_enabled = Boolean(system_enabled);
    if (siren         !== undefined) update.siren           = Boolean(siren);
    if (deterrent     !== undefined) update.deterrent       = Boolean(deterrent);
    update.updated_at = new Date().toISOString();

    if (Object.keys(update).length === 1) {
      return res.status(400).json({ error: "No control fields provided." });
    }

    // setMerge:true creates the document if it doesn't exist yet
    await db
      .collection(COMMANDS_COL)
      .doc(COMMANDS_DOC)
      .set(update, { merge: true });

    return res.json({ success: true, updated: update });
  } catch (err) {
    console.error("[/device-control] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  GET /api/device-status
//  Returns current device command state
// ═════════════════════════════════════════════════════════════════
router.get("/device-status", async (req, res) => {
  try {
    const doc = await db
      .collection(COMMANDS_COL)
      .doc(COMMANDS_DOC)
      .get();

    if (!doc.exists) {
      // Return safe defaults if document has never been written
      return res.json({
        system_enabled: false,
        siren:          false,
        deterrent:      false,
        updated_at:     null,
      });
    }
    return res.json(doc.data());
  } catch (err) {
    console.error("[/device-status] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════
//  GET /api/dashboard-stats
//  Returns aggregated stats for the main dashboard
// ═════════════════════════════════════════════════════════════════
router.get("/dashboard-stats", async (req, res) => {
  try {
    // Get today's start in ISO format
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Fetch records from today
    const snapshot = await db
      .collection(HISTORY_COL)
      .where("timestamp", ">=", todayISO)
      .orderBy("timestamp", "desc")
      .get();

    const records = snapshot.docs.map((d) => d.data());

    const stats = {
      total_today:    records.length,
      wild:           records.filter((r) => r.prediction === "Wild").length,
      non_wild:       records.filter((r) => r.prediction === "NonWild").length,
      no_animal:      records.filter((r) => r.prediction === "NoAnimal").length,
      last_detection: records.length > 0 ? records[0].timestamp : null,
      last_prediction:records.length > 0 ? records[0].prediction : null,
    };

    return res.json(stats);
  } catch (err) {
    console.error("[/dashboard-stats] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
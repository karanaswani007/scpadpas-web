// ──────────────────────────────────────────────────────────────────
//  server.js  –  SCPADPAS Express Backend Entry Point
// ──────────────────────────────────────────────────────────────────
require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const apiRoutes = require("./routes/api");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend static files (for production)
app.use(express.static(path.join(__dirname, "../frontend")));

// ── API Routes ─────────────────────────────────────────────────────
app.use("/api", apiRoutes);

// ── Health check ───────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "SCPADPAS Backend", uptime: process.uptime() });
});

// ── SPA fallback – send index.html for all non-API routes ──────────
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
  }
});

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌿 SCPADPAS Backend running on http://localhost:${PORT}`);
  console.log(`   AI API endpoint : ${process.env.AI_API_URL}`);
  console.log(`   Firebase Project: ${process.env.FIREBASE_PROJECT_ID}\n`);
});

// Keep-alive - Backend + AI API dono jagaye rakho
const axios = require("axios");

function keepAlive() {
  // Backend ping
  axios.get("https://scpadpas-web.onrender.com/api/health")
    .then(() => console.log("[KeepAlive] Backend ✓"))
    .catch(() => {});

  // AI API ping (alag repo - koi baat nahi!)
  axios.get("https://scpadpas-hmt7.onrender.com/")
    .then(() => console.log("[KeepAlive] AI API ✓"))
    .catch(() => {});
}

setInterval(keepAlive, 14 * 60 * 1000); // har 14 min
keepAlive(); // startup pe turant

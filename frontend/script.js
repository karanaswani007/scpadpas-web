// ══════════════════════════════════════════════════════════════════
//  script.js  –  SCPADPAS Shared Frontend Utilities
//  Loaded on every page for sidebar, toasts, time, etc.
// ══════════════════════════════════════════════════════════════════

// ─── Backend base URL ─────────────────────────────────────────────
// Change this when deploying; keep /api prefix
const API_BASE = "https://scpadpas-web.onrender.com/api";

// ─── Live clock ───────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById("live-clock");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString("en-GB", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
setInterval(updateClock, 1000);
updateClock();

// ─── Sidebar toggle (mobile) ──────────────────────────────────────
const sidebar  = document.querySelector(".sidebar");
const overlay  = document.querySelector(".sidebar-overlay");
const hamburger = document.querySelector(".hamburger");

if (hamburger) {
  hamburger.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
    overlay?.classList.toggle("show");
  });
}
if (overlay) {
  overlay.addEventListener("click", () => {
    sidebar?.classList.remove("open");
    overlay.classList.remove("show");
  });
}

// Mark active nav link
(function markActive() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href === path || (path === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });
})();

// ─── Toast notifications ──────────────────────────────────────────
function showToast(message, type = "success", duration = 3500) {
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(30px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ─── Generic API helpers ──────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Format helpers ───────────────────────────────────────────────
function formatTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

function formatTimeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function predictionBadge(prediction) {
  const map = {
    "Wild":     `<span class="badge badge-wild">🦊 Wild</span>`,
    "NonWild":  `<span class="badge badge-nonwild">🌿 NonWild</span>`,
    "NoAnimal": `<span class="badge badge-noanimal">✅ NoAnimal</span>`,
  };
  return map[prediction] || `<span class="badge">${prediction}</span>`;
}

function confBar(pct, cls) {
  return `<div class="confidence-bar">
    <div class="confidence-fill" style="width:${pct}%" data-target="${pct}" data-cls="${cls}"></div>
  </div>`;
}

// Animate confidence bars after DOM insert
function animateBars() {
  document.querySelectorAll(".confidence-fill[data-target]").forEach((el) => {
    const target = el.dataset.target;
    el.style.width = "0%";
    requestAnimationFrame(() => {
      setTimeout(() => { el.style.width = target + "%"; }, 80);
    });
  });
}

// ─── Drag-and-drop for upload zone ───────────────────────────────
function initUploadZone(zoneId, inputId, onFile) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  ["dragenter", "dragover"].forEach((e) =>
    zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((e) =>
    zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.remove("dragover"); })
  );
  zone.addEventListener("drop", (ev) => {
    const file = ev.dataTransfer.files[0];
    if (file) onFile(file);
  });
  input.addEventListener("change", () => {
    if (input.files[0]) onFile(input.files[0]);
  });
}

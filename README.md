# 🌿 SCPADPAS — Smart Crop Protection with Animal Deterrent and Predator Alert System

> **Final Year Engineering Project Dashboard**
> Full-stack IoT monitoring system with AI-powered animal detection, Firebase integration, and ESP32 device control.

---

## 📁 Project Structure

```
SCPADPAS/
├── frontend/
│   ├── index.html        ← Main Dashboard (stats, recent detections)
│   ├── test.html         ← AI Testing Page (upload image → predict)
│   ├── history.html      ← Detection History (Firestore table + CSV export)
│   ├── control.html      ← Device Control Panel (toggle ESP32 commands)
│   ├── style.css         ← Global custom CSS (design system)
│   └── script.js         ← Shared utilities (toast, clock, API helpers)
│
└── backend/
    ├── server.js         ← Express app entry point
    ├── firebase.js       ← Firebase Admin SDK init
    ├── package.json
    ├── .env.example      ← Copy to .env and fill in your credentials
    └── routes/
        └── api.js        ← All API route handlers
```

---

## ⚙️ Setup Instructions

### Step 1 — Clone / Download the project

```bash
git clone <your-repo>
cd SCPADPAS
```

---

### Step 2 — Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (e.g., `scpadpas`)
3. Enable **Firestore Database** (start in test mode for development)
4. Go to **Project Settings → Service Accounts**
5. Click **Generate New Private Key** → download the JSON file
6. Note these values from the JSON:
   - `project_id`
   - `client_email`
   - `private_key`

#### Firestore Collections (auto-created on first write):

| Collection      | Document          | Purpose                          |
|-----------------|-------------------|----------------------------------|
| `detections`    | (auto-ID docs)    | Each detection event log         |
| `devices`       | `device_commands` | ESP32 command state (ON/OFF)     |

---

### Step 3 — Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
AI_API_URL=https://scpadpas-hmt7.onrender.com/predict

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR KEY HERE\n-----END PRIVATE KEY-----\n"

FRONTEND_ORIGIN=*
```

> ⚠️ **IMPORTANT**: The `FIREBASE_PRIVATE_KEY` must be enclosed in double quotes and have literal `\n` characters (not real newlines) in the `.env` file.

Start the backend:

```bash
npm start        # production
npm run dev      # development with auto-reload (requires nodemon)
```

Server will run at: `http://localhost:3000`

---

### Step 4 — Frontend Setup

The frontend is **static HTML/CSS/JS** — no build step required.

**Development (open directly in browser):**
- Open `frontend/index.html` in your browser
- ⚠️ You must update `API_BASE` in `script.js` to point to your backend:

```js
// In frontend/script.js — line 6
const API_BASE = "http://localhost:3000/api";  // dev
// const API_BASE = "https://your-backend.onrender.com/api"; // production
```

**Production (served by Express):**
The backend serves the frontend automatically. Just navigate to `http://localhost:3000`.

---

### Step 5 — Test the System

1. Start backend: `npm start`
2. Open `http://localhost:3000` in browser
3. Navigate to **AI Testing** → upload a field camera image
4. Check **Detection History** to verify Firestore logging
5. Use **Device Control** → toggle switches → check Firestore Console

---

## 🤖 ESP32 Integration Guide

Your ESP32 should poll Firestore using the REST API. Here is the complete Arduino sketch logic:

### Required Libraries

```
WiFi.h
HTTPClient.h
ArduinoJson.h  (install via Arduino Library Manager)
```

### Arduino Sketch (ESP32)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── Configuration ──────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Firebase project details
const char* PROJECT_ID    = "your-firebase-project-id";
const char* API_KEY       = "your-firebase-web-api-key"; // From Firebase Console → Settings → General

// GPIO pin assignments
const int SIREN_PIN     = 26;
const int DETERRENT_PIN = 27;
const int LED_PIN       = 2;   // Built-in LED = system enabled indicator

// ── Setup ──────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(SIREN_PIN,     OUTPUT);
  pinMode(DETERRENT_PIN, OUTPUT);
  pinMode(LED_PIN,       OUTPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected! IP: " + WiFi.localIP().toString());
}

// ── Main Loop ──────────────────────────────────
void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    fetchAndApplyCommands();
  }
  delay(2000); // Poll every 2 seconds
}

// ── Fetch Firestore Commands ───────────────────
void fetchAndApplyCommands() {
  HTTPClient http;
  
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += PROJECT_ID;
  url += "/databases/(default)/documents/devices/device_commands?key=";
  url += API_KEY;

  http.begin(url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    
    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, payload);
    
    if (!err) {
      // Extract boolean values from Firestore JSON structure
      bool systemEnabled = doc["fields"]["system_enabled"]["booleanValue"] | false;
      bool siren         = doc["fields"]["siren"]["booleanValue"]          | false;
      bool deterrent     = doc["fields"]["deterrent"]["booleanValue"]      | false;

      // Apply commands to GPIO
      digitalWrite(LED_PIN,       systemEnabled ? HIGH : LOW);
      digitalWrite(SIREN_PIN,     (systemEnabled && siren)     ? HIGH : LOW);
      digitalWrite(DETERRENT_PIN, (systemEnabled && deterrent) ? HIGH : LOW);

      Serial.printf("[CMD] System:%d Siren:%d Deterrent:%d\n",
                    systemEnabled, siren, deterrent);
    }
  } else {
    Serial.printf("[ERROR] HTTP %d\n", httpCode);
  }
  
  http.end();
}
```

### How to Get Your Firebase Web API Key:
1. Firebase Console → Project Settings → General
2. Under "Your apps" → Web App → `apiKey`

---

## 🔌 API Endpoints Reference

| Method | Endpoint              | Description                          |
|--------|-----------------------|--------------------------------------|
| GET    | `/api/health`         | Backend health check                 |
| POST   | `/api/test-image`     | Upload image → AI prediction + log   |
| GET    | `/api/history`        | Fetch detection history (Firestore)  |
| POST   | `/api/log`            | Manually log a detection             |
| POST   | `/api/device-control` | Update device commands in Firestore  |
| GET    | `/api/device-status`  | Read current device command state    |
| GET    | `/api/dashboard-stats`| Today's aggregated detection stats   |

### Example: POST /api/test-image

```bash
curl -X POST http://localhost:3000/api/test-image \
  -F "image=@/path/to/field_photo.jpg" \
  -F "device_id=ESP32-CAM-01"
```

Response:
```json
{
  "prediction": "Wild",
  "confidence": 0.9312,
  "logged": true
}
```

### Example: POST /api/device-control

```bash
curl -X POST http://localhost:3000/api/device-control \
  -H "Content-Type: application/json" \
  -d '{"system_enabled": true, "siren": true, "deterrent": false}'
```

### Example: POST /api/log (from ESP32)

```bash
curl -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" \
  -d '{"device_id":"ESP32-CAM-01","prediction":"Wild","confidence":0.93}'
```

---

## 🚀 Deployment (Render.com)

### Deploy Backend:
1. Push code to GitHub
2. Create new **Web Service** on Render
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables from `.env`

### Update Frontend:
Change `API_BASE` in `script.js`:
```js
const API_BASE = "https://your-backend-name.onrender.com/api";
```

---

## 📊 Firestore Data Schema

### `detections` collection (each doc):
```json
{
  "device_id":  "ESP32-CAM-01",
  "prediction": "Wild",
  "confidence": 93.12,
  "timestamp":  "2024-11-15T14:32:00.000Z",
  "source":     "ai-test-page"
}
```

### `devices/device_commands` document:
```json
{
  "system_enabled": true,
  "siren":          false,
  "deterrent":      true,
  "updated_at":     "2024-11-15T14:35:00.000Z"
}
```

---

## 🛠️ Tech Stack

| Layer    | Technology              |
|----------|-------------------------|
| Frontend | HTML5, Tailwind CSS, Vanilla JS |
| Backend  | Node.js, Express.js     |
| Database | Firebase Firestore      |
| AI API   | Python Flask (Render)   |
| Device   | ESP32-CAM (Arduino)     |

---

## 📝 License

MIT License — Final Year Engineering Project, 2024

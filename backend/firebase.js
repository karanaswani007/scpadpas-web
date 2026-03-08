// ──────────────────────────────────────────────────────────────────
//  firebase.js  –  Firebase Admin SDK initialisation
//  Used by all backend routes to access Firestore
// ──────────────────────────────────────────────────────────────────
const admin = require("firebase-admin");

// Guard: only initialise once (important when hot-reloading in dev)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The private key string from .env has literal \n – replace them
      privateKey:  process.env.FIREBASE_PRIVATE_KEY
                     ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
                     : undefined,
    }),
  });
  console.log("[Firebase] Admin SDK initialised ✓");
}

// Export the Firestore instance that routes will use
const db = admin.firestore();

module.exports = { admin, db };

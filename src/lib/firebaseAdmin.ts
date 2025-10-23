// src/lib/firebaseAdmin.ts
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    // Uses GOOGLE_APPLICATION_CREDENTIALS / Vercel env automatically.
    // If you use a JSON service account string:
    // credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON!)),
  });
}

export default admin;

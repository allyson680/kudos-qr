// src/lib/firebaseAdmin.ts
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    // If you use a JSON service account, uncomment and set the env var:
    // credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON!)),
  });
}

// ✅ Keep default export for existing `import admin from "@/lib/firebaseAdmin"`
export default admin;

// ✅ Add a named helper for existing `import { getDb } from "@/lib/firebaseAdmin"`
export function getDb() {
  return admin.firestore();
}

// (Optional) handy re-exports if you ever want:
// export const FieldValue = admin.firestore.FieldValue;

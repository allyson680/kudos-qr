// src/lib/firebaseAdmin.ts
import * as admin from "firebase-admin";

/**
 * Supports EITHER:
 * - FIREBASE_SERVICE_ACCOUNT = full JSON string (what you have)
 * - or the split vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
function getCredential() {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (svc) {
    // Works whether it's raw JSON or JSON escaped in Vercel
    const json = JSON.parse(
      // strip surrounding quotes if Vercel injected them
      svc.startsWith('"') && svc.endsWith('"') ? svc.slice(1, -1) : svc
    );
    // Ensure \n are real newlines
    if (json.private_key) json.private_key = String(json.private_key).replace(/\\n/g, "\n");
    return admin.credential.cert(json);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
    privateKey = privateKey.replace(/\\n/g, "\n");
    return admin.credential.cert({ projectId, clientEmail, privateKey });
  }

  // Fall back to ADC if available (rare on Vercel)
  return undefined;
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: getCredential() });
}

export default admin;
export function getDb() {
  return admin.firestore();
}

// SERVER-ONLY helper. Don't import this in client components.
import * as admin from "firebase-admin";
import fs from "fs";
import path from "path";

const globalForAdmin = global as unknown as { adminApp?: admin.app.App };

export function getAdminApp() {
  if (globalForAdmin.adminApp) return globalForAdmin.adminApp;

  let credential: admin.credential.Credential;

  // Preferred: read full JSON from Vercel env var
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim().startsWith("{")) {
    credential = admin.credential.cert(JSON.parse(raw) as admin.ServiceAccount);
  } else {
    // Local dev fallback: read file if present
    const localPath = path.join(process.cwd(), "serviceAccountKey.json");
    if (!fs.existsSync(localPath)) {
      throw new Error(
        "Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON (Vercel) or place serviceAccountKey.json in project root (local)."
      );
    }
    const localJson = JSON.parse(fs.readFileSync(localPath, "utf-8"));
    credential = admin.credential.cert(localJson);
  }

  globalForAdmin.adminApp = admin.initializeApp({ credential });
  return globalForAdmin.adminApp!;
}

export function getDb() {
  return getAdminApp().firestore();
}

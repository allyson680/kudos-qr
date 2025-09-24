// SERVER-ONLY helper. Don't import this in client components.
import * as admin from "firebase-admin";

const globalForAdmin = global as unknown as { adminApp?: admin.app.App };

export function getAdminApp() {
  if (!globalForAdmin.adminApp) {
    // In production (Vercel) read from env var; in dev read the local file.
    let credential: admin.credential.Credential;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      const json = JSON.parse(raw);
      credential = admin.credential.cert(json);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const local = require("../../serviceAccountKey.json");
      credential = admin.credential.cert(local);
    }
    globalForAdmin.adminApp = admin.initializeApp({ credential });
  }
  return globalForAdmin.adminApp!;
}

export function getDb() {
  return getAdminApp().firestore();
}

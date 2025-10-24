import * as admin from "firebase-admin";

function getCredential() {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;

   if (svc) {
    try {
      const raw = svc.startsWith('"') && svc.endsWith('"') ? svc.slice(1, -1) : svc;
      const json = JSON.parse(raw);
      if (json.private_key) json.private_key = String(json.private_key).replace(/\\n/g, "\n");
      return admin.credential.cert(json);
    } catch (e) {
      console.error("FIREBASE_SERVICE_ACCOUNT parse error:", e);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
    privateKey = privateKey.replace(/\\n/g, "\n");
    return admin.credential.cert({ projectId, clientEmail, privateKey });
  }

  return undefined;
}

const cred = getCredential();

if (!admin.apps.length) {
  if (cred) {
    admin.initializeApp({ credential: cred });
  } else {
    // Falls back to ADC locally if you ever use `gcloud auth application-default login`
    // or just init without explicit creds (useful for emulators).
    admin.initializeApp();
  }
}

export default admin;
export function getDb() {
  return admin.firestore();
}

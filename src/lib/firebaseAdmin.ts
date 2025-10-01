import admin from "firebase-admin";

let initialized = false;

function buildCredential(): admin.credential.Credential {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT ??
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (raw) {
    const svc = JSON.parse(raw);
    if (svc.private_key && typeof svc.private_key === "string") {
      svc.private_key = svc.private_key.replace(/\\n/g, "\n");
    }
    return admin.credential.cert(svc as admin.ServiceAccount);
  }

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    } as admin.ServiceAccount);
  }

  throw new Error(
    "Missing Firebase Admin creds. Set FIREBASE_SERVICE_ACCOUNT (JSON) " +
      "or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY."
  );
}

export function getDb() {
  if (!initialized) {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: buildCredential() });
    }
    initialized = true;
  }
  return admin.firestore();
}

export { admin };

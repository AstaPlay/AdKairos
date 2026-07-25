import "server-only";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getServerEnv } from "@/config/env.config";

function normalizePrivateKey(rawKey: string): string {
  // Aceita tanto "\n" literal (texto colado de um .env de uma linha só)
  // quanto quebras de linha reais (colado multiline direto, como no painel
  // da Vercel) — normaliza para sempre ter quebras de linha reais no final,
  // que é o único formato que o Firebase Admin SDK aceita.
  const withRealNewlines = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return withRealNewlines.trim();
}

function createFirebaseAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const env = getServerEnv();

  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY),
    }),
  });
}

export const firebaseAdminApp: App = createFirebaseAdminApp();
export const firebaseAdminAuth: Auth = getAuth(firebaseAdminApp);
export const firebaseAdminFirestore: Firestore = getFirestore(firebaseAdminApp);

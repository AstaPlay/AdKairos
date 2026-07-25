import "server-only";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getServerEnv } from "@/config/env.config";

function createFirebaseAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const env = getServerEnv();

  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const firebaseAdminApp: App = createFirebaseAdminApp();
export const firebaseAdminAuth: Auth = getAuth(firebaseAdminApp);
export const firebaseAdminFirestore: Firestore = getFirestore(firebaseAdminApp);

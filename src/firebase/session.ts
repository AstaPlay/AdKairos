import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";

import { firebaseAdminAuth } from "@/firebase/admin";

/** Valida um cookie de sessão do Firebase — retorna null (nunca lança) se inválido/expirado. */
export async function verifySessionCookie(sessionCookie: string): Promise<DecodedIdToken | null> {
  try {
    return await firebaseAdminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

/** Troca um idToken (client) por um cookie de sessão httpOnly (server) com duração customizada. */
export async function createSessionCookie(idToken: string, expiresInMs: number): Promise<string> {
  return firebaseAdminAuth.createSessionCookie(idToken, { expiresIn: expiresInMs });
}

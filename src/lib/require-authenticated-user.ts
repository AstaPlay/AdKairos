import "server-only";
import type { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifySessionCookie } from "@/firebase/session";
import { SESSION_COOKIE_NAME } from "@/lib/cookies";

/**
 * Lê e valida o cookie de sessão dentro de uma API Route.
 * Retorna null se não houver sessão válida — a rota decide o status HTTP.
 */
export async function requireAuthenticatedUser(request: NextRequest): Promise<DecodedIdToken | null> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return verifySessionCookie(sessionCookie);
}

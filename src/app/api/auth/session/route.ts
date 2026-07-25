import { NextResponse, type NextRequest } from "next/server";
import { createSessionCookie, verifySessionCookie } from "@/firebase/session";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_OPTIONS } from "@/lib/cookies";

/**
 * POST — troca um idToken do Firebase Auth (client) por um cookie de sessão
 * httpOnly (server). Chamado logo após signInWithEmailAndPassword no client.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { idToken?: string };
  if (!body.idToken) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "Token inválido." } },
      { status: 400 },
    );
  }

  try {
    const sessionCookie = await createSessionCookie(body.idToken, SESSION_COOKIE_MAX_AGE_MS);
    const response = NextResponse.json({ success: true, data: null });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_COOKIE_MAX_AGE_MS / 1000,
    });
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "session_creation_failed", message: "Não foi possível iniciar a sessão." } },
      { status: 401 },
    );
  }
}

/** GET — verifica se a sessão atual (cookie) é válida. */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return NextResponse.json({ success: true, data: { authenticated: false } });

  const decoded = await verifySessionCookie(sessionCookie);
  return NextResponse.json({
    success: true,
    data: { authenticated: Boolean(decoded), email: decoded?.email ?? null },
  });
}

/** DELETE — encerra a sessão (logout do painel). */
export async function DELETE() {
  const response = NextResponse.json({ success: true, data: null });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

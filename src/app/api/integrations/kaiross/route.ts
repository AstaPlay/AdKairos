import { type NextRequest, NextResponse } from "next/server";

import { firebaseAdminFirestore } from "@/firebase/admin";
import {
  getKairoossSession,
  INTEGRATIONS_COLLECTION,
  invalidateCachedValues,
  type KairoossIntegrationDoc,
  kairoossCacheKey,
} from "@/lib/kaiross-proxy.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { extractCookies, kairoossRequest } from "@/services/kaiross-integration.service";
import { getErrorMessage } from "@/utils/get-error-message";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/** GET ?acao=status — informa se o usuário tem uma integração Kairóss ativa (nunca retorna o token em si). */
export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuthenticatedUser>>;
  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "auth_check_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível validar sua sessão."),
        },
      },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
      { status: 401 },
    );
  }

  try {
    const session = await getKairoossSession(user.uid);

    return NextResponse.json({
      success: true,
      data: {
        connected: Boolean(session),
        email: session?.email ?? null,
        connectedAt: session?.connectedAt ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "status_check_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível verificar a integração."),
        },
      },
      { status: 502 },
    );
  }
}

interface KairoossLoginBody {
  acao: "login" | "logout";
  email?: string;
  senha?: string;
}

/**
 * POST — login: autentica na Kairóss e guarda apenas o token/cookies trocados
 * (nunca a senha) em kaiross_integrations/{uid}, via Admin SDK.
 * logout: apaga o documento de integração e o cache de importação pendente.
 */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuthenticatedUser>>;
  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "auth_check_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível validar sua sessão."),
        },
      },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as KairoossLoginBody;

  if (body.acao === "logout") {
    try {
      await firebaseAdminFirestore.collection(INTEGRATIONS_COLLECTION).doc(user.uid).delete();
      await invalidateCachedValues([kairoossCacheKey(user.uid, "catalogo"), kairoossCacheKey(user.uid, "ranking")]);

      return NextResponse.json({ success: true, data: null });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "logout_failed",
            message: toSafeApiErrorMessage(error, "Não foi possível desconectar agora."),
          },
        },
        { status: 502 },
      );
    }
  }

  if (body.acao === "login") {
    if (!body.email || !body.senha) {
      return NextResponse.json(
        { success: false, error: { code: "invalid_request", message: "E-mail e senha são obrigatórios." } },
        { status: 400 },
      );
    }

    const rateLimit = await checkRateLimit(`kaiross_login__${user.uid}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000, // 5 tentativas a cada 10 min
    });

    if (!rateLimit.allowed) {
      const retryAfterMinutes = Math.ceil(rateLimit.retryAfterMs / 60000);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "rate_limited",
            message: `Muitas tentativas de conexão. Tente novamente em ${retryAfterMinutes} min.`,
          },
        },
        { status: 429 },
      );
    }

    try {
      const response = await kairoossRequest(
        "/auth/login",
        {},
        {
          method: "POST",
          body: JSON.stringify({ email: body.email, senha: body.senha }),
        },
      );

      if (!response.ok) {
        return NextResponse.json(
          { success: false, error: { code: "kaiross_login_failed", message: "Credenciais da Kairóss inválidas." } },
          { status: 401 },
        );
      }

      const cookies = extractCookies(response.headers);
      const payload = await response.json().catch(() => ({}));
      const token: string | undefined = payload?.token ?? payload?.accessToken;

      if (!cookies && !token) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "kaiross_login_failed", message: "Não foi possível estabelecer a sessão com a Kairóss." },
          },
          { status: 401 },
        );
      }

      const integrationDoc: KairoossIntegrationDoc = {
        ownerId: user.uid,
        email: body.email,
        connectedAt: new Date().toISOString(),
        ...(cookies ? { cookies } : {}),
        ...(token ? { token } : {}),
      };

      await firebaseAdminFirestore.collection(INTEGRATIONS_COLLECTION).doc(user.uid).set(integrationDoc);

      return NextResponse.json({ success: true, data: { connected: true } });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "kaiross_request_failed",
            message: toSafeApiErrorMessage(error, getErrorMessage(error)),
          },
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { success: false, error: { code: "invalid_action", message: "Ação inválida." } },
    { status: 400 },
  );
}

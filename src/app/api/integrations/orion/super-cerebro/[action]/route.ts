import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import {
  analyzeAdsPerformance,
  analyzeInstagramPerformance,
  generateContentScript,
  generateSocialContent,
  generateStrategicDiagnosis,
} from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

async function authenticate(request: NextRequest): Promise<{ user: DecodedIdToken } | { errorResponse: NextResponse }> {
  let user: DecodedIdToken | null;
  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: "auth_check_failed",
            message: toSafeApiErrorMessage(error, "Não foi possível validar sua sessão."),
          },
        },
        { status: 500 },
      ),
    };
  }
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
        { status: 401 },
      ),
    };
  }
  return { user };
}

/**
 * As 5 ações do Super Cérebro têm a mesma forma (POST, body repassado
 * ao Órion, erro tratado igual) — uma rota parametrizada por `action`
 * evita repetir esse boilerplate de auth 5 vezes. Validação de
 * shape/limites de negócio é feita no Órion (Zod); aqui só garante
 * corpo JSON válido e despacha para a função certa.
 */
const HANDLERS: Record<string, (externalUserId: string, body: unknown) => Promise<unknown>> = {
  "analyze-instagram-performance": (uid, body) =>
    analyzeInstagramPerformance(uid, body as Parameters<typeof analyzeInstagramPerformance>[1]),
  "analyze-ads-performance": (uid, body) =>
    analyzeAdsPerformance(uid, body as Parameters<typeof analyzeAdsPerformance>[1]),
  "generate-strategic-diagnosis": (uid, body) =>
    generateStrategicDiagnosis(uid, body as Parameters<typeof generateStrategicDiagnosis>[1]),
  "generate-social-content": (uid, body) =>
    generateSocialContent(uid, body as Parameters<typeof generateSocialContent>[1]),
  "generate-content-script": (uid, body) =>
    generateContentScript(uid, body as Parameters<typeof generateContentScript>[1]),
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const handler = HANDLERS[action];
  if (!handler) {
    return NextResponse.json(
      { success: false, error: { code: "unknown_action", message: `Ação desconhecida: ${action}.` } },
      { status: 404 },
    );
  }

  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }

  try {
    const result = await handler(auth.user.uid, body);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível completar essa ação do Super Cérebro agora."),
        },
      },
      { status: 502 },
    );
  }
}

import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { listAdCampaigns } from "@/lib/orion-client.server";
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

/** Campanhas de Ads com métricas cruas do período, repassando periodStart/periodEnd da query string. */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const periodStart = request.nextUrl.searchParams.get("periodStart");
  const periodEnd = request.nextUrl.searchParams.get("periodEnd");
  if (!periodStart || !periodEnd) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_query", message: "periodStart e periodEnd são obrigatórios." } },
      { status: 400 },
    );
  }

  try {
    const campaigns = await listAdCampaigns(auth.user.uid, { periodStart, periodEnd });
    return NextResponse.json({ success: true, campaigns });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível listar as campanhas de Ads agora."),
        },
      },
      { status: 502 },
    );
  }
}

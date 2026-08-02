import { type NextRequest, NextResponse } from "next/server";

import { addEnxameKey, deleteEnxameKey, getEnxameKeys, isEnxameConfigured, updateEnxameKey } from "@/lib/enxame-client";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

interface AddKeyBody {
  id: string;
  provider: "groq" | "gemini";
  apiKey: string;
  model?: string;
}

interface UpdateKeyBody {
  id: string;
  state?: "available" | "disabled";
  model?: string;
}

interface DeleteKeyBody {
  id: string;
}

async function authenticate(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) {
      return {
        user: null,
        response: NextResponse.json(
          { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
          { status: 401 },
        ),
      };
    }
    return { user, response: null };
  } catch (error) {
    return {
      user: null,
      response: NextResponse.json(
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
}

/** GET — lista as chaves cadastradas no Enxame (sem os valores reais, só metadados + preview mascarado). */
export async function GET(request: NextRequest) {
  const { response } = await authenticate(request);
  if (response) return response;

  if (!isEnxameConfigured()) {
    return NextResponse.json({ success: true, data: [], configured: false });
  }

  const result = await getEnxameKeys();
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: { code: "enxame_unavailable", message: result.error } },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true, data: result.data, configured: true });
}

/** POST — cadastra uma nova chave Groq/Gemini no pool do Enxame. */
export async function POST(request: NextRequest) {
  const { response } = await authenticate(request);
  if (response) return response;

  const body = (await request.json().catch(() => ({}))) as Partial<AddKeyBody>;
  if (!body.id || !body.provider || !body.apiKey) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "Informe id, provider e apiKey." } },
      { status: 400 },
    );
  }
  if (body.provider !== "groq" && body.provider !== "gemini") {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "provider precisa ser 'groq' ou 'gemini'." } },
      { status: 400 },
    );
  }

  const result = await addEnxameKey({ id: body.id, provider: body.provider, apiKey: body.apiKey, model: body.model });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: { code: "enxame_error", message: result.error } },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true });
}

/** PATCH — ativa/desativa uma chave ou troca o modelo associado. */
export async function PATCH(request: NextRequest) {
  const { response } = await authenticate(request);
  if (response) return response;

  const body = (await request.json().catch(() => ({}))) as Partial<UpdateKeyBody>;
  if (!body.id) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "Informe id." } },
      { status: 400 },
    );
  }

  const result = await updateEnxameKey(body.id, { state: body.state, model: body.model });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: { code: "enxame_error", message: result.error } },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true });
}

/** DELETE — remove uma chave do pool permanentemente. */
export async function DELETE(request: NextRequest) {
  const { response } = await authenticate(request);
  if (response) return response;

  const body = (await request.json().catch(() => ({}))) as Partial<DeleteKeyBody>;
  if (!body.id) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "Informe id." } },
      { status: 400 },
    );
  }

  const result = await deleteEnxameKey(body.id);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: { code: "enxame_error", message: result.error } },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true });
}

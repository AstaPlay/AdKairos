import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";

interface GerarKeywordsBody {
  operation: string;
  context: { name: string; description?: string; category?: string };
}

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "para",
  "sem",
  "em",
  "por",
  "e",
  "a",
  "o",
  "os",
  "as",
  "um",
  "uma",
]);

function heuristicKeywords(context: { name: string; description?: string; category?: string }): string[] {
  const words = `${context.name} ${context.category ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  return Array.from(new Set(words)).slice(0, 8);
}

/**
 * POST — geração de conteúdo de produto (só `gerarKeywords` implementado
 * aqui). No sistema original esta rota também servia `gerarDescricao` e
 * `gerarFAQ` via o pool de IA do "Enxame" (Groq/Gemini/Tavily, chaves por
 * usuário) — esse subsistema não fazia parte do escopo desta migração, então
 * por ora só o fallback heurístico local está disponível. Se/quando o
 * Enxame for portado, plugar aqui a chamada real e usar este fallback só
 * quando o usuário não tiver chaves cadastradas.
 */
export async function POST(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Partial<GerarKeywordsBody>;

  if (body.operation !== "gerarKeywords") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "operation_not_available",
          message: "Esta operação de IA depende do Enxame, que ainda não foi migrado para este painel.",
        },
      },
      { status: 501 },
    );
  }

  if (!body.context?.name) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "Contexto do produto é obrigatório." } },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, data: heuristicKeywords(body.context) });
}

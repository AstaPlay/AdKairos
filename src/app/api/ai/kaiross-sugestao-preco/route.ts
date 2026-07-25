import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { KAIROSS_FEES } from "@/lib/kaiross-pricing";

interface SugestaoPrecoBody {
  nome: string;
  categoria?: string;
  precoSugerido: number;
  custoFrete?: number;
  clientePagaFrete?: boolean;
}

/**
 * POST — sugestão de preço por fórmula local (sem LLM). No sistema original
 * esta rota também podia enriquecer a sugestão com pesquisa de mercado via
 * o pool de IA do "Enxame" (Groq/Gemini/Tavily) — esse subsistema não fazia
 * parte do escopo desta migração (catálogo/afiliação/sincronização), então
 * aqui a origem fica sempre "formula". Se/quando o Enxame for portado,
 * plugar aqui a chamada equivalente e alternar `origem` para
 * "formula_com_pesquisa" quando houver referências reais de mercado.
 */
export async function POST(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Partial<SugestaoPrecoBody>;
  if (!body.nome || typeof body.precoSugerido !== "number") {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "Dados insuficientes para sugerir um preço." } },
      { status: 400 },
    );
  }

  const custo = body.precoSugerido;
  const custoFrete = body.custoFrete ?? 0;
  const clientePagaFrete = body.clientePagaFrete ?? true;
  const { impostoPercentual, taxaPlataformaPercentual, taxaPlataformaFixa, margemRecomendadaPercentual } = KAIROSS_FEES;

  const base = custo + (clientePagaFrete ? 0 : custoFrete) + taxaPlataformaFixa;
  const precoMinimo = base / (1 - impostoPercentual - taxaPlataformaPercentual);
  const precoRecomendado = base / (1 - impostoPercentual - taxaPlataformaPercentual - margemRecomendadaPercentual);

  return NextResponse.json({
    success: true,
    data: {
      origem: "formula" as const,
      precoSugeridoIA: Number(precoRecomendado.toFixed(2)),
      precoMinimo: Number(precoMinimo.toFixed(2)),
      precoRecomendado: Number(precoRecomendado.toFixed(2)),
      justificativa: `Preço calculado para manter margem-alvo de ${Math.round(margemRecomendadaPercentual * 100)}% sobre o custo de R$ ${custo.toFixed(2)}, já descontando imposto (${Math.round(impostoPercentual * 100)}%) e taxa da plataforma (${Math.round(taxaPlataformaPercentual * 100)}% + R$ ${taxaPlataformaFixa.toFixed(2)}).`,
      referenciasMercado: [] as string[],
    },
  });
}

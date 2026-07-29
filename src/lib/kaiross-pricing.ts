/**
 * PRECIFICAÇÃO KAIRÓSS — fórmula portada 1:1 do módulo já validado em
 * produção no AdTurbo (precificacao.js). Mesma matemática, mesmos nomes
 * de saída, só tipado e com os tokens de cor do Kairos.
 *
 * Nota sobre a taxa de plataforma: dois valores aparecem nas fontes que
 * temos — 8,49% (codificado e testado no proxy do AdTurbo em produção) e
 * 8,9% (texto da base de conhecimento do bot, que já avisa que taxas podem
 * mudar sem aviso prévio). Usamos aqui o valor validado em produção
 * (8,49% + R$2,50), como constante única — se a Kairóss atualizar a taxa,
 * troque apenas KAIROSS_FEES abaixo.
 */

export const KAIROSS_FEES = {
  impostoPercentual: 0.1,
  taxaPlataformaPercentual: 0.0849,
  taxaPlataformaFixa: 2.5,
  /** Margem-alvo usada para calcular o "preço recomendado" (não o mínimo). */
  margemRecomendadaPercentual: 0.3,
} as const;

export type StatusMargem = "saudavel" | "apertado" | "ruim" | "prejuizo";

export interface CalculoPrecificacaoInput {
  custo: number;
  venda: number;
  clientePagaFrete: boolean;
  freteCobrado: number;
  custoFrete: number;
}

export interface CalculoPrecificacaoResult {
  lucro: number;
  margem: number;
  totalVenda: number;
  custoTotal: number;
  /** Custo de frete efetivamente descontado da margem (explícito ou repassado). */
  custoFreteEfetivo: number;
  status: StatusMargem;
  precoMin: number;
  precoRec: number;
}

export function formatarMoeda(valor: number): string {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseNumeroBr(valor: string | number): number {
  if (typeof valor === "number") return valor;
  const parsed = parseFloat(String(valor || "0").replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calcularPrecificacao({
  custo,
  venda,
  clientePagaFrete,
  freteCobrado,
  custoFrete,
}: CalculoPrecificacaoInput): CalculoPrecificacaoResult {
  const { impostoPercentual, taxaPlataformaPercentual, taxaPlataformaFixa, margemRecomendadaPercentual } = KAIROSS_FEES;

  const pVenda = venda;
  const pCusto = custo;
  const pFreteCobrado = clientePagaFrete ? freteCobrado : 0;
  // O frete é sempre um custo logístico real para quem vende, mesmo quando
  // o valor é cobrado do cliente no checkout: a Kairóss repassa esse
  // dinheiro para a transportadora, não fica como lucro do vendedor. Sem
  // isso, "cliente paga o frete" parecia zerar o custo de envio e inflava a
  // margem exibida — conferido byte a byte contra a tela real da Kairóss
  // (venda R$79,90 + frete R$19,90 = total R$99,80 → margem líquida
  // R$23,95, não R$43,85). Quando o vendedor ainda não preencheu
  // `custoFrete` mas está cobrando frete do cliente, usa o valor cobrado
  // como estimativa de custo — é o cenário mais comum (repassa o valor que
  // pagou à transportadora).
  const pCustoFrete = custoFrete > 0 ? custoFrete : pFreteCobrado;

  const totalVenda = pVenda + pFreteCobrado;
  const imposto = totalVenda * impostoPercentual;
  const taxa = totalVenda * taxaPlataformaPercentual + taxaPlataformaFixa;
  const custoTotal = pCusto + imposto + taxa + pCustoFrete;
  const lucro = totalVenda - custoTotal;
  const margem = pVenda > 0 ? (lucro / pVenda) * 100 : 0;

  const status: StatusMargem = lucro <= 0 ? "prejuizo" : margem >= 25 ? "saudavel" : margem >= 15 ? "apertado" : "ruim";

  const precoMin =
    (pCusto + pCustoFrete + pFreteCobrado + taxaPlataformaFixa) /
    (1 - impostoPercentual - taxaPlataformaPercentual);
  const precoRec =
    (pCusto + pCustoFrete + pFreteCobrado + taxaPlataformaFixa) /
    (1 - impostoPercentual - taxaPlataformaPercentual - margemRecomendadaPercentual);

  return {
    lucro,
    margem,
    totalVenda,
    custoTotal,
    custoFreteEfetivo: pCustoFrete,
    status,
    precoMin: Number(precoMin.toFixed(2)),
    precoRec: Number(precoRec.toFixed(2)),
  };
}

export const STATUS_MARGEM_STYLE: Record<
  StatusMargem,
  { bg: string; text: string; border: string; label: string }
> = {
  saudavel: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
    label: "Saudável",
  },
  apertado: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    label: "Apertado",
  },
  ruim: {
    bg: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    label: "Ruim",
  },
  prejuizo: {
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/30",
    label: "Prejuízo",
  },
};

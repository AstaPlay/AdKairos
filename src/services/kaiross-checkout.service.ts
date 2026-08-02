import "server-only";

/**
 * Cliente para o fluxo de checkout PÚBLICO da Kairóss
 * (`pay.kaiross.com.br/backend/...`) — diferente de
 * `kaiross-integration.service.ts`, que fala com a área autenticada do
 * vendedor (`app.kaiross.com.br/api`, exige sessão/cookie do vendedor).
 *
 * Aqui não existe login de vendedor: o comprador é anônimo, identificado só
 * pelo `sessionToken` que a própria Kairóss devolve ao criar o carrinho.
 *
 * MAPEAMENTO NÃO OFICIAL — estes 3 endpoints e seus payloads foram
 * descobertos por captura de tráfego real do checkout público da Kairóss
 * (`pay.kaiross.com.br/{slug}`), não por documentação. Podem mudar sem
 * aviso. Ver detalhes completos e o payload capturado no PR/commit que
 * introduziu este arquivo.
 *
 * O passo de tokenização de cartão (Pagar.me) É INTENCIONALMENTE feito no
 * client, nunca aqui no servidor — ver `checkout-client.tsx`. Isso não é
 * uma omissão: é assim que o número do cartão nunca passa pelo nosso
 * backend, e é o próprio design do Pagar.me (chave pública `pk_...`) que
 * torna isso seguro de fazer no navegador do comprador.
 */

const BASE_URL = "https://pay.kaiross.com.br/backend";
const FETCH_TIMEOUT_MS = 15 * 1000;

async function kairoossCheckoutRequest(endpoint: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(`${BASE_URL}${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
        Origin: "https://pay.kaiross.com.br",
        Referer: "https://pay.kaiross.com.br",
        ...init.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface CriarCarrinhoInput {
  slugCheckout: string;
  quantidade: number;
  nome: string;
  email: string;
  documento: string;
  telefone: string;
}

export interface CriarCarrinhoResult {
  sessionToken: string;
}

/** Passo 1 — POST /backend/vendas/carrinhos. Registra o comprador e reserva o item. */
export async function criarCarrinhoKaiross(input: CriarCarrinhoInput): Promise<CriarCarrinhoResult> {
  const response = await kairoossCheckoutRequest("/vendas/carrinhos", {
    method: "POST",
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Não foi possível reservar o pedido (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as { sessionToken?: string };
  if (!data.sessionToken) {
    throw new Error("A Kairóss não retornou um token de sessão válido.");
  }
  return { sessionToken: data.sessionToken };
}

export interface ClienteCheckout {
  nome: string;
  email: string;
  documento: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  complemento: string | null;
  cidade: string;
  uf: string;
  pais: "BR";
}

export interface ProcessarCheckoutInput {
  slugCheckout: string;
  sessionToken: string;
  compradorEmail: string;
  quantidade: number;
  cliente: ClienteCheckout;
  formaPagamento: "CREDITO" | "PIX";
  parcelas: number;
  cartaoToken: string | null;
  valorFrete: number;
  vendedorAssumeFrete: boolean;
}

export interface ProcessarCheckoutResult {
  status: "aprovado" | "pendente" | "recusado";
  numeroPedido: string | null;
  /** Presente apenas quando `formaPagamento === "PIX"`. */
  pix: { qrCode: string; copiaECola: string; expiraEm: string } | null;
  mensagem: string | null;
}

/**
 * Passo 3 — POST /backend/vendas/checkout. Cria o pedido de fato e
 * processa o pagamento (o token do cartão, gerado no passo 2 no client,
 * já vem pronto aqui — nunca vemos o número do cartão neste servidor).
 */
export async function processarCheckoutKaiross(input: ProcessarCheckoutInput): Promise<ProcessarCheckoutResult> {
  const response = await kairoossCheckoutRequest("/vendas/checkout", {
    method: "POST",
    body: JSON.stringify({
      slugCheckout: input.slugCheckout,
      compradorEmail: input.compradorEmail,
      compradorId: null,
      quantidade: input.quantidade,
      cliente: input.cliente,
      formaPagamento: input.formaPagamento,
      parcelas: input.parcelas,
      cartao: input.cartaoToken ? { token: input.cartaoToken } : null,
      cartao2: null,
      valorCartao2: null,
      valorFrete: input.valorFrete,
      vendedorAssumeFrete: input.vendedorAssumeFrete,
      sessionToken: input.sessionToken,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
    }),
  });

  const data = (await response.json().catch(() => null)) as {
    message?: string;
    numeroPedido?: string;
    pix?: ProcessarCheckoutResult["pix"];
  } | null;

  if (!response.ok) {
    return {
      status: "recusado",
      numeroPedido: null,
      pix: null,
      mensagem: data?.message ?? "Pagamento recusado. Confira os dados ou tente outra forma de pagamento.",
    };
  }

  return {
    status: input.formaPagamento === "PIX" ? "pendente" : "aprovado",
    numeroPedido: data?.numeroPedido ?? null,
    pix: data?.pix ?? null,
    mensagem: null,
  };
}

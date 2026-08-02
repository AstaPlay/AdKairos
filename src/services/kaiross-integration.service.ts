const BASE_URL = "https://app.kaiross.com.br/api";
const FETCH_TIMEOUT_MS = 15 * 1000;
const FETCH_RETRY_COUNT = 1;

// ── Correção de categorias com encoding quebrado — portado 1:1 do proxy original,
// a API de origem tem problemas de charset conhecidos e recorrentes. ──
const CORRECOES_CATEGORIA: [string, string][] = [
  ["Casa, M¨®veis e Decora??o", "Casa, Móveis e Decoração"],
  ["Cal?ados, Roupas e Bolsas", "Calçados, Roupas e Bolsas"],
  ["Calcados, Roupas e Bolsas", "Calçados, Roupas e Bolsas"],
  ["Joias e Rel¨®gios", "Joias e Relógios"],
  ["Rel¨®gios", "Relógios"],
  ["Saude", "Saúde"],
  ["Enfeites e Decora??o da Casa", "Enfeites e Decoração da Casa"],
  ["Ilumina??o Residencial", "Iluminação Residencial"],
  ["Organiza??o para Casa", "Organização para Casa"],
  ["Acess¨®rios de Moda", "Acessórios de Moda"],
  ["Moda Intima e Lingerie", "Moda Íntima e Lingerie"],
];

export function corrigirCategoria(categoria: unknown): string {
  let value = String(categoria ?? "");
  for (const [errado, certo] of CORRECOES_CATEGORIA) {
    value = value.split(errado).join(certo);
  }
  return value;
}

export function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface KairoossSession {
  cookies?: string;
  token?: string;
  email?: string;
  nome?: string;
}

/** Cliente HTTP para a API da Kairóss — timeout, retry em erros transitórios e headers de navegador (a origem exige). */
export async function kairoossRequest(
  endpoint: string,
  session: KairoossSession,
  init: RequestInit = {},
  { retries = FETCH_RETRY_COUNT, timeoutMs = FETCH_TIMEOUT_MS } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Cookie: session.cookies ?? "",
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
    Origin: "https://app.kaiross.com.br",
    Referer: "https://app.kaiross.com.br/vitrine",
  };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (init.headers) Object.assign(headers, init.headers);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...init,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timer);

      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(250 * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      const isAbort = error instanceof Error && error.name === "AbortError";
      if (attempt < retries && isAbort) {
        await sleep(250 * (attempt + 1));
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha na requisição à Kairóss.");
}

export function extractCookies(headers: Headers): string {
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((cookie) => cookie.split(";")[0]).join("; ");
}

/**
 * Formato bruto de produto retornado pela API da Kairóss (nomes de campo em português,
 * mantidos como vêm da origem). Confirmado contra payload real em produção — ver notas:
 * - preço vem em `precoSugerido`, não `preco`.
 * - não existe custo/preço de aquisição no payload do catálogo; `cost` sempre fica 0
 *   (a UI trata `precoSugerido` como referência de preço, nunca como "custo real").
 * - imagens vêm como `imagemPrincipalUrl` (string) + `imagensSecundariasUrls` (string | null),
 *   não como array `imagens`.
 * - não existe `vendas` no catálogo em si — o número real de vendas vem de um endpoint
 *   separado, `GET /produtos/mais-vendidos` (retorna `{ produtoId, quantidadeVendida }[]`),
 *   cruzado aqui por id via `vendasPorProduto` (ver fetchMaisVendidos).
 */
export interface KairoossRawProduct {
  id: string | number;
  nome: string;
  descricao?: string;
  categoria?: string;
  precoSugerido: number;
  estoque?: number;
  imagemPrincipalUrl?: string | null;
  imagensSecundariasUrls?: string | null;
  sku?: string;
  marca?: string;
  internacional?: boolean;
  ativo?: boolean;
  pausadoPorEstoque?: boolean;
}

export function mapKairoossProduct(raw: KairoossRawProduct, vendasPorProduto?: Map<string, number>) {
  const images = [
    ...(raw.imagemPrincipalUrl ? [raw.imagemPrincipalUrl] : []),
    ...(raw.imagensSecundariasUrls
      ? raw.imagensSecundariasUrls
          .split(",")
          .map((url) => url.trim())
          .filter(Boolean)
      : []),
  ];

  return {
    kairoossProductId: String(raw.id),
    name: String(raw.nome ?? ""),
    description: raw.descricao ?? "",
    category: corrigirCategoria(raw.categoria),
    price: Number(raw.precoSugerido) || 0,
    cost: 0, // Não existe no payload real da Kairóss — mantido por compatibilidade de schema.
    stock: Number(raw.estoque) || 0,
    images,
    isInternational: Boolean(raw.internacional),
    isActive: raw.ativo !== false && !raw.pausadoPorEstoque,
    salesCount: vendasPorProduto?.get(String(raw.id)) ?? 0,
    ...(raw.sku ? { sku: raw.sku } : {}),
    ...(raw.marca ? { brand: raw.marca } : {}),
  };
}

/** Item bruto de `GET /produtos/mais-vendidos` — confirmado em produção (scan-output.json). */
export interface KairoossRankingItem {
  produtoId: string | number;
  quantidadeVendida: number;
}

/**
 * Busca o ranking real de vendas e devolve um Map<produtoId, quantidadeVendida>
 * pronto para cruzar com o catálogo. Nunca inventa números: se a chamada falhar
 * ou o endpoint não responder um array, devolve um Map vazio — o chamador então
 * trata "sem dado de vendas" como tal (produto sem selo de popularidade), não
 * como zero vendas.
 */
export async function fetchMaisVendidos(session: KairoossSession): Promise<Map<string, number>> {
  const response = await kairoossRequest("/produtos/mais-vendidos", session, { method: "GET" });
  if (!response.ok) return new Map();

  const raw: unknown = await response.json().catch(() => null);
  if (!Array.isArray(raw)) return new Map();

  return new Map(
    (raw as KairoossRankingItem[]).map((item) => [String(item.produtoId), Number(item.quantidadeVendida) || 0]),
  );
}

/**
 * Item bruto de `GET /seller-produtos` — confirmado em produção contra payload
 * real (meus-produtos-output.json). É a mesma rota usada pelo `POST` de
 * afiliação, o `PUT .../preco`, `.../frete` e o `DELETE`; sem body, faz a
 * listagem de tudo que o vendedor já afiliou. O front da própria Kairóss usa
 * esta chamada como fonte de verdade (queryKey ["seller-produtos", "list"]),
 * então é seguro tratá-la como tal aqui também.
 */
export interface KairoossSellerProduto {
  id: string;
  vendedorId: string;
  produtoId: string;
  fornecedorId?: string;
  precoVenda: number;
  slugCheckout: string;
  checkoutUrl: string;
  ativo: boolean;
  bloqueado: boolean;
  bloqueioMotivo?: string | null;
  vendedorAssumeFrete: boolean;
  /** Campos adicionais confirmados existirem mas não observados por completo (payload de amostra truncado) — mantidos como desconhecidos em vez de assumidos. */
  [key: string]: unknown;
}

/**
 * Busca a lista real de produtos que o vendedor já afiliou na Kairóss —
 * base para a sincronização de exclusão/edição feita direto no painel deles.
 * Nunca lança: se a chamada falhar, devolve null e o chamador decide como
 * lidar com "não consegui confirmar o estado remoto agora" (nunca deve
 * interpretar uma falha de rede como "todos os produtos foram excluídos").
 */
export async function fetchMeusSellerProdutos(session: KairoossSession): Promise<KairoossSellerProduto[] | null> {
  const response = await kairoossRequest("/seller-produtos", session, { method: "GET" });
  if (!response.ok) return null;

  const raw: unknown = await response.json().catch(() => null);
  if (!Array.isArray(raw)) return null;

  return raw as KairoossSellerProduto[];
}

/**
 * Resposta de `GET /vendas/relatorio` — CONFIRMADO EM PRODUÇÃO (capturado via
 * DevTools Network em 2026-07-26, sessão real). São contadores históricos
 * agregados (todo o período, sem filtro de data — a chamada capturada não
 * enviou nenhum query param) e não incluem valores em R$ nem detalhamento
 * por pedido/produto. Não confundir com a lista de pedidos da tela
 * "Pedidos" da Kairóss — essa é outra chamada, ainda não capturada.
 */
export interface KairoossVendasResumo {
  vendedorId: string;
  pagos: number;
  pendentes: number;
  falhas: number;
  reembolsados: number;
  abandonados: number;
}

/**
 * Busca o resumo agregado de vendas (contadores). Nunca lança: se a chamada
 * falhar ou o formato vier diferente do confirmado, devolve null — o
 * chamador trata isso como "não consegui confirmar agora", nunca como
 * "zero vendas".
 */
export async function fetchVendasResumo(session: KairoossSession): Promise<KairoossVendasResumo | null> {
  const response = await kairoossRequest("/vendas/relatorio", session, { method: "GET" });
  if (!response.ok) return null;

  const raw: unknown = await response.json().catch(() => null);
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<KairoossVendasResumo>;
  if (typeof data.vendedorId !== "string") return null;

  return {
    vendedorId: data.vendedorId,
    pagos: Number(data.pagos) || 0,
    pendentes: Number(data.pendentes) || 0,
    falhas: Number(data.falhas) || 0,
    reembolsados: Number(data.reembolsados) || 0,
    abandonados: Number(data.abandonados) || 0,
  };
}

/**
 * Item bruto de `GET /vendas/pedidos` — CONFIRMADO EM PRODUÇÃO (capturado via
 * DevTools Network em 2026-07-26, sessão real, 1 pedido de exemplo real).
 * A chamada capturada foi um GET simples sem query params — parece devolver
 * o histórico completo do vendedor de uma vez (sem paginação/filtro no
 * servidor); os filtros de período/status que aparecem na tela de Pedidos da
 * Kairóss são, então, aplicados no client deles sobre esse mesmo payload.
 *
 * IMPORTANTE: `statusPagamento` só foi observado com o valor `"PENDENTE"` no
 * payload de exemplo. Não sabemos os outros valores possíveis (ex.: o valor
 * usado para "pago") — por isso nunca comparamos contra um valor adivinhado
 * como "PAGO". Qualquer lógica que dependa de "pedido pago" deve tratar
 * "diferente de PENDENTE" como "não confirmado", não como sinônimo de pago.
 */
export interface KairoossPedidoRaw {
  id: string;
  vendedorId: string;
  fornecedorId?: string;
  clienteId?: string;
  clienteNome: string;
  quantidadeTotal: number;
  valorBruto: number;
  valorLiquidoVendedor: number;
  valorImposto?: number;
  valorTaxa?: number;
  valorFrete?: number;
  vendedorAssumeFrete?: boolean;
  custoFornecedorTotal?: number;
  statusPagamento: string;
  formaPagamento?: string;
  itens: Array<{
    id: string;
    produtoId?: string;
    produtoNome: string;
    produtoCodigo?: string;
    imagemPrincipalUrl?: string | null;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
  numeroPedido: string;
  fornecedor?: string;
  codigoRastreio?: string | null;
  statusFornecedor?: string | null;
  integrado?: boolean;
  dataCriacao: string;
  dataPagamento?: string | null;
  dataEnvio?: string | null;
  clienteContato?: {
    email?: string;
    telefone?: string;
    documento?: string;
    cep?: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    complemento?: string;
    cidade?: string;
    uf?: string;
  };
}

/**
 * Busca a lista real de pedidos do vendedor. Nunca lança: se a chamada
 * falhar ou o formato vier diferente do array confirmado, devolve null — o
 * chamador trata isso como "não consegui confirmar agora", nunca como
 * "sem pedidos".
 */
export async function fetchPedidosKaiross(session: KairoossSession): Promise<KairoossPedidoRaw[] | null> {
  const response = await kairoossRequest("/vendas/pedidos", session, { method: "GET" });
  if (!response.ok) return null;

  const raw: unknown = await response.json().catch(() => null);
  if (!Array.isArray(raw)) return null;

  return raw as KairoossPedidoRaw[];
}

export interface OrderTrackingResult {
  /** Status em texto livre, como a origem devolver — não normalizamos porque não sabemos o vocabulário real ainda. */
  status: string;
  trackingCode?: string | null;
  carrier?: string | null;
  estimatedDelivery?: string | null;
  /** Qual endpoint candidato respondeu — útil para logar e depois fixar de vez o endpoint certo. */
  matchedEndpoint: string;
}

/**
 * NÃO CONFIRMADO EM PRODUÇÃO. Não existe documentação pública da API da
 * Kairóss para pedidos/rastreio — só descobrimos os endpoints de produto
 * (`/produtos`, `/seller-produtos`, `/preco`, `/frete`) através dos outros
 * módulos deste serviço, que por sua vez foram descobertos empiricamente
 * (ver comentário em `kaiross/produtos/[id]/route.ts`).
 *
 * Os candidatos abaixo seguem o MESMO padrão de nomenclatura já confirmado
 * (`/seller-produtos/{id}/...`) e são a aposta mais razoável, mas precisam
 * ser validados uma vez contra uma sessão real antes de confiar neles em
 * produção. Assim que um candidato for confirmado, apague os outros e deixe
 * só o que funciona — isso evita 3-4 chamadas de rede por pergunta de
 * cliente no caminho comum.
 *
 * Nunca lança e nunca inventa dado: se todos os candidatos falharem (404,
 * timeout, formato inesperado), devolve null e quem chamou deve tratar como
 * "não consegui confirmar agora" — nunca como "não há pedido".
 */
export async function fetchOrderTrackingStatus(
  session: KairoossSession,
  query: { cpf?: string; orderNumber?: string; phone?: string },
): Promise<OrderTrackingResult | null> {
  if (!query.cpf && !query.orderNumber && !query.phone) return null;

  const params = new URLSearchParams();
  if (query.cpf) params.set("cpf", query.cpf.replace(/\D/g, ""));
  if (query.orderNumber) params.set("pedido", query.orderNumber);
  // Telefone é tentado antes de pedir CPF ao cliente — nem toda origem aceita
  // esse parâmetro, então isso é só mais um candidato; se nenhum endpoint
  // reconhecer, o chamador cai pro fluxo de pedir CPF normalmente.
  if (query.phone) params.set("telefone", query.phone.replace(/\D/g, ""));

  const candidateEndpoints = [
    `/seller-pedidos?${params.toString()}`,
    `/pedidos?${params.toString()}`,
    `/seller-produtos/pedidos?${params.toString()}`,
    `/rastreio?${params.toString()}`,
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await kairoossRequest(endpoint, session, { method: "GET" }, { retries: 0 });
      if (!response.ok) continue;

      const raw: unknown = await response.json().catch(() => null);
      if (!raw || typeof raw !== "object") continue;

      // Formato de saída desconhecido — tentamos os nomes de campo mais prováveis
      // em português (padrão do resto da API) antes de desistir deste candidato.
      const data = raw as Record<string, unknown>;
      const record = Array.isArray(data) ? (data as unknown[])[0] : data;
      if (!record || typeof record !== "object") continue;
      const r = record as Record<string, unknown>;

      const status = r.status ?? r.situacao ?? r.statusPedido;
      if (typeof status !== "string") continue; // não reconhecemos o formato — tenta o próximo candidato

      return {
        status,
        trackingCode: (r.codigoRastreio ?? r.trackingCode ?? r.codigo ?? null) as string | null,
        carrier: (r.transportadora ?? r.carrier ?? null) as string | null,
        estimatedDelivery: (r.previsaoEntrega ?? r.estimatedDelivery ?? null) as string | null,
        matchedEndpoint: endpoint,
      };
    } catch {
      // Endpoint candidato falhou (rede, parse, etc.) — tenta o próximo.
    }
  }

  return null;
}

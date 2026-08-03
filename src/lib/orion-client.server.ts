import "server-only";

const BASE_URL = process.env.ORION_BASE_URL;
const API_KEY = process.env.ORION_SERVICE_API_KEY;
const FETCH_TIMEOUT_MS = 15 * 1000;

/**
 * Faz a chamada HTTP crua ao Órion — timeout via AbortController e
 * header de API key (serviceAuthGuard do lado do Órion), sem
 * conhecimento de provisionamento de owner. Timeout mais curto que o
 * do proxy da Kairóss (kaiross-integration.service.ts, 15s também, mas
 * sem retry automático aqui): o Órion é um serviço próprio, não externo
 * de terceiro sujeito a instabilidade — se falhar, propaga o erro em
 * vez de tentar mascarar com retry silencioso.
 */
async function orionRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY ?? "",
        ...init.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /integrations/owners/provision — cria (ou reaproveita, se já
 * existir) o vínculo externalUserId -> ownerId no Órion. Chamado só
 * por `withOwnerProvisioning` abaixo, nunca diretamente por uma tela;
 * ninguém fora deste arquivo precisa saber que esse endpoint existe.
 */
async function provisionOwner(externalUserId: string): Promise<void> {
  const response = await orionRequest("/integrations/owners/provision", {
    method: "POST",
    body: JSON.stringify({ externalUserId }),
  });
  if (!response.ok) {
    throw new Error(`Falha ao provisionar owner no Órion (HTTP ${response.status})`);
  }
}

/**
 * Detecta especificamente "owner não vinculado" — 404 com o código de
 * erro que o Órion usa só para `ExternalOwnerLinkNotFoundError`
 * (ver mapErrorToHttp no Órion). Qualquer outro 404 (ex.: um id de
 * recurso que não existe) NÃO deve disparar provisionamento — só esse
 * código específico significa "este owner nunca foi provisionado".
 */
async function isOwnerNotLinkedError(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  return body?.error?.code === "EXTERNAL_OWNER_LINK_NOT_FOUND";
}

/**
 * Executa `operation` contra o Órion; se a resposta indicar "owner não
 * vinculado", provisiona o owner uma única vez e repete a MESMA
 * operação uma única vez. Se a segunda tentativa falhar de novo (por
 * qualquer motivo, incluindo o mesmo erro), o erro é propagado sem
 * mais retentativas — evita loop caso o provisionamento não resolva
 * o problema por algum motivo inesperado.
 *
 * Transparente para quem chama: devolve o Response da tentativa que
 * teve sucesso (ou da segunda, se ambas falharam).
 */
async function withOwnerProvisioning(externalUserId: string, operation: () => Promise<Response>): Promise<Response> {
  const response = await operation();
  if (!(await isOwnerNotLinkedError(response))) {
    return response;
  }

  await provisionOwner(externalUserId);
  return operation();
}

export interface HandoffTicket {
  id: string;
  channel: "whatsapp" | "instagram";
  customerId: string;
  reason: "frustration_detected" | "customer_requested";
  customerName: string | null;
  conversationSnippet: string;
  status: "open" | "resolved";
  createdAt: string;
}

interface ListHandoffTicketsResponse {
  tickets: HandoffTicket[];
}

/**
 * GET /integrations/human-handoff/tickets — fila de escaladas abertas
 * do dono identificado por `externalUserId` (Firebase UID). Usa
 * `withOwnerProvisioning`: na primeira chamada de uma conta nova, o
 * Órion ainda não tem vínculo para esse uid — a função acima
 * provisiona e repete a consulta automaticamente, sem que a tela
 * precise saber disso.
 */
export async function fetchOpenHandoffTickets(externalUserId: string): Promise<HandoffTicket[]> {
  const response = await withOwnerProvisioning(externalUserId, () =>
    orionRequest(`/integrations/human-handoff/tickets?externalUserId=${encodeURIComponent(externalUserId)}`),
  );

  if (!response.ok) {
    throw new Error(`Falha ao buscar fila de escaladas no Órion (HTTP ${response.status})`);
  }

  const json = (await response.json()) as ListHandoffTicketsResponse;
  return json.tickets;
}

/**
 * POST /integrations/human-handoff/tickets/:id/reply — envia a
 * resposta do atendente ao cliente (o Órion aplica o prefixo fixo "O
 * atendente respondeu: ...") e marca o ticket como resolvido. Mesmo
 * `withOwnerProvisioning` da listagem acima, pelo mesmo motivo: uma
 * conta nova ainda pode não ter vínculo na primeira chamada.
 */
export async function replyToHandoffTicket(externalUserId: string, ticketId: string, text: string): Promise<void> {
  const response = await withOwnerProvisioning(externalUserId, () =>
    orionRequest(`/integrations/human-handoff/tickets/${encodeURIComponent(ticketId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ externalUserId, text }),
    }),
  );

  if (!response.ok) {
    throw new Error(`Falha ao responder ticket de escalada no Órion (HTTP ${response.status})`);
  }
}

export type WhatsAppSessionStatus =
  | "PENDING_QR"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "LOGGED_OUT"
  | "BANNED"
  | "CORRUPTED";

export interface WhatsAppSessionSummary {
  id: string;
  status: WhatsAppSessionStatus;
  ownerPhoneNumber: string | null;
  createdAt: string;
  metadata: {
    deviceName?: string;
    lastConnectedAt?: string;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
  };
}

export interface WhatsAppSessionDetail extends WhatsAppSessionSummary {
  qrCode: string | null;
  pairingCode: string | null;
}

/**
 * Faz uma chamada ao Órion autenticada por Bearer token (rotas
 * `authGuard`, diferente das de human-handoff que usam `x-api-key`
 * de serviço). Troca o token pelo `getServiceAccessToken` acima e já
 * aplica `withOwnerProvisioning`-like: se o owner ainda não existe, o
 * Órion nunca chegaria a emitir token (ver `getServiceAccessToken`,
 * que já provisiona internamente), então um único request basta aqui.
 */
async function orionAuthedRequest(externalUserId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getServiceAccessToken(externalUserId);
  return orionRequest(path, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  });
}

/**
 * GET /sessions — todas as sessões WhatsApp do dono, qualquer status.
 * Base para a tela listar sessões existentes sem precisar guardar ids
 * no lado do AdKairos.
 */
export async function listWhatsAppSessions(externalUserId: string): Promise<WhatsAppSessionSummary[]> {
  const response = await orionAuthedRequest(externalUserId, "/sessions");
  if (!response.ok) {
    throw new Error(`Falha ao listar sessões do WhatsApp no Órion (HTTP ${response.status})`);
  }
  const json = (await response.json()) as { sessions: WhatsAppSessionSummary[] };
  return json.sessions;
}

/**
 * POST /sessions — cria uma nova sessão (nasce em PENDING_QR, sem
 * socket aberto ainda). O QR só é gerado depois de `connectWhatsAppSession`.
 */
export async function createWhatsAppSession(
  externalUserId: string,
): Promise<{ id: string; status: WhatsAppSessionStatus }> {
  const response = await orionAuthedRequest(externalUserId, "/sessions", { method: "POST" });
  if (!response.ok) {
    throw new Error(`Falha ao criar sessão do WhatsApp no Órion (HTTP ${response.status})`);
  }
  return (await response.json()) as { id: string; status: WhatsAppSessionStatus };
}

/**
 * POST /sessions/:id/connect — dispara a conexão real (abre o socket
 * Baileys no worker). Sem `phoneNumber`: gera QR code. Com
 * `phoneNumber`: gera pairing code (número no formato internacional,
 * ex. "5511999999999", sem "+"). 202 = enfileirado; o resultado real
 * (QR/pairing code, ou CONNECTED) chega via polling de `getWhatsAppSession`.
 */
export async function connectWhatsAppSession(
  externalUserId: string,
  sessionId: string,
  phoneNumber?: string,
): Promise<void> {
  const response = await orionAuthedRequest(externalUserId, `/sessions/${encodeURIComponent(sessionId)}/connect`, {
    method: "POST",
    body: JSON.stringify(phoneNumber ? { phoneNumber } : {}),
  });
  if (!response.ok) {
    throw new Error(`Falha ao conectar sessão do WhatsApp no Órion (HTTP ${response.status})`);
  }
}

/**
 * GET /sessions/:id — status atual + QR/pairing code, se ainda
 * válidos (o Órion já filtra QR expirado — ver rota `session-routes.ts`).
 * Pensada para polling curto (2-3s) enquanto status === PENDING_QR.
 */
export async function getWhatsAppSession(externalUserId: string, sessionId: string): Promise<WhatsAppSessionDetail> {
  const response = await orionAuthedRequest(externalUserId, `/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new Error(`Falha ao buscar sessão do WhatsApp no Órion (HTTP ${response.status})`);
  }
  return (await response.json()) as WhatsAppSessionDetail;
}

export type SentMessageJobStatus = "pending" | "processing" | "done" | "failed";
export type MessageDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface SentMessageRecord {
  id: string;
  toJid: string;
  type: "text" | "image" | "video" | "document" | "audio" | "contact" | "location" | "buttons";
  status: SentMessageJobStatus;
  deliveryStatus: MessageDeliveryStatus | null;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
}

/**
 * GET /sessions/:id/messages — histórico de envios da sessão (fila de
 * jobs do Órion, mais recentes primeiro, até 50 registros).
 */
export async function listSentMessages(externalUserId: string, sessionId: string): Promise<SentMessageRecord[]> {
  const response = await orionAuthedRequest(externalUserId, `/sessions/${encodeURIComponent(sessionId)}/messages`);
  if (!response.ok) {
    throw new Error(`Falha ao buscar histórico de mensagens no Órion (HTTP ${response.status})`);
  }
  const json = (await response.json()) as { messages: SentMessageRecord[] };
  return json.messages;
}

/**
 * POST /sessions/:id/messages — envia uma mensagem de texto pela sessão
 * WhatsApp indicada. `toJid` é o destinatário no formato do WhatsApp
 * (ex. "5511999999999@s.whatsapp.net"). 202 = enfileirado no worker;
 * não confirma entrega real, só que o job entrou na fila (ver
 * `listSentMessages` para acompanhar o status do job depois).
 *
 * V1 só cobre `type: "text"` — os demais tipos do schema do Órion
 * (image/video/document/audio/contact/location) exigem upload/mídia,
 * fora do escopo desta função.
 */
export async function sendWhatsAppMessage(
  externalUserId: string,
  sessionId: string,
  toJid: string,
  content: string,
): Promise<void> {
  const response = await orionAuthedRequest(externalUserId, `/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ toJid, type: "text", content }),
  });
  if (!response.ok) {
    throw new Error(`Falha ao enviar mensagem do WhatsApp no Órion (HTTP ${response.status})`);
  }
}

/**
 * POST /sessions/:id/disconnect — pede logout intencional da sessão
 * (worker derruba o socket Baileys). 202 = enfileirado; o status real
 * (LOGGED_OUT) chega via `getWhatsAppSession`/`listWhatsAppSessions`
 * depois que o worker processar. Sessão fica pronta para reconectar
 * com um novo QR/pairing code, não é excluída do banco.
 */
export async function disconnectWhatsAppSession(externalUserId: string, sessionId: string): Promise<void> {
  const response = await orionAuthedRequest(externalUserId, `/sessions/${encodeURIComponent(sessionId)}/disconnect`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Falha ao desconectar sessão do WhatsApp no Órion (HTTP ${response.status})`);
  }
}

export interface BotConfig {
  ownerId: string;
  agentName: string;
  triggerKeywords: string[];
  isBotReply: string;
  audioFallbackReply: string;
  retryLimit: number;
  retryIntervalHours: number;
  extraInstructions: string | null;
  objectionPlaybook: string | null;
  maxAutonomousDiscountPercent: number;
  businessHoursStart: number;
  businessHoursEnd: number;
  businessTimezone: string;
  shadowMode: boolean;
  reactivationEnabled: boolean;
  reactivationInactiveDays: number;
  reactivationMessage: string;
  isActive: boolean;
  maxRepeatedCommentRepliesPerAuthor: number;
  checkoutAbandonedFollowUpEnabled: boolean;
  checkoutAbandonedFollowUpDays: number;
  checkoutAbandonedFollowUpMessage: string;
}

export type UpdateBotConfigInput = Omit<BotConfig, "ownerId">;

/**
 * GET /bot-config — configuração do bot de atendimento do dono
 * autenticado. Sem `:id` na rota do Órion: `ownerId` vem do próprio
 * token (ver `atendimento-routes.ts`). Devolve os valores padrão se o
 * owner ainda não tiver salvo nada (o Órion não persiste nada só de
 * ler — só grava no primeiro PUT).
 */
export async function getBotConfig(externalUserId: string): Promise<BotConfig> {
  const response = await orionAuthedRequest(externalUserId, "/bot-config");
  if (!response.ok) {
    throw new Error(`Falha ao buscar configuração do bot no Órion (HTTP ${response.status})`);
  }
  const json = (await response.json()) as { config: BotConfig };
  return json.config;
}

/**
 * PUT /bot-config — substitui a configuração inteira (upsert). Replace
 * completo, não merge parcial: sempre manda o formulário inteiro.
 */
export async function updateBotConfig(externalUserId: string, input: UpdateBotConfigInput): Promise<BotConfig> {
  const response = await orionAuthedRequest(externalUserId, "/bot-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Falha ao salvar configuração do bot no Órion (HTTP ${response.status})`);
  }
  const json = (await response.json()) as { config: BotConfig };
  return json.config;
}

interface ServiceTokenCacheEntry {
  accessToken: string;
  /** Epoch ms a partir do qual o token é considerado vencido para fins de cache (antes do vencimento real do Órion). */
  refreshAfter: number;
}

const serviceTokenCache = new Map<string, ServiceTokenCacheEntry>();

/**
 * Margem de segurança subtraída do `expiresInSeconds` devolvido pelo
 * Órion (15min hoje) — evita usar um token que expira nos próximos
 * segundos e falhar por uma corrida entre o cache e a rede.
 */
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

/**
 * POST /integrations/owners/service-token — troca por um access token
 * (JWT, role "owner") válido nas rotas `authGuard` do Órion
 * (super-cerebro/*, sessions/*), que usam Bearer token em vez de
 * `x-api-key`. Cacheado em memória do processo por externalUserId até
 * pouco antes do vencimento real — evita pedir um token novo a cada
 * chamada, sem guardar nada em disco/banco (não há sessão de usuário
 * de verdade para persistir aqui).
 *
 * NÃO passa por `withOwnerProvisioning`: se o owner ainda não existe,
 * o Órion devolve o mesmo erro "owner não vinculado" que as outras
 * rotas — provisiona e tenta de novo, mesma lógica, só que aqui built-in
 * porque o retry precisa re-emitir o token, não só repetir a chamada.
 */
export async function getServiceAccessToken(externalUserId: string): Promise<string> {
  const cached = serviceTokenCache.get(externalUserId);
  if (cached && Date.now() < cached.refreshAfter) {
    return cached.accessToken;
  }

  const issue = async (): Promise<Response> =>
    orionRequest("/integrations/owners/service-token", {
      method: "POST",
      body: JSON.stringify({ externalUserId }),
    });

  let response = await issue();
  if (await isOwnerNotLinkedError(response)) {
    await provisionOwner(externalUserId);
    response = await issue();
  }

  if (!response.ok) {
    throw new Error(`Falha ao emitir token de serviço no Órion (HTTP ${response.status})`);
  }

  const json = (await response.json()) as { accessToken: string; expiresInSeconds: number };
  serviceTokenCache.set(externalUserId, {
    accessToken: json.accessToken,
    refreshAfter: Date.now() + Math.max(0, json.expiresInSeconds - TOKEN_REFRESH_MARGIN_SECONDS) * 1000,
  });

  return json.accessToken;
}

import "server-only";

/**
 * Client para o serviço Enxame — pool de IA (Groq/Gemini + Tavily) hospedado
 * separadamente no Render (https://enxame.onrender.com), com Supabase como
 * armazenamento das chaves/uso. Usado pelo AdKairos para features de IA
 * (gerarKeywords, pesquisa de mercado na sugestão de preço) via a rota
 * enxuta `POST /generate` do Enxame.
 *
 * O Enxame tem cron-job.org batendo em `/health` a cada 15 min — não sofre
 * cold start do Render free, então o timeout aqui é curto (chamada real de
 * LLM, não "acordar" o serviço).
 */

const ENXAME_API_URL = process.env.ENXAME_API_URL ?? "https://enxame.onrender.com";
const ENXAME_API_KEY = process.env.ENXAME_API_KEY;
const DEFAULT_TIMEOUT_MS = 12_000;

export interface EnxameGenerateParams {
  /** Mensagem/pergunta principal enviada ao pool. */
  prompt: string;
  /** Instrução de sistema opcional (persona, formato de saída, etc.). */
  systemPrompt?: string;
  /** Rótulo da feature de origem — aparece no log de uso do Enxame. */
  feature: string;
  /** Timeout específico para essa chamada, em ms. */
  timeoutMs?: number;
}

export interface EnxameGenerateResult {
  text: string;
  provider: string;
  keyId: string;
  attempts: number;
}

/**
 * Chama `POST /generate` no Enxame. Lança em caso de falha — quem chama
 * decide o fallback (nunca deixe isso quebrar a resposta ao usuário; sempre
 * envolva em try/catch e caia num fallback local determinístico).
 */
export async function callEnxame({
  prompt,
  systemPrompt,
  feature,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: EnxameGenerateParams): Promise<EnxameGenerateResult> {
  if (!ENXAME_API_KEY) {
    throw new Error("ENXAME_API_KEY não configurada — defina no ambiente para habilitar features de IA do Enxame.");
  }

  if (prompt.length > 4000 || (systemPrompt?.length ?? 0) > 4000) {
    throw new Error("Prompt excede o limite de tamanho permitido para o Enxame.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ENXAME_API_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENXAME_API_KEY}`,
      },
      body: JSON.stringify({ prompt, systemPrompt, feature }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Enxame respondeu ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = (await response.json()) as EnxameGenerateResult;
    if (!data.text) {
      throw new Error("Enxame respondeu sem 'text' no corpo.");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/** true se a integração com o Enxame está configurada neste ambiente. */
export function isEnxameConfigured(): boolean {
  return Boolean(ENXAME_API_KEY);
}

// ---------------------------------------------------------------------------
// Funções de administração/observabilidade — usadas pelas telas "Central de
// IA" e "Configurações". Todas fazem fetch server-side (a ENXAME_API_KEY
// nunca chega ao navegador do usuário) e nunca lançam: em caso de falha,
// devolvem um valor "vazio" seguro para a UI renderizar um estado de erro
// sem quebrar a página inteira.
// ---------------------------------------------------------------------------

async function enxameGet<T>(
  path: string,
  timeoutMs = 8_000,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!ENXAME_API_KEY) {
    return { ok: false, error: "ENXAME_API_KEY não configurada." };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ENXAME_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${ENXAME_API_KEY}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, error: `Enxame respondeu ${response.status}` };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao contatar o Enxame." };
  } finally {
    clearTimeout(timeout);
  }
}

export interface EnxameHealth {
  status: string;
  uptime: number;
}

/** GET /health — não exige auth no Enxame, mas mandamos o header mesmo assim por consistência. */
export async function getEnxameHealth(): Promise<{
  online: boolean;
  uptimeSeconds: number | null;
  error: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`${ENXAME_API_URL}/health`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { online: false, uptimeSeconds: null, error: `status ${response.status}` };
    const data = (await response.json()) as EnxameHealth;
    return { online: data.status === "ok", uptimeSeconds: data.uptime ?? null, error: null };
  } catch (error) {
    return { online: false, uptimeSeconds: null, error: error instanceof Error ? error.message : "offline" };
  } finally {
    clearTimeout(timeout);
  }
}

export interface EnxamePoolStats {
  total: number;
  available: number;
  cooldown: number;
  disabled: number;
  [key: string]: unknown;
}

/** GET /admin/pool — estatísticas agregadas do pool de chaves. */
export async function getEnxamePoolStats() {
  return enxameGet<EnxamePoolStats>("/admin/pool");
}

export interface EnxameKeyView {
  id: string;
  provider: "groq" | "gemini";
  model: string | null;
  state: "available" | "cooldown" | "disabled";
  cooldownUntil: string | null;
  lastUsedAt: string | null;
  totalCalls: number;
  totalErrors: number;
  createdAt: string;
  apiKeyPreview: string | null;
}

/** GET /admin/keys — nunca inclui o valor real da chave, só um preview mascarado. */
export async function getEnxameKeys() {
  return enxameGet<EnxameKeyView[]>("/admin/keys");
}

export interface EnxameUsageItem {
  provider: string;
  model: string | null;
  feature: string | null;
  success: boolean;
  latency_ms: number | null;
  created_at: string;
}

/** GET /admin/usage — log de uso das últimas N horas (default 24, máx 30 dias). */
export async function getEnxameUsage(hours = 24) {
  return enxameGet<{ items: EnxameUsageItem[]; sinceHours: number }>(`/admin/usage?hours=${hours}`);
}

interface EnxameActionResult {
  ok: boolean;
  error?: string;
}

async function enxameMutate(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<EnxameActionResult> {
  if (!ENXAME_API_KEY) {
    return { ok: false, error: "ENXAME_API_KEY não configurada." };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${ENXAME_API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${ENXAME_API_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}) as { error?: string });
      return { ok: false, error: errorBody.error ?? `Enxame respondeu ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao contatar o Enxame." };
  } finally {
    clearTimeout(timeout);
  }
}

/** POST /admin/keys — cadastra uma nova chave Groq/Gemini no pool. */
export async function addEnxameKey(input: { id: string; provider: "groq" | "gemini"; apiKey: string; model?: string }) {
  return enxameMutate("/admin/keys", "POST", input);
}

/** PATCH /admin/keys/:id — ativa/desativa uma chave ou troca o modelo. */
export async function updateEnxameKey(id: string, patch: { state?: "available" | "disabled"; model?: string }) {
  return enxameMutate(`/admin/keys/${encodeURIComponent(id)}`, "PATCH", patch);
}

/** DELETE /admin/keys/:id — remove uma chave do pool permanentemente. */
export async function deleteEnxameKey(id: string) {
  return enxameMutate(`/admin/keys/${encodeURIComponent(id)}`, "DELETE");
}

import type {
  AnalyzeAdsPerformanceResult,
  AnalyzeInstagramPerformanceResult,
  ContentScriptFormat,
  GenerateContentScriptResult,
  GenerateSocialContentResult,
  GenerateStrategicDiagnosisResult,
  ProductOption,
  SocialContentGoal,
  StrategyAttemptSignal,
} from "./types";

interface ApiEnvelope<T> {
  success: boolean;
  error?: { code: string; message: string };
  result?: T;
  productId?: string;
  data?: { products: ProductOption[]; total: number };
}

async function callSuperCerebro<T>(action: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/integrations/orion/super-cerebro/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !json.success || !json.result) {
    throw new Error(json.error?.message ?? "Falha ao chamar o Super Cérebro.");
  }
  return json.result;
}

export function analyzeInstagramPerformance(input: {
  periodStart: string;
  periodEnd: string;
  limit?: number;
}): Promise<AnalyzeInstagramPerformanceResult> {
  return callSuperCerebro<AnalyzeInstagramPerformanceResult>("analyze-instagram-performance", input);
}

export function analyzeAdsPerformance(input: {
  periodStart: string;
  periodEnd: string;
}): Promise<AnalyzeAdsPerformanceResult> {
  return callSuperCerebro<AnalyzeAdsPerformanceResult>("analyze-ads-performance", input);
}

export function generateStrategicDiagnosis(input: {
  instagramDiagnosis: string | null;
  adsDiagnosis: string | null;
  signal: StrategyAttemptSignal;
}): Promise<GenerateStrategicDiagnosisResult> {
  return callSuperCerebro<GenerateStrategicDiagnosisResult>("generate-strategic-diagnosis", input);
}

export function generateSocialContent(input: {
  productName: string;
  productDescription: string | null;
  brandTone: string | null;
  goal: SocialContentGoal;
}): Promise<GenerateSocialContentResult> {
  return callSuperCerebro<GenerateSocialContentResult>("generate-social-content", input);
}

export function generateContentScript(input: {
  productId: string;
  strategicContext: string | null;
  brandTone: string | null;
}): Promise<GenerateContentScriptResult> {
  return callSuperCerebro<GenerateContentScriptResult>("generate-content-script", input);
}

/** GET /api/produtos — catálogo local (Firestore) do dono, para o seletor de produto do roteiro de conteúdo. */
export async function listProductOptions(): Promise<ProductOption[]> {
  const response = await fetch("/api/produtos");
  const json = (await response.json()) as ApiEnvelope<never>;
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? "Falha ao listar produtos.");
  }
  return json.data.products;
}

/** GET /api/integrations/orion/products/by-external-id/:externalId — resolve o productId (UUID Supabase) a partir do id Firestore. */
export async function resolveProductId(externalId: string): Promise<string> {
  const response = await fetch(`/api/integrations/orion/products/by-external-id/${encodeURIComponent(externalId)}`);
  const json = (await response.json()) as ApiEnvelope<never>;
  if (!response.ok || !json.success || !json.productId) {
    throw new Error(json.error?.message ?? "Este produto ainda não foi sincronizado com o Órion.");
  }
  return json.productId;
}

export const CONTENT_SCRIPT_FORMAT_LABEL: Record<ContentScriptFormat, string> = {
  reels: "Reels",
  static_post: "Post estático",
};

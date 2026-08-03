import type { AdCampaignSummary } from "./types";

interface ApiEnvelope {
  success: boolean;
  error?: { code: string; message: string };
  adAccountId?: string;
  campaigns?: AdCampaignSummary[];
}

/** PUT /api/integrations/orion/ads/account — configura o Ad Account (formato "act_<id>") do owner. */
export async function configureAdAccount(adAccountId: string): Promise<string> {
  const response = await fetch("/api/integrations/orion/ads/account", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId }),
  });
  const json = (await response.json()) as ApiEnvelope;
  if (!response.ok || !json.success || !json.adAccountId) {
    throw new Error(json.error?.message ?? "Falha ao salvar a conta de anúncios.");
  }
  return json.adAccountId;
}

/** GET /api/integrations/orion/ads/campaigns — campanhas com métricas cruas do período, sem análise de IA. */
export async function listAdCampaigns(input: { periodStart: string; periodEnd: string }): Promise<AdCampaignSummary[]> {
  const params = new URLSearchParams(input);
  const response = await fetch(`/api/integrations/orion/ads/campaigns?${params.toString()}`);
  const json = (await response.json()) as ApiEnvelope;
  if (!response.ok || !json.success || !json.campaigns) {
    throw new Error(json.error?.message ?? "Falha ao listar campanhas de Ads.");
  }
  return json.campaigns;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export type AdCampaignObjective = "SALES" | "TRAFFIC" | "ENGAGEMENT" | "LEADS" | "AWARENESS" | "OTHER";
export type AdCampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

export interface AdCampaignSummary {
  id: string;
  name: string;
  objective: AdCampaignObjective;
  status: AdCampaignStatus;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number | null;
  cpa: number | null;
  conversions: number | null;
}

export const OBJECTIVE_LABEL: Record<AdCampaignObjective, string> = {
  SALES: "Vendas",
  TRAFFIC: "Tráfego",
  ENGAGEMENT: "Engajamento",
  LEADS: "Leads",
  AWARENESS: "Reconhecimento",
  OTHER: "Outro",
};

export const STATUS_LABEL: Record<AdCampaignStatus, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  DELETED: "Excluída",
  ARCHIVED: "Arquivada",
};

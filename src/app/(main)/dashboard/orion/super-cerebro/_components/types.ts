export interface AnalyzeInstagramPerformanceResult {
  diagnosis: string;
  topPostIds: string[];
  weakestPostIds: string[];
}

export interface AnalyzeAdsPerformanceResult {
  diagnosis: string;
  bestCampaignIds: string[];
  worstCampaignIds: string[];
}

export type StrategyAttemptSignal = "weak_post" | "lost_sale" | "recurring_objection" | "successful_pattern";

export interface GenerateStrategicDiagnosisResult {
  recommendation: string;
  attempt: {
    id: string;
    status: "pending" | "applied" | "discarded";
    createdAt: string;
  };
}

export type SocialContentGoal = "drive_dm" | "drive_link_click" | "boost_engagement";

export interface GenerateSocialContentResult {
  caption: string;
  callToAction: string;
}

export type ContentScriptFormat = "reels" | "static_post";

export interface ContentScriptScene {
  order: number;
  visualDirection: string;
  narration: string;
}

export interface GenerateContentScriptResult {
  format: ContentScriptFormat;
  formatRationale: string;
  scenes: ContentScriptScene[];
  caption: string;
}

export interface ProductOption {
  id: string;
  name: string;
  description?: string;
}

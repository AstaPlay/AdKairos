export interface BotConfigFormState {
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

import type { BotConfigFormState } from "./types";

export async function fetchBotConfig(): Promise<BotConfigFormState> {
  const response = await fetch("/api/integrations/orion/bot-config");
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar a configuração do bot agora.");
  return json.config as BotConfigFormState;
}

export async function saveBotConfig(input: BotConfigFormState): Promise<BotConfigFormState> {
  const response = await fetch("/api/integrations/orion/bot-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível salvar a configuração do bot agora.");
  return json.config as BotConfigFormState;
}

export interface InstagramConnectionStatus {
  connected: boolean;
  igUserId?: string;
  username?: string;
  tokenExpiresAt?: string;
}

export async function fetchInstagramConnection(): Promise<InstagramConnectionStatus> {
  const response = await fetch("/api/integrations/orion/instagram/connection");
  const json = await response.json();
  if (!json.success)
    throw new Error(json.error?.message ?? "Não foi possível buscar o status da conexão com Instagram agora.");
  return json.status as InstagramConnectionStatus;
}

export async function disconnectInstagram(): Promise<void> {
  const response = await fetch("/api/integrations/orion/instagram/connection", { method: "DELETE" });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível desconectar o Instagram agora.");
}

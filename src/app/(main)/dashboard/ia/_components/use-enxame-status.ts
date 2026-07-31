"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnxamePoolStats, EnxameUsageItem } from "@/lib/enxame-client";

export interface EnxameStatusData {
  configured: boolean;
  health: { online: boolean; uptimeSeconds: number | null; error: string | null } | null;
  pool: EnxamePoolStats | null;
  poolError?: string | null;
  usage: { items: EnxameUsageItem[]; sinceHours: number } | null;
  usageError?: string | null;
}

interface UseEnxameStatusResult {
  data: EnxameStatusData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Busca `/api/ai/enxame/status` e refaz a cada 30s enquanto a página estiver aberta. */
export function useEnxameStatus(): UseEnxameStatusResult {
  const [data, setData] = useState<EnxameStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/enxame/status", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error?.message ?? "Não foi possível carregar o status do Enxame.");
        return;
      }
      setData(json.data);
      setError(null);
    } catch {
      setError("Falha de rede ao buscar o status do Enxame.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { data, loading, error, refresh: fetchStatus };
}

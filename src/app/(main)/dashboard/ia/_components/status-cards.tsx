"use client";

import { Activity, AlertTriangle, Key, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { EnxameStatusData } from "./use-enxame-status";

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

interface StatusCardsProps {
  data: EnxameStatusData | null;
  loading: boolean;
}

export function StatusCards({ data, loading }: StatusCardsProps) {
  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders, ordem fixa
          <Skeleton key={i} className="h-[132px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            Enxame não configurado
          </CardTitle>
          <CardDescription>
            Defina <code className="rounded bg-muted px-1 py-0.5 text-xs">ENXAME_API_KEY</code> e{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">ENXAME_API_URL</code> nas variáveis de ambiente para
            ativar as features de IA.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { health, pool, usage } = data;
  const totalCalls24h = usage?.items.length ?? 0;
  const successRate =
    usage && usage.items.length > 0
      ? Math.round((usage.items.filter((item) => item.success).length / usage.items.length) * 100)
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Activity className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Status do serviço</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl leading-none tracking-tight">
              {health?.online ? "Online" : "Offline"}
            </div>
            <Badge variant={health?.online ? "default" : "destructive"}>
              <span
                className={`size-1.5 rounded-full ${health?.online ? "bg-primary-foreground" : "bg-destructive-foreground"}`}
              />
              {health?.online ? "ativo" : "indisponível"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">Uptime: {formatUptime(health?.uptimeSeconds ?? null)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Key className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Chaves disponíveis</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {pool ? `${pool.available}/${pool.total}` : "—"}
            </div>
            {pool && pool.cooldown > 0 && <Badge variant="secondary">{pool.cooldown} em cooldown</Badge>}
            {pool && pool.disabled > 0 && <Badge variant="destructive">{pool.disabled} desativadas</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">Pool Groq + Gemini</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Zap className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Chamadas (24h)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{totalCalls24h}</div>
          </div>
          <p className="text-muted-foreground text-sm">gerarKeywords + sugestão de preço</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Activity className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Taxa de sucesso</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {successRate === null ? "—" : `${successRate}%`}
            </div>
            {successRate !== null && (
              <Badge variant={successRate >= 90 ? "default" : successRate >= 70 ? "secondary" : "destructive"}>
                {successRate >= 90 ? "saudável" : successRate >= 70 ? "atenção" : "crítico"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Últimas 24h de uso</p>
        </CardContent>
      </Card>
    </div>
  );
}

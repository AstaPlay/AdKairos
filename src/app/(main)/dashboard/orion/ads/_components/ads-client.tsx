"use client";

import * as React from "react";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAsyncAction } from "@/hooks/use-async-action";

import { configureAdAccount, formatCurrency, formatPercent, listAdCampaigns } from "./ads-api";
import { type AdCampaignStatus, OBJECTIVE_LABEL, STATUS_LABEL } from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function statusVariant(status: AdCampaignStatus): "default" | "secondary" | "outline" {
  if (status === "ACTIVE") return "default";
  if (status === "PAUSED") return "secondary";
  return "outline";
}

/** Form de configuração do Ad Account — exige Instagram/Meta já conectado (o Órion devolve 409 se não houver). */
function AdAccountConfigCard({ onConfigured }: { onConfigured: () => void }) {
  const [adAccountId, setAdAccountId] = React.useState("");
  const action = useAsyncAction(configureAdAccount);

  async function handleSave() {
    const trimmed = adAccountId.trim();
    if (!/^act_\d+$/.test(trimmed)) {
      toast.error(
        'Formato inválido — use "act_" seguido do ID numérico da conta (encontrado no Gerenciador de Anúncios).',
      );
      return;
    }
    const result = await action.execute(trimmed);
    if (result) {
      toast.success("Conta de anúncios configurada.");
      onConfigured();
    } else if (action.error) {
      toast.error(action.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conta de anúncios</CardTitle>
        <CardDescription>
          Informe o ID da sua conta de anúncios Meta (Gerenciador de Anúncios → Configurações da conta). Requer o
          Instagram já conectado, já que usa a mesma autenticação.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="ad-account-id">ID da conta de anúncios</Label>
          <Input
            id="ad-account-id"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            placeholder="act_123456789"
          />
        </div>
        <Button onClick={handleSave} disabled={action.isLoading} className="sm:w-fit">
          {action.isLoading && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

function CampaignsTable() {
  const [periodStart, setPeriodStart] = React.useState(thirtyDaysAgoIso());
  const [periodEnd, setPeriodEnd] = React.useState(todayIso());
  const action = useAsyncAction(listAdCampaigns);
  const { execute } = action;

  const fetchPeriod = React.useCallback(
    (start: string, end: string) => {
      void execute({ periodStart: start, periodEnd: end });
    },
    [execute],
  );

  React.useEffect(() => {
    // Busca inicial: usa os mesmos valores padrão passados a useState
    // acima (não o state em si, para não precisar dele nas deps e
    // acabar reexecutando a cada tecla digitada nos inputs de data).
    fetchPeriod(thirtyDaysAgoIso(), todayIso());
  }, [fetchPeriod]);

  function handleManualFetch() {
    fetchPeriod(periodStart, periodEnd);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Campanhas</CardTitle>
        <CardDescription>
          Métricas cruas do período — sem análise de IA (para diagnóstico, use o Super Cérebro).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ads-period-start">Início</Label>
            <Input
              id="ads-period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ads-period-end">Fim</Label>
            <Input id="ads-period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <Button variant="outline" onClick={handleManualFetch} disabled={action.isLoading} className="sm:w-fit">
            {action.isLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Buscar
          </Button>
        </div>

        {action.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!action.isLoading && action.error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {action.error}
          </div>
        )}

        {!action.isLoading && !action.error && action.data && action.data.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhuma campanha encontrada no período.</p>
        )}

        {!action.isLoading && !action.error && action.data && action.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Objetivo</TableHead>
                <TableHead className="text-right">Investimento</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">CPA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {action.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>{STATUS_LABEL[c.status]}</Badge>
                  </TableCell>
                  <TableCell>{OBJECTIVE_LABEL[c.objective]}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.spend)}</TableCell>
                  <TableCell className="text-right">{c.clicks}</TableCell>
                  <TableCell className="text-right">{formatPercent(c.ctr)}</TableCell>
                  <TableCell className="text-right">{c.cpc !== null ? formatCurrency(c.cpc) : "—"}</TableCell>
                  <TableCell className="text-right">{c.cpa !== null ? formatCurrency(c.cpa) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function AdsClient() {
  const [configVersion, setConfigVersion] = React.useState(0);

  return (
    <div className="flex flex-col gap-4">
      <AdAccountConfigCard onConfigured={() => setConfigVersion((v) => v + 1)} />
      <CampaignsTable key={configVersion} />
    </div>
  );
}

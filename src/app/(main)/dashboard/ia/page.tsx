"use client";

import Link from "next/link";
import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentCallsTable } from "./_components/recent-calls-table";
import { StatusCards } from "./_components/status-cards";
import { UsageChart } from "./_components/usage-chart";
import { useEnxameStatus } from "./_components/use-enxame-status";

export default function Page() {
  const { data, loading, error, refresh } = useEnxameStatus();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Central de IA</h1>
          <p className="text-muted-foreground text-sm">Saúde, uso e desempenho do Enxame em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/ia/configuracoes">
              <Settings2 className="size-4" />
              Configurações
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      )}

      <StatusCards data={data} loading={loading} />

      <UsageChart items={data?.usage?.items ?? null} loading={loading} />

      <RecentCallsTable items={data?.usage?.items ?? null} loading={loading} />
    </div>
  );
}

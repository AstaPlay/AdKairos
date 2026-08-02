"use client";

import * as React from "react";

import Link from "next/link";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAsyncAction } from "@/hooks/use-async-action";
import { formatCurrency } from "@/lib/utils";

interface PedidoRow {
  id: string;
  numeroPedido: string;
  dataCriacao: string;
  clienteNome: string;
  formaPagamento: string | null;
  valorBruto: number;
  valorLiquidoVendedor: number;
  statusPagamento: string;
  statusFornecedor: string | null;
  codigoRastreio: string | null;
  produtos: string[];
}

interface PedidosResponse {
  resumo: {
    vendedorId: string;
    pagos: number;
    pendentes: number;
    falhas: number;
    reembolsados: number;
    abandonados: number;
  } | null;
  orders: PedidoRow[] | null;
}

async function fetchPedidos(): Promise<PedidosResponse> {
  const response = await fetch("/api/integrations/kaiross/pedidos");
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar seus pedidos agora.");
  return json.data as PedidosResponse;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  caption,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  caption?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "gap-2 border-amber-500/40 bg-amber-500/5 py-4" : "gap-2 py-4"}>
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-4">
        <Icon className={highlight ? "size-4 text-amber-600 dark:text-amber-400" : "size-4 text-muted-foreground"} />
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 px-4">
        <span className="font-semibold text-2xl tabular-nums">{value}</span>
        {caption && <span className="text-muted-foreground text-xs">{caption}</span>}
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  // Só "PENDENTE" foi confirmado em produção — qualquer outro valor recebe
  // o badge neutro em vez de tentarmos adivinhar o que significa "sucesso"
  // ou "falha" para um valor que nunca vimos de verdade.
  if (status === "PENDENTE") return "outline";
  return "secondary";
}

type PeriodKey = "hoje" | "ontem" | "mes_atual" | "ultimo_mes" | "ultimos_30" | "tudo";

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "mes_atual", label: "Mês atual" },
  { key: "ultimo_mes", label: "Último mês" },
  { key: "ultimos_30", label: "Últimos 30 dias" },
  { key: "tudo", label: "Tudo" },
];

function isWithinPeriod(dataIso: string, period: PeriodKey): boolean {
  if (period === "tudo") return true;
  const date = new Date(dataIso);
  const now = new Date();

  if (period === "hoje") {
    return date.toDateString() === now.toDateString();
  }
  if (period === "ontem") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }
  if (period === "mes_atual") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (period === "ultimo_mes") {
    // Mês civil anterior por completo (1º ao último dia) — diferente de
    // "últimos 30 dias", que é uma janela rolante a partir de hoje.
    const targetMonth = now.getMonth() - 1;
    const lastMonthDate = new Date(now.getFullYear(), targetMonth, 1);
    return date.getFullYear() === lastMonthDate.getFullYear() && date.getMonth() === lastMonthDate.getMonth();
  }
  // ultimos_30
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  return date >= thirtyDaysAgo;
}

const dailyChartConfig = {
  pedidos: { label: "Pedidos", color: "var(--chart-1)" },
} satisfies ChartConfig;

const revenueChartConfig = {
  receita: { label: "Receita", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Agrupa pedidos por dia — dado 100% real (dataCriacao de cada pedido),
 * nunca uma série inventada. Sem pedidos suficientes, o gráfico não
 * aparece (ver render condicional abaixo) em vez de mostrar linha vazia. */
function buildDailySeries(orders: PedidoRow[]) {
  const byDay = new Map<string, { pedidos: number; receita: number }>();
  for (const order of orders) {
    const day = new Date(order.dataCriacao).toISOString().slice(0, 10);
    const current = byDay.get(day) ?? { pedidos: 0, receita: 0 };
    current.pedidos += 1;
    current.receita += order.valorBruto;
    byDay.set(day, current);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, values]) => ({ day, ...values }));
}

const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Página Pedidos — lista real de pedidos da Kairóss (endpoint confirmado
 * `/vendas/pedidos`) + contadores agregados (`/vendas/relatorio`). Os
 * valores em R$ do topo somam TODOS os pedidos (não só os pagos) porque
 * `statusPagamento` só foi observado com o valor "PENDENTE" até agora — ver
 * comentário em kaiross-integration.service.ts. Quando um pedido pago real
 * for observado, dá pra separar "confirmado" de "todos" com segurança.
 */
export function PedidosClient() {
  const pedidosAction = useAsyncAction(fetchPedidos);
  const { execute: loadPedidos } = pedidosAction;
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState<PeriodKey>("ultimos_30");

  React.useEffect(() => {
    void loadPedidos();
  }, [loadPedidos]);

  const resumo = pedidosAction.data?.resumo ?? null;
  const allOrders = pedidosAction.data?.orders ?? null;
  const notConnected = pedidosAction.error?.toLowerCase().includes("não conectada");

  // Pedidos dentro do período selecionado — base para KPIs, gráfico e tabela.
  const periodOrders = React.useMemo(() => {
    if (!allOrders) return null;
    return allOrders.filter((order) => isWithinPeriod(order.dataCriacao, period));
  }, [allOrders, period]);

  const statusOptions = React.useMemo(() => {
    if (!periodOrders) return [];
    return Array.from(new Set(periodOrders.map((order) => order.statusPagamento)));
  }, [periodOrders]);

  const totals = React.useMemo(() => {
    if (!periodOrders) return null;
    return periodOrders.reduce(
      (acc, order) => ({
        valorBruto: acc.valorBruto + order.valorBruto,
        valorLiquido: acc.valorLiquido + order.valorLiquidoVendedor,
      }),
      { valorBruto: 0, valorLiquido: 0 },
    );
  }, [periodOrders]);

  const dailySeries = React.useMemo(() => (periodOrders ? buildDailySeries(periodOrders) : []), [periodOrders]);

  const filteredOrders = React.useMemo(() => {
    if (!periodOrders) return [];
    const query = search.trim().toLowerCase();
    return periodOrders.filter((order) => {
      if (statusFilter && order.statusPagamento !== statusFilter) return false;
      if (!query) return true;
      return (
        order.numeroPedido.toLowerCase().includes(query) ||
        order.clienteNome.toLowerCase().includes(query) ||
        order.produtos.some((nome) => nome.toLowerCase().includes(query))
      );
    });
  }, [periodOrders, search, statusFilter]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Pedidos</h1>
          <p className="text-muted-foreground text-sm">Acompanhe os pedidos feitos na sua vitrine Kairóss.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.key}
              variant={period === option.key ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {pedidosAction.error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{pedidosAction.error}</span>
            <Button variant="outline" size="sm" onClick={loadPedidos}>
              <RefreshCw data-icon="inline-start" className="size-3.5" />
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {pedidosAction.isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!pedidosAction.isLoading && (resumo ?? totals) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={ListOrdered} label="Pedidos no período" value={periodOrders?.length ?? 0} />
          {resumo && (
            <KpiCard
              icon={Clock}
              label="Aguardando pagamento"
              value={resumo.pendentes}
              caption="todos os tempos"
              highlight={resumo.pendentes > 0}
            />
          )}
          {resumo && <KpiCard icon={CheckCircle2} label="Pagos" value={resumo.pagos} caption="todos os tempos" />}
          {resumo && <KpiCard icon={XCircle} label="Falhas" value={resumo.falhas} caption="todos os tempos" />}
          {resumo && (
            <KpiCard icon={RotateCcw} label="Reembolsados" value={resumo.reembolsados} caption="todos os tempos" />
          )}
          {resumo && (
            <KpiCard icon={ShoppingCart} label="Abandonados" value={resumo.abandonados} caption="todos os tempos" />
          )}
          {totals && (
            <KpiCard
              icon={ListOrdered}
              label="Valor bruto"
              value={formatCurrency(totals.valorBruto, { currency: "BRL", locale: "pt-BR" })}
              caption="no período selecionado"
            />
          )}
          {totals && (
            <KpiCard
              icon={ListOrdered}
              label="Valor líquido"
              value={formatCurrency(totals.valorLiquido, { currency: "BRL", locale: "pt-BR" })}
              caption="no período selecionado"
            />
          )}
        </div>
      )}

      {!pedidosAction.isLoading && dailySeries.length >= 2 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução da receita</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={revenueChartConfig} className="h-48 w-full">
                <BarChart data={dailySeries} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="0" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                    tickFormatter={(value) => dayFormatter.format(new Date(String(value)))}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideIndicator
                        labelFormatter={(value) => dayFormatter.format(new Date(String(value)))}
                        formatter={(value) => formatCurrency(Number(value), { currency: "BRL", locale: "pt-BR" })}
                      />
                    }
                  />
                  <Bar dataKey="receita" fill="var(--color-receita)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pedidos por dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={dailyChartConfig} className="h-48 w-full">
                <BarChart data={dailySeries} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="0" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                    tickFormatter={(value) => dayFormatter.format(new Date(String(value)))}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideIndicator
                        labelFormatter={(value) => dayFormatter.format(new Date(String(value)))}
                      />
                    }
                  />
                  <Bar dataKey="pedidos" fill="var(--color-pedidos)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {!pedidosAction.isLoading && periodOrders && periodOrders.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nº, cliente ou produto..."
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={statusFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(null)}
              >
                Todos
              </Button>
              {statusOptions.map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto(s)</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/pedidos/${order.id}`} className="hover:underline">
                        {order.numeroPedido}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(order.dataCriacao)}
                    </TableCell>
                    <TableCell>{order.clienteNome}</TableCell>
                    <TableCell className="max-w-48 truncate" title={order.produtos.join(", ")}>
                      {order.produtos.join(", ") || "—"}
                    </TableCell>
                    <TableCell>{order.formaPagamento ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(order.valorBruto, { currency: "BRL", locale: "pt-BR" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(order.statusPagamento)}>
                        {order.statusPagamento.charAt(0) + order.statusPagamento.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredOrders.length === 0 && (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Nenhum pedido encontrado com esses filtros.
            </p>
          )}
        </div>
      )}

      {!pedidosAction.isLoading && periodOrders && periodOrders.length === 0 && allOrders && allOrders.length > 0 && (
        <p className="py-8 text-center text-muted-foreground text-sm">Nenhum pedido no período selecionado.</p>
      )}

      {!pedidosAction.isLoading && !pedidosAction.error && allOrders && allOrders.length === 0 && (
        <Empty className="rounded-lg border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListOrdered />
            </EmptyMedia>
            <EmptyTitle>Nenhum pedido ainda</EmptyTitle>
            <EmptyDescription>Assim que alguém comprar pela sua vitrine, os pedidos aparecem aqui.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {notConnected && (
        <p className="text-center text-muted-foreground text-sm">
          Conecte sua conta Kairóss em Configurações para ver seus pedidos aqui.
        </p>
      )}
    </div>
  );
}

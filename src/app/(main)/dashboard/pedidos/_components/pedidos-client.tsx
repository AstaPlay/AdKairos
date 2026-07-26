"use client";

import * as React from "react";

import {
  CheckCircle2,
  Clock,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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

function KpiCard({ icon: Icon, label, value, caption }: { icon: React.ElementType; label: string; value: string | number; caption?: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-4">
        <Icon className="text-muted-foreground size-4" />
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 px-4">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
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

  React.useEffect(() => {
    loadPedidos();
  }, [loadPedidos]);

  const resumo = pedidosAction.data?.resumo ?? null;
  const orders = pedidosAction.data?.orders ?? null;
  const notConnected = pedidosAction.error?.toLowerCase().includes("não conectada");

  const statusOptions = React.useMemo(() => {
    if (!orders) return [];
    return Array.from(new Set(orders.map((order) => order.statusPagamento)));
  }, [orders]);

  const totals = React.useMemo(() => {
    if (!orders) return null;
    return orders.reduce(
      (acc, order) => ({
        valorBruto: acc.valorBruto + order.valorBruto,
        valorLiquido: acc.valorLiquido + order.valorLiquidoVendedor,
      }),
      { valorBruto: 0, valorLiquido: 0 },
    );
  }, [orders]);

  const filteredOrders = React.useMemo(() => {
    if (!orders) return [];
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter && order.statusPagamento !== statusFilter) return false;
      if (!query) return true;
      return (
        order.numeroPedido.toLowerCase().includes(query) ||
        order.clienteNome.toLowerCase().includes(query) ||
        order.produtos.some((nome) => nome.toLowerCase().includes(query))
      );
    });
  }, [orders, search, statusFilter]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-muted-foreground text-sm">Acompanhe os pedidos feitos na sua vitrine Kairóss.</p>
      </div>

      {pedidosAction.error && (
        <Alert variant="destructive">
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

      {!pedidosAction.isLoading && (resumo || totals) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={ListOrdered} label="Pedidos" value={orders?.length ?? 0} />
          {resumo && <KpiCard icon={Clock} label="Aguardando pagamento" value={resumo.pendentes} />}
          {resumo && <KpiCard icon={CheckCircle2} label="Pagos" value={resumo.pagos} />}
          {resumo && <KpiCard icon={XCircle} label="Falhas" value={resumo.falhas} />}
          {resumo && <KpiCard icon={RotateCcw} label="Reembolsados" value={resumo.reembolsados} />}
          {resumo && <KpiCard icon={ShoppingCart} label="Abandonados" value={resumo.abandonados} />}
          {totals && (
            <KpiCard
              icon={ListOrdered}
              label="Valor bruto"
              value={formatCurrency(totals.valorBruto, { currency: "BRL", locale: "pt-BR" })}
              caption="todos os pedidos, incl. pendentes"
            />
          )}
          {totals && (
            <KpiCard
              icon={ListOrdered}
              label="Valor líquido"
              value={formatCurrency(totals.valorLiquido, { currency: "BRL", locale: "pt-BR" })}
              caption="todos os pedidos, incl. pendentes"
            />
          )}
        </div>
      )}

      {!pedidosAction.isLoading && orders && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nº, cliente ou produto..."
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant={statusFilter === null ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(null)}>
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
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.numeroPedido}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(order.dataCriacao)}</TableCell>
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
            <p className="text-muted-foreground py-8 text-center text-sm">Nenhum pedido encontrado com esses filtros.</p>
          )}
        </div>
      )}

      {!pedidosAction.isLoading && !pedidosAction.error && orders && orders.length === 0 && (
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
        <p className="text-muted-foreground text-center text-sm">
          Conecte sua conta Kairóss em Configurações para ver seus pedidos aqui.
        </p>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";

import { AlertTriangle, ArrowLeft, Mail, MapPin, Phone, RefreshCw, ShoppingBag, User } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAsyncAction } from "@/hooks/use-async-action";
import { formatCurrency } from "@/lib/utils";

interface ClienteDetalhado {
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  endereco: {
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
  resumo: { totalPedidos: number; pedidosPagos: number; totalGasto: number; primeiraCompra: string };
  pedidos: Array<{
    id: string;
    numeroPedido: string;
    dataCriacao: string;
    statusPagamento: string;
    statusFornecedor: string | null;
    valorBruto: number;
    itens: string[];
  }>;
}

async function fetchCliente(documento: string): Promise<ClienteDetalhado> {
  const response = await fetch(`/api/integrations/kaiross/clientes/${encodeURIComponent(documento)}`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar este cliente agora.");
  return json.data as ClienteDetalhado;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function money(value: number) {
  return formatCurrency(value, { currency: "BRL", locale: "pt-BR" });
}

/**
 * Página de cliente — como a Kairóss/AdKairos não tem tabela própria de
 * "clientes" (só pedidos), este painel é montado agregando, no backend, os
 * pedidos do vendedor logado que compartilham o mesmo CPF. Todo dado aqui
 * (histórico, total gasto, itens) é real, derivado dos próprios pedidos —
 * nada de métrica de LTV projetada ou "cliente VIP" inventada.
 */
export function ClienteDetailClient({ documento }: { documento: string }) {
  const clienteAction = useAsyncAction(fetchCliente);
  const { execute } = clienteAction;

  React.useEffect(() => {
    execute(documento);
  }, [execute, documento]);

  const cliente = clienteAction.data;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/dashboard/pedidos">
          <ArrowLeft data-icon="inline-start" className="size-3.5" />
          Voltar para pedidos
        </Link>
      </Button>

      {clienteAction.isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48 lg:col-span-2" />
        </div>
      )}

      {clienteAction.error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{clienteAction.error}</span>
            <Button variant="outline" size="sm" onClick={() => execute(documento)}>
              <RefreshCw data-icon="inline-start" className="size-3.5" />
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {cliente && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="size-4 text-muted-foreground" />
                {cliente.nome}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {cliente.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{cliente.email}</span>
                </div>
              )}
              {cliente.telefone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{cliente.telefone}</span>
                </div>
              )}
              {cliente.endereco?.logradouro && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    {cliente.endereco.logradouro}
                    {cliente.endereco.numero ? `, ${cliente.endereco.numero}` : ""}
                    {cliente.endereco.cidade ? ` · ${cliente.endereco.cidade}` : ""}
                    {cliente.endereco.uf ? `/${cliente.endereco.uf}` : ""}
                  </span>
                </div>
              )}

              <div className="mt-2 grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <p className="text-muted-foreground text-[11px]">Total de pedidos</p>
                  <p className="text-lg font-semibold tabular-nums">{cliente.resumo.totalPedidos}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Pagos</p>
                  <p className="text-lg font-semibold tabular-nums">{cliente.resumo.pedidosPagos}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-[11px]">Total gasto</p>
                  <p className="font-mono text-lg font-semibold tabular-nums">{money(cliente.resumo.totalGasto)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-[11px]">Cliente desde</p>
                  <p className="text-sm">{formatDate(cliente.resumo.primeiraCompra)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="size-4 text-muted-foreground" />
                Histórico de pedidos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Produto(s)</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cliente.pedidos.map((pedido) => (
                      <TableRow key={pedido.id}>
                        <TableCell className="font-medium">
                          <Link href={`/dashboard/pedidos/${pedido.id}`} className="hover:underline">
                            {pedido.numeroPedido}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(pedido.dataCriacao)}</TableCell>
                        <TableCell className="max-w-56 truncate" title={pedido.itens.join(", ")}>
                          {pedido.itens.join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(pedido.valorBruto)}</TableCell>
                        <TableCell>
                          <Badge variant={pedido.statusPagamento === "PENDENTE" ? "outline" : "secondary"}>
                            {pedido.statusPagamento.charAt(0) + pedido.statusPagamento.slice(1).toLowerCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

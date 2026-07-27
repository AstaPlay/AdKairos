"use client";

import * as React from "react";
import Link from "next/link";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDashed,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Truck,
  User,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncAction } from "@/hooks/use-async-action";
import { formatCurrency } from "@/lib/utils";

interface PedidoDetalhado {
  id: string;
  numeroPedido: string;
  dataCriacao: string;
  dataPagamento: string | null;
  dataEnvio: string | null;
  cliente: {
    nome: string;
    email: string | null;
    telefone: string | null;
    documento: string | null;
    endereco: {
      cep: string | null;
      logradouro: string | null;
      numero: string | null;
      bairro: string | null;
      complemento: string | null;
      cidade: string | null;
      uf: string | null;
    } | null;
  };
  pagamento: { forma: string | null; status: string; dataPagamento: string | null };
  fornecedor: { nome: string | null; status: string | null; integrado: boolean | null };
  envio: { codigoRastreio: string | null; dataEnvio: string | null };
  itens: Array<{
    id: string;
    produtoId: string | null;
    nome: string;
    codigo: string | null;
    imagem: string | null;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
  valores: {
    quantidadeTotal: number;
    bruto: number;
    liquidoVendedor: number;
    imposto: number | null;
    taxa: number | null;
    frete: number | null;
    vendedorAssumeFrete: boolean;
    custoFornecedor: number | null;
  };
}

async function fetchPedidoDetalhado(id: string): Promise<PedidoDetalhado> {
  const response = await fetch(`/api/integrations/kaiross/pedidos/${encodeURIComponent(id)}`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar este pedido agora.");
  return json.data as PedidoDetalhado;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function money(value: number) {
  return formatCurrency(value, { currency: "BRL", locale: "pt-BR" });
}

/** Linha do tempo com base só em dados que o pedido realmente carrega —
 * nunca inventa uma etapa "notificado ao fornecedor" ou "etiqueta gerada"
 * porque o dado real não distingue essas duas (só existe `statusFornecedor`
 * em texto livre e `dataEnvio`). Cada etapa é logicamente derivada do que
 * está confirmado, não de um fluxo fixo copiado da Kairóss. */
function buildTimeline(pedido: PedidoDetalhado) {
  const steps: Array<{ label: string; detail: string | null; done: boolean; pending: boolean }> = [
    {
      label: "Pedido recebido",
      detail: formatDate(pedido.dataCriacao),
      done: true,
      pending: false,
    },
    {
      label: "Pagamento confirmado",
      detail: pedido.pagamento.dataPagamento
        ? formatDate(pedido.pagamento.dataPagamento)
        : `Status: ${pedido.pagamento.status}`,
      done: Boolean(pedido.pagamento.dataPagamento),
      pending: !pedido.pagamento.dataPagamento,
    },
    {
      label: "Fornecedor",
      detail: pedido.fornecedor.status ?? (pedido.fornecedor.integrado ? "Integrado" : "Aguardando confirmação"),
      done: Boolean(pedido.fornecedor.integrado),
      pending: !pedido.fornecedor.integrado,
    },
    {
      label: "Enviado",
      detail: pedido.envio.dataEnvio
        ? formatDate(pedido.envio.dataEnvio)
        : pedido.envio.codigoRastreio
          ? `Rastreio: ${pedido.envio.codigoRastreio}`
          : "Aguardando despacho",
      done: Boolean(pedido.envio.dataEnvio),
      pending: !pedido.envio.dataEnvio,
    },
  ];
  return steps;
}

const decompositionConfig = {
  custoFornecedor: { label: "Custo do fornecedor", color: "var(--chart-1)" },
  imposto: { label: "Imposto", color: "var(--chart-2)" },
  taxa: { label: "Taxa da plataforma", color: "var(--chart-3)" },
  frete: { label: "Frete", color: "var(--chart-4)" },
  margem: { label: "Sua margem líquida", color: "var(--chart-5)" },
} satisfies ChartConfig;

function DecompositionChart({ valores }: { valores: PedidoDetalhado["valores"] }) {
  const parts = [
    { key: "custoFornecedor", value: valores.custoFornecedor ?? 0 },
    { key: "imposto", value: valores.imposto ?? 0 },
    { key: "taxa", value: valores.taxa ?? 0 },
    { key: "frete", value: valores.vendedorAssumeFrete ? (valores.frete ?? 0) : 0 },
    { key: "margem", value: Math.max(valores.liquidoVendedor, 0) },
  ].filter((part) => part.value > 0);

  if (parts.length === 0) return null;

  return (
    <ChartContainer config={decompositionConfig} className="mx-auto aspect-square max-h-48">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value) => money(Number(value))} />} />
        <Pie data={parts} dataKey="value" nameKey="key" innerRadius={45} outerRadius={70} strokeWidth={2}>
          {parts.map((part) => (
            <Cell key={part.key} fill={`var(--color-${part.key})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

export function PedidoDetailClient({ pedidoId }: { pedidoId: string }) {
  const detailAction = useAsyncAction(fetchPedidoDetalhado);
  const { execute } = detailAction;
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    execute(pedidoId);
  }, [execute, pedidoId]);

  const pedido = detailAction.data;

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/pedidos">
            <ArrowLeft data-icon="inline-start" className="size-3.5" />
            Voltar para pedidos
          </Link>
        </Button>
      </div>

      {detailAction.isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      )}

      {detailAction.error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{detailAction.error}</span>
            <Button variant="outline" size="sm" onClick={() => execute(pedidoId)}>
              <RefreshCw data-icon="inline-start" className="size-3.5" />
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {pedido && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{pedido.numeroPedido}</h1>
              <p className="text-muted-foreground text-sm">Realizado em {formatDate(pedido.dataCriacao)}</p>
            </div>
            <Badge variant={pedido.pagamento.dataPagamento ? "default" : "outline"} className="text-xs">
              {pedido.pagamento.status}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Linha do tempo + itens */}
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Linha do tempo</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-4">
                    {buildTimeline(pedido).map((step, index) => (
                      <li key={step.label} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={
                              step.done
                                ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                                : "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-muted-foreground"
                            }
                          >
                            {step.done ? <Check className="size-3.5" /> : <CircleDashed className="size-3.5" />}
                          </span>
                          {index < 3 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
                        </div>
                        <div className="pb-4">
                          <p className={step.done ? "text-sm font-medium" : "text-sm font-medium text-muted-foreground"}>
                            {step.label}
                          </p>
                          {step.detail && <p className="text-muted-foreground text-xs">{step.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Itens do pedido</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {pedido.itens.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                        {item.imagem ? (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem remota do catálogo
                          <img src={item.imagem} alt={item.nome} className="h-full w-full object-contain" />
                        ) : (
                          <Package className="size-5 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.nome}</p>
                        <p className="text-muted-foreground text-xs">
                          {item.quantidade}× {money(item.valorUnitario)}
                          {item.codigo ? ` · SKU ${item.codigo}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">{money(item.valorTotal)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-semibold">Total cobrado</span>
                    <span className="font-mono text-base font-semibold tabular-nums">{money(pedido.valores.bruto)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Comprador + pagamento + decomposição + fornecedor */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="size-4 text-muted-foreground" />
                    Comprador
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2.5">
                  {pedido.cliente.documento ? (
                    <Link
                      href={`/dashboard/clientes/${encodeURIComponent(pedido.cliente.documento)}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {pedido.cliente.nome}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{pedido.cliente.nome}</p>
                  )}
                  {pedido.cliente.email && (
                    <button
                      type="button"
                      onClick={() => copyValue("email", pedido.cliente.email!)}
                      className="flex items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{pedido.cliente.email}</span>
                      {copied === "email" ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0" />}
                    </button>
                  )}
                  {pedido.cliente.telefone && (
                    <button
                      type="button"
                      onClick={() => copyValue("telefone", pedido.cliente.telefone!)}
                      className="flex items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="size-3.5 shrink-0" />
                      <span>{pedido.cliente.telefone}</span>
                      {copied === "telefone" ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0" />}
                    </button>
                  )}
                  {pedido.cliente.endereco?.logradouro && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {pedido.cliente.endereco.logradouro}
                        {pedido.cliente.endereco.numero ? `, ${pedido.cliente.endereco.numero}` : ""}
                        {pedido.cliente.endereco.bairro ? ` · ${pedido.cliente.endereco.bairro}` : ""}
                        {pedido.cliente.endereco.cidade ? ` · ${pedido.cliente.endereco.cidade}` : ""}
                        {pedido.cliente.endereco.uf ? `/${pedido.cliente.endereco.uf}` : ""}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Decomposição do valor</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <DecompositionChart valores={pedido.valores} />
                  <div className="flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preço de venda</span>
                      <span className="tabular-nums">{money(pedido.valores.bruto - (pedido.valores.frete ?? 0))}</span>
                    </div>
                    {Boolean(pedido.valores.frete) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          + Frete ({pedido.valores.vendedorAssumeFrete ? "por sua conta" : "cliente paga"})
                        </span>
                        <span className="tabular-nums">{money(pedido.valores.frete!)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1.5 font-medium">
                      <span>= Total da venda</span>
                      <span className="tabular-nums">{money(pedido.valores.bruto)}</span>
                    </div>
                    {Boolean(pedido.valores.custoFornecedor) && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>– Custo do fornecedor</span>
                        <span className="tabular-nums">−{money(pedido.valores.custoFornecedor!)}</span>
                      </div>
                    )}
                    {Boolean(pedido.valores.imposto) && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>– Imposto</span>
                        <span className="tabular-nums">−{money(pedido.valores.imposto!)}</span>
                      </div>
                    )}
                    {Boolean(pedido.valores.taxa) && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>– Taxa da plataforma</span>
                        <span className="tabular-nums">−{money(pedido.valores.taxa!)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                      <span>Sua margem líquida</span>
                      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                        {money(pedido.valores.liquidoVendedor)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Truck className="size-4 text-muted-foreground" />
                    Fornecedor e envio
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fornecedor</span>
                    <span>{pedido.fornecedor.nome ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span>{pedido.fornecedor.status ?? "Não disponível"}</span>
                  </div>
                  {pedido.envio.codigoRastreio ? (
                    <button
                      type="button"
                      onClick={() => copyValue("rastreio", pedido.envio.codigoRastreio!)}
                      className="mt-1 flex items-center justify-between rounded-md border px-2.5 py-2 text-left hover:border-primary"
                    >
                      <span className="font-mono text-xs">{pedido.envio.codigoRastreio}</span>
                      {copied === "rastreio" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </button>
                  ) : (
                    <p className="text-muted-foreground text-xs">Rastreio ainda não disponível.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {!detailAction.isLoading && !detailAction.error && !pedido && (
        <Empty className="rounded-lg border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ExternalLink />
            </EmptyMedia>
            <EmptyTitle>Pedido não encontrado</EmptyTitle>
            <EmptyDescription>Verifique se o link está correto ou volte para a lista de pedidos.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

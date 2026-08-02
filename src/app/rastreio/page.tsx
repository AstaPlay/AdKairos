"use client";

import * as React from "react";

import { AlertTriangle, Check, CircleDashed, Package, Search, ShieldCheck, Truck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RastreioResultado {
  numeroPedido: string;
  clienteNomeParcial: string;
  statusPagamento: string;
  statusFornecedor: string | null;
  codigoRastreio: string | null;
  dataCriacao: string;
  dataEnvio: string | null;
  itensResumo: string[];
  atualizadoEm: string;
}

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function trackOrder(input: { cpf: string; numeroPedido?: string }): Promise<RastreioResultado[]> {
  const response = await fetch("/api/rastreio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível consultar agora.");
  return json.data as RastreioResultado[];
}

function StatusStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={
          done
            ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
            : "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-muted-foreground"
        }
      >
        {done ? <Check className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      </span>
      <span className={done ? "font-medium text-sm" : "text-muted-foreground text-sm"}>{label}</span>
    </div>
  );
}

function ResultCard({ pedido }: { pedido: RastreioResultado }) {
  const pago = pedido.statusPagamento?.toUpperCase() !== "PENDENTE";
  const enviado = Boolean(pedido.dataEnvio ?? pedido.codigoRastreio);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 font-mono text-base">
          <span>{pedido.numeroPedido}</span>
          <span className="font-normal text-muted-foreground text-xs">{formatDate(pedido.dataCriacao)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Pedido de <span className="font-medium text-foreground">{pedido.clienteNomeParcial}</span>
          {pedido.itensResumo.length > 0 ? ` · ${pedido.itensResumo.join(", ")}` : ""}
        </p>

        <div className="flex flex-col gap-3 rounded-lg border p-3.5">
          <StatusStep label="Pedido recebido" done />
          <StatusStep label="Pagamento confirmado" done={pago} />
          <StatusStep label="Enviado" done={enviado} />
        </div>

        {pedido.codigoRastreio && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
            <Truck className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Código de rastreio</p>
              <p className="truncate font-mono text-sm">{pedido.codigoRastreio}</p>
            </div>
          </div>
        )}

        {!pedido.codigoRastreio && !enviado && (
          <p className="text-muted-foreground text-xs">Ainda não há código de rastreio disponível para este pedido.</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Página pública (sem login) de rastreio de pedido — réplica do fluxo real
 * já usado pela Kairóss (CPF obrigatório + nº do pedido opcional,
 * confirmado via captura de tráfego real de `GET
 * https://app.kaiross.com.br/rastreio` em 2026-07-26). Consulta o índice
 * próprio do AdKairos (não um endpoint da Kairóss, que nunca foi
 * confirmado) — ver `/api/rastreio` e `pedido-tracking-index.server.ts`.
 */
export default function RastreioPage() {
  const [cpf, setCpf] = React.useState("");
  const [numeroPedido, setNumeroPedido] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<RastreioResultado[] | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      setError("Informe um CPF válido.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await trackOrder({ cpf: digits, numeroPedido: numeroPedido.trim() || undefined });
      setResults(data);
      if (data.length === 0) setError("Nenhum pedido encontrado com esses dados. Confira o CPF e tente novamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar agora.");
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-xl flex-col gap-6 px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Package className="size-5 text-primary" />
        </div>
        <h1 className="font-semibold text-2xl tracking-tight">Rastrear pedido</h1>
        <p className="text-muted-foreground text-sm">Informe seu CPF para ver o status da sua compra.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(event) => setCpf(formatCpfInput(event.target.value))}
                maxLength={14}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="numero-pedido">
                Número do pedido <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="numero-pedido"
                placeholder="KR-2026-000000"
                value={numeroPedido}
                onChange={(event) => setNumeroPedido(event.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={isLoading}>
              <Search data-icon="inline-start" className="size-4" />
              {isLoading ? "Buscando..." : "Rastrear"}
            </Button>

            <p className="flex items-start gap-1.5 text-muted-foreground text-xs">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />O CPF é usado apenas para localizar os seus pedidos e
              nunca é compartilhado.
            </p>
          </form>
        </CardContent>
      </Card>

      {results && results.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.map((pedido) => (
            <ResultCard key={pedido.numeroPedido} pedido={pedido} />
          ))}
        </div>
      )}
    </div>
  );
}

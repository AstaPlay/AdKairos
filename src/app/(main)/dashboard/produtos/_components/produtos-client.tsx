"use client";

import * as React from "react";

import { useSearchParams } from "next/navigation";

import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/utils/get-error-message";

import { KpiCards } from "./kpi-cards";
import { ProductsSection } from "./products-section";
import type { ProductRow, ProductStatus } from "./produtos-table/schema";

interface ProdutosResponse {
  products: ProductRow[];
  total: number;
}

interface SyncSummary {
  checked: number;
  removedRemotely: number;
  updated: number;
  unchanged: number;
  addedFromKaiross: number;
}

async function fetchProdutos(): Promise<ProdutosResponse> {
  const response = await fetch("/api/produtos");
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar seus produtos agora.");
  return json.data as ProdutosResponse;
}

/**
 * Mesma rota de sincronização usada em Catálogo (catalog-section.tsx) — aqui
 * ela também precisa rodar, senão um produto afiliado direto no painel da
 * Kairóss (sem nunca abrir a tela Catálogo do AdKairos) nunca aparece nesta
 * página, e produtos legados sem custo/imagem nunca são corrigidos.
 */
async function sincronizar(): Promise<SyncSummary> {
  const response = await fetch("/api/integrations/kaiross/sincronizar", { method: "POST" });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível sincronizar agora.");
  return json.data as SyncSummary;
}

async function patchProduto(
  id: string,
  updates: {
    status?: ProductStatus;
    price?: number;
    tags?: string[];
    freteCobrado?: number;
    custoFrete?: number;
    clientePagaFrete?: boolean;
  },
): Promise<ProductRow> {
  const response = await fetch(`/api/produtos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível salvar as alterações agora.");
  return json.data.product as ProductRow;
}

function relativeSyncLabel(date: Date | null): string {
  if (!date) return "Ainda não sincronizado";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 15) return "Sincronizado agora";
  if (seconds < 60) return `Sincronizado há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Sincronizado há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Sincronizado há ${hours}h`;
}

async function deleteProduto(id: string): Promise<void> {
  const response = await fetch(`/api/produtos/${id}`, { method: "DELETE" });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível remover o produto agora.");
}

/**
 * Dono do estado real dos produtos (uma única busca ao Firestore por visita
 * à página) — KpiCards e ProductsSection são componentes "burros" que só
 * recebem a lista e callbacks de mutação. Isso evita dois fetches
 * independentes mostrando contagens divergentes entre os cards de KPI e a
 * lista logo abaixo, e garante que pausar/remover/editar reflita nos dois
 * lugares ao mesmo tempo, sem esperar um refetch.
 */
export function ProdutosClient() {
  const searchParams = useSearchParams();
  // Preenchido quando o usuário chega aqui a partir do Catálogo, ao clicar
  // num produto que já estava afiliado (ver handleOpenExisting em
  // catalog-section.tsx) — antes esse parâmetro era só gerado e nunca lido,
  // então o produto nunca era realmente destacado na chegada.
  const highlightId = searchParams.get("highlight");

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = React.useState(false);
  // Estado de sincronização exibido no header — cobre tanto o sync automático
  // ao montar quanto o botão manual, para o usuário sempre ver quando (e se)
  // o catálogo local foi conferido pela última vez contra a Kairóss, e não
  // só quando ele mesmo clicou em "Sincronizar".
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | null>(null);
  const [syncFailed, setSyncFailed] = React.useState(false);
  // Força o relógio de "há X min" a re-renderizar sem precisar de um novo fetch.
  const [, forceTick] = React.useState(0);

  const load = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchProdutos()
      .then((result) => setProducts(result.products))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, []);

  React.useEffect(() => {
    // Carrega o que já está salvo imediatamente — não faz sentido o usuário
    // esperar a chamada de rede à Kairóss (pode levar vários segundos) para
    // ver produtos que já estão no Firestore prontos para exibir. A
    // sincronização roda em paralelo, em segundo plano, e só then dispara um
    // segundo load() quando (e se) trouxer algo novo — mesmo padrão já usado
    // em catalog-section.tsx. Best-effort: falha de rede/desconexão não deve
    // impedir a tela de mostrar o que já existe localmente.
    load();
    fetch("/api/integrations/kaiross/sincronizar", { method: "POST" })
      .then((response) => response.json())
      .then((json) => {
        if (json?.success) {
          setLastSyncedAt(new Date());
          setSyncFailed(false);
        } else {
          setSyncFailed(true);
        }
        const summary = json?.data as SyncSummary | undefined;
        if (summary && (summary.updated > 0 || summary.addedFromKaiross > 0 || summary.removedRemotely > 0)) {
          load();
        }
      })
      .catch(() => setSyncFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez ao montar; load é estável (useCallback sem deps)
  }, [
    // Carrega o que já está salvo imediatamente — não faz sentido o usuário
    // esperar a chamada de rede à Kairóss (pode levar vários segundos) para
    // ver produtos que já estão no Firestore prontos para exibir. A
    // sincronização roda em paralelo, em segundo plano, e só then dispara um
    // segundo load() quando (e se) trouxer algo novo — mesmo padrão já usado
    // em catalog-section.tsx. Best-effort: falha de rede/desconexão não deve
    // impedir a tela de mostrar o que já existe localmente.
    load,
  ]);

  // Atualiza o texto "há X min" a cada 30s sem precisar de novo fetch.
  React.useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleSincronizar() {
    setIsSyncing(true);
    try {
      const result = await sincronizar();
      setLastSyncedAt(new Date());
      setSyncFailed(false);
      toast.success(
        `Sincronizado: ${result.updated} atualizado(s), ${result.addedFromKaiross} adicionado(s), ${result.removedRemotely} removido(s).`,
      );
      load();
    } catch (err) {
      setSyncFailed(true);
      toast.error(getErrorMessage(err));
    } finally {
      setIsSyncing(false);
    }
  }

  function markPending(id: string, pending: boolean) {
    setPendingIds((previous) => {
      const next = new Set(previous);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleUpdate(
    id: string,
    updates: {
      status?: ProductStatus;
      price?: number;
      tags?: string[];
      freteCobrado?: number;
      custoFrete?: number;
      clientePagaFrete?: boolean;
    },
  ) {
    markPending(id, true);
    try {
      const updated = await patchProduto(id, updates);
      setProducts((previous) => previous.map((item) => (item.id === id ? updated : item)));
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    } finally {
      markPending(id, false);
    }
  }

  async function handleRemove(id: string) {
    markPending(id, true);
    try {
      await deleteProduto(id);
      setProducts((previous) => previous.filter((item) => item.id !== id));
      toast.success("Produto removido da vitrine");
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    } finally {
      markPending(id, false);
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw data-icon="inline-start" className="size-3.5" />
            Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <Skeleton className="h-24 w-full rounded-xl sm:h-28" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3] w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="relative overflow-hidden rounded-xl border bg-card px-4 py-5 sm:px-6 sm:py-6">
        {/* Glow ambiente sutil no acento primário do tema — reforça que esta é
            a página "central" do catálogo sem depender de cor fixa hardcoded. */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-2xl tracking-tight sm:text-3xl">Catálogo e inteligência de produtos</h2>
            <p className="max-w-xl text-muted-foreground text-sm">
              Cada produto cadastrado aqui alimenta o WhatsApp AI, Instagram AI, automações e o CRM.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 border-transparent px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide",
                syncFailed
                  ? "bg-destructive/10 text-destructive"
                  : lastSyncedAt
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {syncFailed ? (
                <CloudOff className="size-3" />
              ) : lastSyncedAt ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {syncFailed ? "Falha na última sincronização" : relativeSyncLabel(lastSyncedAt)}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleSincronizar} disabled={isSyncing}>
              <RefreshCw data-icon="inline-start" className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Sincronizando..." : "Sincronizar com a Kairóss"}
            </Button>
          </div>
        </div>
      </section>

      <KpiCards products={products} />
      <ProductsSection
        products={products}
        pendingIds={pendingIds}
        highlightId={highlightId}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
      />
    </div>
  );
}

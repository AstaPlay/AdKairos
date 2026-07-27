"use client";

import * as React from "react";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = React.useState(false);

  const load = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchProdutos()
      .then((result) => setProducts(result.products))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, []);

  React.useEffect(() => {
    // Sincroniza com a Kairóss antes da primeira leitura — best-effort: se
    // falhar (não conectado, rede fora), segue direto pro fetch local, que
    // sempre reflete o que já está salvo. Sem isso, produtos afiliados
    // direto no painel da Kairóss só apareceriam aqui depois de o usuário
    // passar pela tela Catálogo (onde esse sync automático já existia).
    fetch("/api/integrations/kaiross/sincronizar", { method: "POST" })
      .catch(() => {})
      .finally(load);
  }, [load]);

  async function handleSincronizar() {
    setIsSyncing(true);
    try {
      const result = await sincronizar();
      toast.success(
        `Sincronizado: ${result.updated} atualizado(s), ${result.addedFromKaiross} adicionado(s), ${result.removedRemotely} removido(s).`,
      );
      load();
    } catch (err) {
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleSincronizar} disabled={isSyncing}>
          <RefreshCw data-icon="inline-start" className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "Sincronizando..." : "Sincronizar com a Kairóss"}
        </Button>
      </div>
      <KpiCards products={products} />
      <ProductsSection
        products={products}
        pendingIds={pendingIds}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
      />
    </div>
  );
}

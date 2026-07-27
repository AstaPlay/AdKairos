"use client";

import * as React from "react";

import { Flame, LayoutGrid, LogOut, PackageSearch, RefreshCw, Search, ShieldCheck, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAsyncAction } from "@/hooks/use-async-action";

import { CatalogAffiliateSheet, type AfiliarResult } from "./catalog-affiliate-sheet";
import { CatalogCategorySheet, type CategoryNode } from "./catalog-category-sheet";
import { CatalogConnectCard, type ConnectionStatus } from "./catalog-connect-card";
import { CatalogProductCard, type KairoossCatalogProduct } from "./catalog-product-card";

interface CatalogResponse {
  products: KairoossCatalogProduct[];
  total: number;
  maxSalesCount: number;
}

async function fetchStatus(): Promise<ConnectionStatus> {
  const response = await fetch("/api/integrations/kaiross");
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível verificar a conexão.");
  return json.data as ConnectionStatus;
}

async function disconnect(): Promise<null> {
  const response = await fetch("/api/integrations/kaiross", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "logout" }),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível desconectar.");
  return null;
}

async function fetchCatalog(params: {
  busca: string;
  maisVendidos: boolean;
  tipo: "nacional" | "internacional";
  categoria: string;
  apenasEstoque: boolean;
}): Promise<CatalogResponse> {
  const query = new URLSearchParams();
  if (params.busca) query.set("busca", params.busca);
  if (params.maisVendidos) query.set("maisVendidos", "true");
  if (params.tipo === "internacional") query.set("tipo", "internacional");
  if (params.categoria) query.set("categoria", params.categoria);
  if (!params.apenasEstoque) query.set("apenasEstoque", "false");

  const response = await fetch(`/api/integrations/kaiross/produtos?${query.toString()}`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar o catálogo agora.");
  return json.data as CatalogResponse;
}

interface SyncSummary {
  checked: number;
  removedRemotely: number;
  updated: number;
  unchanged: number;
  addedFromKaiross: number;
}

async function sincronizar(): Promise<SyncSummary> {
  const response = await fetch("/api/integrations/kaiross/sincronizar", { method: "POST" });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível sincronizar agora.");
  return json.data as SyncSummary;
}

export function CatalogSection() {
  const [status, setStatus] = React.useState<ConnectionStatus | null>(null);
  const [hasCheckedStatus, setHasCheckedStatus] = React.useState(false);

  const [busca, setBusca] = React.useState("");
  const [buscaDebounced, setBuscaDebounced] = React.useState("");
  const [apenasMaisVendidos, setApenasMaisVendidos] = React.useState(false);
  const [apenasEstoque, setApenasEstoque] = React.useState(true);
  const [tipo, setTipo] = React.useState<"nacional" | "internacional">("nacional");
  const [categoriaSelecionada, setCategoriaSelecionada] = React.useState<CategoryNode | null>(null);
  const [categoriesOpen, setCategoriesOpen] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<KairoossCatalogProduct | null>(null);
  const [savedProductIds, setSavedProductIds] = React.useState<Set<string>>(new Set());
  const [syncSummary, setSyncSummary] = React.useState<SyncSummary | null>(null);

  const disconnectAction = useAsyncAction(disconnect);
  const catalogAction = useAsyncAction(fetchCatalog);
  const syncAction = useAsyncAction(sincronizar);

  React.useEffect(() => {
    let cancelled = false;
    fetchStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false, email: null });
      })
      .finally(() => {
        if (!cancelled) setHasCheckedStatus(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sincronização silenciosa em segundo plano ao conectar — best-effort, não
  // bloqueia a UI nem mostra erro se falhar; o botão "Sincronizar" continua
  // disponível para o usuário forçar isso manualmente.
  React.useEffect(() => {
    if (!status?.connected) return;
    fetch("/api/integrations/kaiross/sincronizar", { method: "POST" }).catch(() => {});
  }, [status?.connected]);

  React.useEffect(() => {
    if (!status?.connected) return;
    const timeout = setTimeout(() => setBuscaDebounced(busca), 350);
    return () => clearTimeout(timeout);
  }, [busca, status?.connected]);

  React.useEffect(() => {
    setCategoriaSelecionada(null);
  }, [tipo]);

  React.useEffect(() => {
    if (!status?.connected) return;
    catalogAction.execute({
      busca: buscaDebounced,
      maisVendidos: apenasMaisVendidos,
      tipo,
      categoria: categoriaSelecionada?.fullPath ?? "",
      apenasEstoque,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch controlado por busca/filtro/tipo/categoria/estoque
  }, [status?.connected, buscaDebounced, apenasMaisVendidos, tipo, categoriaSelecionada, apenasEstoque]);

  function refetchCatalog() {
    catalogAction.execute({
      busca: buscaDebounced,
      maisVendidos: apenasMaisVendidos,
      tipo,
      categoria: categoriaSelecionada?.fullPath ?? "",
      apenasEstoque,
    });
  }

  async function handleDisconnect() {
    const result = await disconnectAction.execute();
    if (result === null) {
      setStatus({ connected: false, email: null });
      setSavedProductIds(new Set());
    }
  }

  async function handleSincronizar() {
    const result = await syncAction.execute();
    if (result) {
      setSyncSummary(result);
      refetchCatalog();
      setTimeout(() => setSyncSummary(null), 5000);
    }
  }

  function handleProductSaved(result: AfiliarResult) {
    if (selectedProduct) {
      setSavedProductIds((current) => new Set(current).add(selectedProduct.kairoossProductId));
    }
    setSelectedProduct(null);
  }

  function handleOpenExisting(localProductId: string) {
    window.location.href = `/dashboard/produtos?highlight=${localProductId}`;
  }

  if (!hasCheckedStatus || !status) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[4/5.2] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!status.connected) {
    return <CatalogConnectCard isCheckingStatus={false} onConnected={setStatus} />;
  }

  const products = catalogAction.data?.products ?? [];
  const maxSalesCount = catalogAction.data?.maxSalesCount ?? 0;

  const mergedProducts = products.map((product) =>
    savedProductIds.has(product.kairoossProductId) && !product.localProductId
      ? { ...product, localProductId: product.kairoossProductId }
      : product,
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-primary uppercase tracking-[0.08em]">
          <ShieldCheck className="size-3" strokeWidth={2} />
          Conectado {status.email ? `· ${status.email}` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleSincronizar} disabled={syncAction.isLoading}>
            <RefreshCw data-icon="inline-start" className={syncAction.isLoading ? "animate-spin" : ""} />
            {syncAction.isLoading ? "Sincronizando..." : "Sincronizar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDisconnect} disabled={disconnectAction.isLoading}>
            <LogOut data-icon="inline-start" />
            Desconectar
          </Button>
        </div>
      </div>

      {syncSummary && (
        <Alert className="animate-in fade-in">
          <AlertDescription>
            Sincronização concluída: {syncSummary.updated} atualizado(s), {syncSummary.addedFromKaiross} adicionado(s),{" "}
            {syncSummary.removedRemotely} removido(s).
          </AlertDescription>
        </Alert>
      )}

      {syncAction.error && (
        <Alert variant="destructive">
          <AlertDescription>{syncAction.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, marca ou SKU..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tipo} onValueChange={(value) => setTipo(value as "nacional" | "internacional")}>
            <TabsList>
              <TabsTrigger value="nacional">Nacional</TabsTrigger>
              <TabsTrigger value="internacional">Internacional</TabsTrigger>
            </TabsList>
          </Tabs>

          {tipo === "nacional" && (
            <Button variant={apenasMaisVendidos ? "default" : "outline"} size="sm" onClick={() => setApenasMaisVendidos((v) => !v)}>
              <Flame data-icon="inline-start" />
              Mais vendidos
            </Button>
          )}

          <Button variant={categoriaSelecionada ? "default" : "outline"} size="sm" onClick={() => setCategoriesOpen(true)}>
            <LayoutGrid data-icon="inline-start" />
            {categoriaSelecionada ? categoriaSelecionada.name : "Categorias"}
          </Button>

          {categoriaSelecionada && (
            <Button variant="ghost" size="sm" onClick={() => setCategoriaSelecionada(null)}>
              <X data-icon="inline-start" className="size-3.5" />
              Limpar
            </Button>
          )}

          <label className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm select-none">
            <Checkbox checked={apenasEstoque} onCheckedChange={(checked) => setApenasEstoque(checked === true)} />
            Em estoque
          </label>
        </div>
      </div>

      {catalogAction.error && (
        <Alert variant="destructive">
          <AlertDescription>{catalogAction.error}</AlertDescription>
        </Alert>
      )}

      {catalogAction.isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/5.2] w-full rounded-xl" />
          ))}
        </div>
      )}

      {!catalogAction.isLoading && mergedProducts.length === 0 && !catalogAction.error && (
        <Empty className="rounded-lg border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageSearch />
            </EmptyMedia>
            <EmptyTitle>Nenhum produto encontrado</EmptyTitle>
            <EmptyDescription>
              {categoriaSelecionada
                ? `Nenhum produto em "${categoriaSelecionada.name}" com os filtros atuais.`
                : apenasMaisVendidos
                  ? "Nenhum produto com dado de vendas suficiente ainda."
                  : tipo === "internacional"
                    ? "Nenhum produto internacional encontrado com esses filtros."
                    : "Tente ajustar sua busca ou aguarde — o catálogo pode levar alguns segundos para carregar."}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={refetchCatalog} className="gap-1.5">
            <RefreshCw className="size-3.5" strokeWidth={2} />
            Buscar novamente
          </Button>
        </Empty>
      )}

      {!catalogAction.isLoading && mergedProducts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {mergedProducts.map((product, index) => (
            <CatalogProductCard
              key={product.kairoossProductId}
              product={product}
              maxSalesCount={maxSalesCount}
              index={index}
              onClick={setSelectedProduct}
              onOpenExisting={handleOpenExisting}
            />
          ))}
        </div>
      )}

      <CatalogCategorySheet
        open={categoriesOpen}
        tipo={tipo}
        selected={categoriaSelecionada}
        onSelect={setCategoriaSelecionada}
        onClose={() => setCategoriesOpen(false)}
      />

      <CatalogAffiliateSheet
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onSaved={handleProductSaved}
        onViewExisting={handleOpenExisting}
      />
    </section>
  );
}

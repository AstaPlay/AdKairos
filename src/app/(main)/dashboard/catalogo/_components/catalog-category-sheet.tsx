"use client";

import * as React from "react";

import { Check, ChevronRight, LayoutGrid } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/utils/get-error-message";

import type { KairoossCatalogProduct } from "./catalog-product-card";

export interface CategoryNode {
  name: string;
  fullPath: string;
  children: CategoryNode[];
  /** Produtos cujo `category` bate exatamente com este path — dado real,
   * contado a partir da mesma lista usada para montar a árvore. Não soma os
   * filhos automaticamente: cada nó mostra só o que está diretamente nele,
   * evitando dar a entender que existe um produto que na verdade está numa
   * subcategoria mais específica. */
  productCount: number;
}

function insertCategoryPath(nodes: CategoryNode[], segments: string[], accumulatedPath: string): void {
  const [head, ...rest] = segments;
  if (!head) return;

  const fullPath = accumulatedPath ? `${accumulatedPath} > ${head}` : head;
  let node = nodes.find((candidate) => candidate.name === head);
  if (!node) {
    node = { name: head, fullPath, children: [], productCount: 0 };
    nodes.push(node);
  }
  if (rest.length > 0) insertCategoryPath(node.children, rest, fullPath);
}

export function buildCategoryTree(categoryPaths: string[]): CategoryNode[] {
  const roots: CategoryNode[] = [];
  const countByPath = new Map<string, number>();
  for (const path of categoryPaths) {
    countByPath.set(path, (countByPath.get(path) ?? 0) + 1);
    const segments = path
      .split(">")
      .map((segment) => segment.trim())
      .filter(Boolean);
    insertCategoryPath(roots, segments, "");
  }
  const applyCounts = (nodes: CategoryNode[]): CategoryNode[] =>
    nodes
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((node) => ({
        ...node,
        productCount: countByPath.get(node.fullPath) ?? 0,
        children: applyCounts(node.children),
      }));
  return applyCounts(roots);
}

export interface CatalogCategorySheetProps {
  open: boolean;
  tipo: "nacional" | "internacional";
  selected: CategoryNode | null;
  onSelect: (node: CategoryNode | null) => void;
  onClose: () => void;
}

/**
 * Sheet dedicado para escolher categoria/subcategoria — busca o catálogo
 * completo (sem filtros) uma única vez ao abrir, para montar a árvore a
 * partir de `product.category` (formato "Cat > Sub" que a Kairóss entrega).
 * Fetch próprio e isolado, sem depender do estado de carregamento da grade
 * principal — evita loading cruzado entre os dois.
 */
export function CatalogCategorySheet({ open, tipo, selected, onSelect, onClose }: CatalogCategorySheetProps) {
  const isMobile = useIsMobile();
  const [categories, setCategories] = React.useState<string[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (tipo === "internacional") query.set("tipo", "internacional");

    // Timeout de segurança — a chamada à Kairóss (via nossa rota) pode
    // legitimamente levar até ~30s sem cache. Sem isso, uma resposta lenta
    // deixa o usuário olhando o skeleton sem nenhum feedback de erro.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35_000);

    fetch(`/api/integrations/kaiross/produtos?${query.toString()}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) throw new Error(json.error?.message ?? "Não foi possível carregar categorias.");
        const products = (json.data?.products ?? []) as KairoossCatalogProduct[];
        // Mantém repetições — buildCategoryTree usa a contagem de ocorrências
        // para saber quantos produtos existem em cada categoria/subcategoria.
        // Deduplicar aqui faria todo nó folha aparecer sempre com 1 produto,
        // mesmo quando há vários.
        const allCategories = products.map((product) => product.category).filter(Boolean);
        setCategories(allCategories);
      })
      .catch((caughtError) => {
        if (cancelled) return;
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
          setError("A Kairóss demorou demais para responder. Tente novamente.");
          return;
        }
        setError(getErrorMessage(caughtError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [open, tipo]);

  const tree = React.useMemo(() => buildCategoryTree(categories ?? []), [categories]);

  function toggleExpanded(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAndClose(node: CategoryNode | null) {
    onSelect(node);
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        onOpenAutoFocus={(event) => event.preventDefault()}
        style={isMobile ? { height: "85svh", maxHeight: "85svh" } : undefined}
        className={cn("flex flex-col gap-0 overflow-hidden p-0 sm:max-w-sm", isMobile && "rounded-t-3xl border-t")}
      >
        {isMobile && (
          <div className="flex shrink-0 justify-center pt-2.5 pb-1">
            <div className="h-1 w-9 rounded-full bg-muted-foreground/25" />
          </div>
        )}

        <SheetHeader className="shrink-0 gap-0.5 pb-3">
          <SheetTitle className="flex items-center gap-1.5">
            <LayoutGrid className="size-4 text-primary" strokeWidth={2} />
            Categorias
          </SheetTitle>
          <SheetDescription>Filtre o catálogo por categoria ou subcategoria.</SheetDescription>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        >
          {selected && (
            <button
              type="button"
              onClick={() => selectAndClose(null)}
              className="fade-in flex animate-in items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/[0.08] px-3.5 py-2.5 text-left font-semibold text-[12.5px] text-primary transition-colors duration-200 hover:bg-primary/[0.12]"
            >
              Limpar filtro atual ({selected.name})
            </button>
          )}

          {isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && tree.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutGrid />
                </EmptyMedia>
                <EmptyTitle>Nenhuma categoria encontrada</EmptyTitle>
                <EmptyDescription>Ainda não há categorias suficientes no catálogo para filtrar.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && !error && tree.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {tree.map((node) => {
                const isNodeExpanded = expanded.has(node.fullPath);
                const isNodeSelected = selected?.fullPath === node.fullPath;
                const hasChildren = node.children.length > 0;

                return (
                  <Collapsible
                    key={node.fullPath}
                    open={isNodeExpanded}
                    onOpenChange={() => toggleExpanded(node.fullPath)}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1 rounded-lg transition-colors duration-150",
                        isNodeSelected ? "bg-primary/[0.10]" : "hover:bg-accent",
                      )}
                    >
                      {hasChildren ? (
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            aria-label={isNodeExpanded ? `Recolher ${node.name}` : `Expandir ${node.name}`}
                            className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-foreground"
                          >
                            <ChevronRight
                              className={cn("size-4 transition-transform duration-200", isNodeExpanded && "rotate-90")}
                              strokeWidth={2}
                            />
                          </button>
                        </CollapsibleTrigger>
                      ) : (
                        <span className="w-10 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => selectAndClose(node)}
                        className="flex flex-1 items-center justify-between gap-2 py-2.5 pr-3.5 text-left font-medium text-sm"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{node.name}</span>
                          {hasChildren && (
                            <span className="shrink-0 font-normal text-[11px] text-muted-foreground">
                              ({node.children.length} subcategoria{node.children.length === 1 ? "" : "s"})
                            </span>
                          )}
                          {!hasChildren && node.productCount > 0 && (
                            <span className="shrink-0 font-normal text-[11px] text-muted-foreground">
                              ({node.productCount})
                            </span>
                          )}
                        </span>
                        {isNodeSelected && <Check className="size-4 shrink-0 text-primary" strokeWidth={2.5} />}
                      </button>
                    </div>

                    {hasChildren && (
                      <CollapsibleContent className="ml-9 flex flex-col gap-0.5 border-l pl-2.5">
                        {node.children.map((child) => {
                          const isChildSelected = selected?.fullPath === child.fullPath;
                          return (
                            <button
                              key={child.fullPath}
                              type="button"
                              onClick={() => selectAndClose(child)}
                              className={cn(
                                "flex items-center justify-between gap-2 truncate rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors duration-150",
                                isChildSelected
                                  ? "bg-primary/[0.10] font-medium text-primary"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                              )}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <span className="truncate">{child.name}</span>
                                {child.productCount > 0 && (
                                  <span className="shrink-0 text-[11px] opacity-70">({child.productCount})</span>
                                )}
                              </span>
                              {isChildSelected && <Check className="size-3.5 shrink-0" strokeWidth={2.5} />}
                            </button>
                          );
                        })}
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

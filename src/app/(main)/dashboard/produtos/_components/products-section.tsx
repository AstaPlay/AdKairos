"use client";

import * as React from "react";
import Link from "next/link";

import { ChevronDownIcon, ListFilter, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

import { ProductCard } from "./product-card";
import { ProductDetailSheet } from "./product-detail-sheet";
import productsData from "./produtos-table/data.json";
import { productsSchema, type ProductRow } from "./produtos-table/schema";

const statFilterOptions = ["all", "active", "paused", "out_of_stock"] as const;
const statFilterLabel: Record<(typeof statFilterOptions)[number], string> = {
  all: "Todos",
  active: "Ativos",
  paused: "Pausados",
  out_of_stock: "Estoque zerado",
};

const sourceOptions = ["all", "kaiross", "manual"] as const;
const sourceLabel: Record<(typeof sourceOptions)[number], string> = {
  all: "Qualquer origem",
  kaiross: "Kairóss",
  manual: "Manual",
};

const initialProducts = productsSchema.parse(productsData);
const PAGE_SIZE = 8;

function checkoutUrlFor(product: ProductRow) {
  return `https://pay.kaiross.com.br/${product.id}`;
}

export function ProductsSection() {
  const [products, setProducts] = React.useState<ProductRow[]>(initialProducts);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<(typeof statFilterOptions)[number]>("all");
  const [sourceFilter, setSourceFilter] = React.useState<(typeof sourceOptions)[number]>("all");
  const [pageIndex, setPageIndex] = React.useState(0);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [detailProduct, setDetailProduct] = React.useState<ProductRow | null>(null);

  const statusCounts = React.useMemo(() => {
    return {
      all: products.length,
      active: products.filter((product) => product.status === "active").length,
      paused: products.filter((product) => product.status === "paused").length,
      out_of_stock: products.filter((product) => product.status === "out_of_stock" || product.stock === 0).length,
    } satisfies Record<(typeof statFilterOptions)[number], number>;
  }, [products]);

  const filtered = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "out_of_stock"
          ? product.status === "out_of_stock" || product.stock === 0
          : product.status === statusFilter);
      const matchesSource = sourceFilter === "all" || product.source === sourceFilter;
      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [products, search, statusFilter, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageItems = filtered.slice(safePageIndex * PAGE_SIZE, safePageIndex * PAGE_SIZE + PAGE_SIZE);
  const currentPage = safePageIndex + 1;
  const pageNumbers = React.useMemo(() => {
    if (pageCount <= 3) return Array.from({ length: pageCount }, (_, index) => index + 1);
    if (currentPage <= 2) return [1, 2, 3];
    if (currentPage >= pageCount - 1) return [pageCount - 2, pageCount - 1, pageCount];
    return [currentPage - 1, currentPage, currentPage + 1];
  }, [currentPage, pageCount]);

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleCopyCheckout(product: ProductRow) {
    navigator.clipboard
      .writeText(checkoutUrlFor(product))
      .then(() => toast.success("Link de checkout copiado"))
      .catch(() => toast.error("Não foi possível copiar o link"));
  }

  function handleTogglePause(product: ProductRow) {
    const nextStatus = product.status === "paused" ? "active" : "paused";
    setProducts((previous) => previous.map((item) => (item.id === product.id ? { ...item, status: nextStatus } : item)));
    toast.success(nextStatus === "paused" ? "Vendas pausadas" : "Vendas reativadas");
  }

  function handleRemove(product: ProductRow) {
    setProducts((previous) => previous.filter((item) => item.id !== product.id));
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(product.id);
      return next;
    });
    toast.success("Produto removido da vitrine");
  }

  function preventNav(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
  }

  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle className="leading-none">Produtos</CardTitle>
          <CardDescription>Catálogo de produtos afiliados e cadastrados manualmente.</CardDescription>
          <CardAction className="w-full lg:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-7 w-full xs:w-40 md:w-52"
                placeholder="Buscar produto..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPageIndex(0);
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ListFilter data-icon="inline-start" />
                    Origem
                    <ChevronDownIcon data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuRadioGroup
                    value={sourceFilter}
                    onValueChange={(value) => {
                      setSourceFilter(value as (typeof sourceOptions)[number]);
                      setPageIndex(0);
                    }}
                  >
                    {sourceOptions.map((option) => (
                      <DropdownMenuRadioItem key={option} value={option}>
                        {sourceLabel[option]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/dashboard/catalogo">
                  <Sparkles data-icon="inline-start" />
                  Importar da Kairóss
                </Link>
              </Button>
              <Button size="sm">
                <Plus data-icon="inline-start" />
                Novo produto
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {statFilterOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setStatusFilter(option);
                  setPageIndex(0);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {statFilterLabel[option]}
                <span
                  className={cn(
                    "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                    statusFilter === option ? "bg-primary-foreground/20" : "bg-muted",
                  )}
                >
                  {statusCounts[option]}
                </span>
              </button>
            ))}
          </div>

          {pageItems.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {pageItems.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selected={selectedIds.has(product.id)}
                  onToggleSelect={(checked) => toggleSelect(product.id, checked)}
                  onOpenDetail={() => setDetailProduct(product)}
                  onCopyCheckout={product.source === "kaiross" ? () => handleCopyCheckout(product) : undefined}
                  onTogglePause={() => handleTogglePause(product)}
                  onRemove={() => handleRemove(product)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">Nenhum produto encontrado.</p>
              <p className="text-muted-foreground text-xs">Tente ajustar a busca ou os filtros aplicados.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 px-1 pb-1">
            <p className="text-muted-foreground text-sm">
              Exibindo {pageItems.length} de {filtered.length.toLocaleString("pt-BR")} produtos
            </p>

            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent className="gap-1.5">
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    className={safePageIndex === 0 ? "pointer-events-none opacity-50" : undefined}
                    onClick={(event) => {
                      preventNav(event);
                      setPageIndex((previous) => Math.max(0, previous - 1));
                    }}
                  />
                </PaginationItem>
                {pageNumbers[0] > 1 ? (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : null}
                {pageNumbers.map((pageNumber) => (
                  <PaginationItem key={`page-${pageNumber}`}>
                    <PaginationLink
                      href="#"
                      isActive={safePageIndex === pageNumber - 1}
                      onClick={(event) => {
                        preventNav(event);
                        setPageIndex(pageNumber - 1);
                      }}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                {pageNumbers[pageNumbers.length - 1] < pageCount ? (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : null}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    className={safePageIndex >= pageCount - 1 ? "pointer-events-none opacity-50" : undefined}
                    onClick={(event) => {
                      preventNav(event);
                      setPageIndex((previous) => Math.min(pageCount - 1, previous + 1));
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>

      <ProductDetailSheet product={detailProduct} onClose={() => setDetailProduct(null)} />
    </section>
  );
}

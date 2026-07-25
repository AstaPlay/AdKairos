"use client";

import { Check, Flame, Globe, ImageOff, PackageX, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Produto do catálogo real da Kairóss — espelha o payload de GET /api/integrations/kaiross/produtos. */
export interface KairoossCatalogProduct {
  kairoossProductId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  images: string[];
  isInternational: boolean;
  isActive: boolean;
  salesCount: number;
  sku?: string;
  brand?: string;
  /** Id do produto no catálogo local do Kairos, se este item já foi afiliado antes. Null se ainda não. */
  localProductId: string | null;
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MAX_STAGGER_MS = 420;
const STAGGER_STEP_MS = 30;

export function CatalogProductCard({
  product,
  maxSalesCount,
  index = 0,
  onClick,
  onOpenExisting,
}: {
  product: KairoossCatalogProduct;
  maxSalesCount: number;
  index?: number;
  onClick: (product: KairoossCatalogProduct) => void;
  onOpenExisting?: (localProductId: string) => void;
}) {
  const alreadySaved = Boolean(product.localProductId);
  const outOfStock = !product.isActive || (!product.isInternational && product.stock <= 0);
  const isLocked = alreadySaved && !product.localProductId && !onOpenExisting;
  const salesPct = product.salesCount > 0 && maxSalesCount > 0 ? Math.round((product.salesCount / maxSalesCount) * 100) : 0;
  const isHot = salesPct >= 50;
  const isTrending = product.salesCount > 0 && !isHot;
  const delayMs = Math.min(index * STAGGER_STEP_MS, MAX_STAGGER_MS);
  const coverImage = product.images[0];

  function handleClick() {
    if (outOfStock || isLocked) return;
    if (alreadySaved && product.localProductId) {
      onOpenExisting?.(product.localProductId);
      return;
    }
    if (!alreadySaved) onClick(product);
  }

  return (
    <Card
      role="button"
      tabIndex={outOfStock || isLocked ? -1 : 0}
      aria-disabled={outOfStock || isLocked || undefined}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (!outOfStock && !isLocked && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          handleClick();
        }
      }}
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        "group animate-in fade-in slide-in-from-bottom-2 gap-3 overflow-hidden py-0 fill-mode-backwards transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-lg",
        outOfStock || isLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:ring-1 hover:ring-primary/40",
        alreadySaved && "ring-1 ring-emerald-500/30",
      )}
    >
      <div className="relative aspect-[4/3.2] shrink-0 overflow-hidden bg-muted">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagem remota do catálogo Kairóss
          <img
            src={coverImage}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40">
            <ImageOff className="size-6" strokeWidth={1.5} />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

        <div className="absolute top-2 left-2 flex max-w-[calc(100%-2.5rem)] flex-col items-start gap-1">
          {product.isInternational && (
            <Badge variant="outline" className="gap-1 border-white/20 bg-black/55 text-[10px] text-white backdrop-blur-md">
              <Globe className="size-3" strokeWidth={2} />
              Internacional
            </Badge>
          )}
          {outOfStock && (
            <Badge variant="outline" className="gap-1 border-white/20 bg-black/55 text-[10px] text-white backdrop-blur-md">
              <PackageX className="size-3" strokeWidth={2} />
              Sem estoque
            </Badge>
          )}
        </div>

        {!outOfStock && (isHot || isTrending) && (
          <div
            className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border border-amber-400/30 bg-black/55 backdrop-blur-md"
            title={`${product.salesCount} vendas recentes`}
          >
            {isHot ? (
              <Flame className="size-3 text-amber-400" strokeWidth={2} />
            ) : (
              <TrendingUp className="size-3 text-amber-400" strokeWidth={2} />
            )}
          </div>
        )}

        {alreadySaved && (
          <div className="absolute right-2 bottom-2 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="size-3.5" strokeWidth={3} />
          </div>
        )}
      </div>

      <CardContent className="flex flex-col gap-2 pb-4">
        <div className="flex flex-col gap-0.5">
          {product.brand && (
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{product.brand}</span>
          )}
          <h3 className="line-clamp-2 min-h-[2.4em] text-sm leading-snug font-medium">{product.name}</h3>
          <span className="text-muted-foreground text-xs">{product.category}</span>
        </div>

        <div className="mt-1 flex items-end justify-between">
          <span className="text-lg font-semibold text-primary tabular-nums">{currency(product.price)}</span>
          {!product.isInternational && (
            <span className="text-muted-foreground text-xs tabular-nums">{product.stock} un</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

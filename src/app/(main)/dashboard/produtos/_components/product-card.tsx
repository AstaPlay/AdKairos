"use client";

import { Copy, ImageOff, MoreVertical, PauseCircle, PlayCircle, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { ProductRow, ProductStatus } from "./produtos-table/schema";

const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Pausado",
  out_of_stock: "Sem estoque",
};

const STATUS_BADGE_CLASS: Record<ProductStatus, string> = {
  draft: "border-transparent bg-zinc-600 text-white dark:bg-zinc-500",
  active: "border-transparent bg-emerald-600 text-white dark:bg-emerald-500",
  paused: "border-transparent bg-amber-500 text-white",
  out_of_stock: "border-transparent bg-red-600 text-white",
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductCard({
  product,
  selected,
  highlighted,
  pending,
  onToggleSelect,
  onOpenDetail,
  onCopyCheckout,
  onTogglePause,
  onRemove,
}: {
  product: ProductRow;
  selected: boolean;
  highlighted?: boolean;
  pending?: boolean;
  onToggleSelect: (checked: boolean) => void;
  onOpenDetail: () => void;
  onCopyCheckout?: () => void;
  onTogglePause?: () => void;
  onRemove?: () => void;
}) {
  return (
    <Card
      className={cn(
        "gap-3 py-0 transition-colors",
        "cursor-pointer hover:ring-primary/40",
        highlighted && "ring-2 ring-primary/50",
        pending && "pointer-events-none opacity-60",
      )}
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetail();
        }
      }}
    >
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagem remota do catálogo
          <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40">
            <ImageOff className="size-6" strokeWidth={1.5} />
          </div>
        )}

        <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold shadow-sm ring-1 ring-black/10",
              STATUS_BADGE_CLASS[product.status],
            )}
          >
            {STATUS_LABEL[product.status]}
          </Badge>
        </div>

        {product.source === "kaiross" && (
          <div className="absolute right-2 top-2 z-10">
            <Badge
              variant="outline"
              className="gap-1 border-white/20 bg-black/55 text-[10px] text-white backdrop-blur-md"
            >
              <Sparkles className="size-3" strokeWidth={2} />
              Kairóss
            </Badge>
          </div>
        )}

        <div className="absolute bottom-2 left-2" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggleSelect(event.target.checked)}
            aria-label={`Selecionar ${product.name}`}
            className="size-4 cursor-pointer rounded border-white/40 bg-black/40 accent-primary"
          />
        </div>

        {(onCopyCheckout || onTogglePause || onRemove) && (
          <div className="absolute bottom-2 right-2" onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais ações"
                  className="flex size-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/65"
                >
                  <MoreVertical className="size-3.5" strokeWidth={2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onCopyCheckout && (
                  <DropdownMenuItem onSelect={onCopyCheckout}>
                    <Copy data-icon="inline-start" className="size-3.5" />
                    Copiar link de checkout
                  </DropdownMenuItem>
                )}
                {onTogglePause && (
                  <DropdownMenuItem onSelect={onTogglePause}>
                    {product.status === "paused" ? (
                      <>
                        <PlayCircle data-icon="inline-start" className="size-3.5" />
                        Ativar vendas
                      </>
                    ) : (
                      <>
                        <PauseCircle data-icon="inline-start" className="size-3.5" />
                        Pausar vendas
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {onRemove && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                      <Trash2 data-icon="inline-start" className="size-3.5" />
                      Remover da vitrine
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <CardContent className="flex flex-col gap-2 pb-4">
        <div className="flex flex-col gap-0.5">
          {product.brand && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {product.brand}
            </span>
          )}
          <h3 className="line-clamp-2 min-h-[2.4em] text-sm font-medium leading-snug">{product.name}</h3>
          <span className="text-muted-foreground text-xs">{product.category}</span>
        </div>

        <div className="mt-1 flex items-end justify-between">
          <span className="text-lg font-semibold tabular-nums text-primary">{currency(product.price)}</span>
          <span className={cn("text-xs tabular-nums", product.stock === 0 ? "text-destructive" : "text-muted-foreground")}>
            {product.stock} un
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

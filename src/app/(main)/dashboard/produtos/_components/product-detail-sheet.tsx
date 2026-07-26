"use client";

import * as React from "react";

import { Sparkles, Tag, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import type { ProductRow, ProductStatus } from "./produtos-table/schema";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function marginTone(marginPct: number): { label: string; className: string } {
  if (marginPct >= 40) return { label: "Margem saudável", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (marginPct >= 20) return { label: "Margem apertada", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: "Margem ruim", className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" };
}

export function ProductDetailSheet({
  product,
  pending,
  onClose,
  onSave,
  onRemove,
}: {
  product: ProductRow | null;
  pending?: boolean;
  onClose: () => void;
  onSave: (updates: { status: ProductStatus; price: number }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const isOpen = product !== null;
  const [salePrice, setSalePrice] = React.useState(product?.price ?? 0);
  const [isActive, setIsActive] = React.useState(product?.status === "active");
  const [isDirty, setIsDirty] = React.useState(false);

  React.useEffect(() => {
    if (product) {
      setSalePrice(product.price);
      setIsActive(product.status === "active");
      setIsDirty(false);
    }
  }, [product]);

  function handlePriceChange(value: number) {
    setSalePrice(value);
    setIsDirty(true);
  }

  function handleActiveChange(value: boolean) {
    setIsActive(value);
    setIsDirty(true);
  }

  async function handleSave() {
    if (!product) return;
    await onSave({ status: isActive ? "active" : (product.status === "out_of_stock" ? "out_of_stock" : "paused"), price: salePrice });
    setIsDirty(false);
  }

  const cost = product?.cost ?? 0;
  const margin = product ? salePrice - cost : 0;
  const marginPct = product && salePrice > 0 ? Math.round((margin / salePrice) * 100) : 0;
  const tone = marginTone(marginPct);
  const minPrice = product ? Math.max(cost, 1) : 0;
  const maxPrice = product ? Math.round(product.price * 1.6) : 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {product && (
          <>
            <SheetHeader>
              <SheetTitle>{product.name}</SheetTitle>
              <SheetDescription>
                {product.sku ? `SKU ${product.sku} · ` : ""}
                {product.category}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Produto ativo</p>
                  <p className="text-muted-foreground text-xs">Visível para venda no WhatsApp AI e CRM</p>
                </div>
                <Switch checked={isActive} onCheckedChange={handleActiveChange} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Preço de venda</p>
                  <p className="text-lg font-semibold tabular-nums">{currency(salePrice)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Custo</p>
                  <p className="text-lg font-semibold tabular-nums">{currency(cost)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Margem estimada</p>
                  <p className="text-lg font-semibold tabular-nums">{currency(margin)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Margem %</p>
                  <p className="text-lg font-semibold tabular-nums">{marginPct}%</p>
                </div>
              </div>

              <Badge variant="outline" className={`w-fit gap-1.5 ${tone.className}`}>
                {tone.label}
              </Badge>

              {cost > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-xs">Ajustar preço de venda</Label>
                    <span className="text-sm font-medium tabular-nums">{currency(salePrice)}</span>
                  </div>
                  <Slider
                    value={[salePrice]}
                    min={minPrice}
                    max={maxPrice}
                    step={0.5}
                    onValueChange={([value]) => handlePriceChange(value)}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                <span
                  className={
                    product.stock === 0
                      ? "inline-flex items-center rounded-md border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                      : "inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground"
                  }
                >
                  {product.stock} un em estoque
                </span>
                {typeof product.salesCount === "number" && (
                  <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
                    {product.salesCount} vendas
                  </span>
                )}
                {product.source === "kaiross" && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary">
                    <Sparkles className="size-3" strokeWidth={2} />
                    Kairóss
                  </span>
                )}
              </div>

              {product.description && <p className="text-muted-foreground text-sm">{product.description}</p>}

              {product.tags && product.tags.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Tag className="size-3.5" strokeWidth={2} />
                    Tags para o bot
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[11px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <SheetFooter className="flex-row gap-2">
              <Button variant="outline" className="flex-1" disabled={!isDirty || pending} onClick={handleSave}>
                {pending ? "Salvando..." : "Salvar alterações"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover produto"
                disabled={pending}
                onClick={onRemove}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

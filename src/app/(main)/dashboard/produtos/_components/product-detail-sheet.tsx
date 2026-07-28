"use client";

import * as React from "react";

import {
  Check,
  Clapperboard,
  Copy,
  ExternalLink,
  FileQuestion,
  ImageOff,
  Package,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAsyncAction } from "@/hooks/use-async-action";
import { useIsMobile } from "@/hooks/use-mobile";
import { calcularPrecificacao, STATUS_MARGEM_STYLE } from "@/lib/kaiross-pricing";
import { cn } from "@/lib/utils";

import type { ProductRow, ProductStatus } from "./produtos-table/schema";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function gerarPalavrasChave(context: {
  name: string;
  description?: string;
  category?: string;
}): Promise<string[]> {
  const response = await fetch("/api/ai/produtos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "gerarKeywords", context }),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível gerar palavras-chave.");
  return json.data as string[];
}

/**
 * Ações de IA "em breve" — o backend real (FAQ, roteiro para o Google Flow)
 * ainda depende do Enxame, que não foi portado para este painel (ver
 * `src/app/api/ai/produtos/route.ts`). Ficam visíveis para o usuário saber
 * que a função existe e está a caminho, mas desabilitadas — nunca chamam a
 * API para não devolver um erro genérico sem contexto.
 */
function ComingSoonAiAction({ icon: Icon, label, hint }: { icon: typeof FileQuestion; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 opacity-70">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight">{label}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px] font-medium text-muted-foreground">
        Em breve
      </Badge>
    </div>
  );
}

export function ProductDetailSheet({
  product,
  pending,
  onClose,
  onSave,
  onGenerateTags,
  onRemove,
}: {
  product: ProductRow | null;
  pending?: boolean;
  onClose: () => void;
  onSave: (updates: {
    status: ProductStatus;
    price: number;
    freteCobrado?: number;
    custoFrete?: number;
    clientePagaFrete?: boolean;
  }) => Promise<boolean | void>;
  onGenerateTags?: (tags: string[]) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  const isOpen = product !== null;
  const isMobile = useIsMobile();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const [salePrice, setSalePrice] = React.useState(product?.price ?? 0);
  const [isActive, setIsActive] = React.useState(product?.status === "active");
  const [isDirty, setIsDirty] = React.useState(false);
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [brandedLinkCopied, setBrandedLinkCopied] = React.useState(false);
  const [clientePagaFrete, setClientePagaFrete] = React.useState(product?.clientePagaFrete ?? true);
  const [freteCobrado, setFreteCobrado] = React.useState(product?.freteCobrado ?? 0);
  const [custoFrete, setCustoFrete] = React.useState(product?.custoFrete ?? 0);

  const tagsAction = useAsyncAction(gerarPalavrasChave);

  React.useEffect(() => {
    if (product) {
      setSalePrice(product.price);
      setIsActive(product.status === "active");
      setIsDirty(false);
      setLinkCopied(false);
      setBrandedLinkCopied(false);
      setClientePagaFrete(product.clientePagaFrete ?? true);
      setFreteCobrado(product.freteCobrado ?? 0);
      setCustoFrete(product.custoFrete ?? 0);
      scrollRef.current?.scrollTo({ top: 0 });
      tagsAction.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset intencional só ao trocar de produto
  }, [product]);

  function handlePriceChange(value: number) {
    setSalePrice(value);
    setIsDirty(true);
  }

  function handleActiveChange(value: boolean) {
    setIsActive(value);
    setIsDirty(true);
  }

  function handleFreteChange(updates: { clientePagaFrete?: boolean; freteCobrado?: number; custoFrete?: number }) {
    if (updates.clientePagaFrete !== undefined) setClientePagaFrete(updates.clientePagaFrete);
    if (updates.freteCobrado !== undefined) setFreteCobrado(updates.freteCobrado);
    if (updates.custoFrete !== undefined) setCustoFrete(updates.custoFrete);
    setIsDirty(true);
  }

  async function handleSave() {
    if (!product) return;
    const ok = await onSave({
      status: isActive ? "active" : product.status === "out_of_stock" ? "out_of_stock" : "paused",
      price: salePrice,
      freteCobrado,
      custoFrete,
      clientePagaFrete,
    });
    if (ok !== false) setIsDirty(false);
  }

  async function handleGenerateTags() {
    if (!product || !onGenerateTags) return;
    const generated = await tagsAction.execute({
      name: product.name,
      description: product.description,
      category: product.category,
    });
    if (generated) await onGenerateTags(generated);
  }

  const [imageFailed, setImageFailed] = React.useState(false);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    setImageFailed(false);
  }, [product?.image]);

  if (!product) {
    return <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()} />;
  }

  const cost = product.cost ?? 0;
  const pricing = calcularPrecificacao({
    custo: cost,
    venda: salePrice,
    clientePagaFrete,
    freteCobrado,
    custoFrete,
  });
  const marginPct = Math.round(pricing.margem);
  const tone = STATUS_MARGEM_STYLE[pricing.status];
  const minPrice = Math.max(cost, 1);
  const maxPrice = Math.round(product.price * 1.6) || minPrice + 10;
  const checkoutLink = product.link ?? null;

  // O checkout com marca própria (`/checkout/[slug]`) usa o mesmo slug que
  // já vem no link da Kairóss — extraído do último segmento da URL, já que
  // `ProductRow` não expõe `kaiross.checkoutSlug` separadamente (ver
  // `map-product-row.ts`). Só existe quando o produto já tem link Kairóss.
  const checkoutSlug = checkoutLink ? checkoutLink.split("/").filter(Boolean).pop() : null;
  const brandedCheckoutLink = checkoutSlug && origin ? `${origin}/checkout/${checkoutSlug}` : null;

  // Palavras-chave já salvas no produto têm prioridade sobre o resultado
  // recém-gerado nesta sessão (que já foi persistido por onGenerateTags,
  // então na próxima renderização `product.tags` já reflete o novo valor).
  const savedTags = product.tags ?? [];
  const hasTags = savedTags.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        onOpenAutoFocus={(event) => event.preventDefault()}
        style={isMobile ? { height: "92svh", maxHeight: "92svh" } : undefined}
        className={cn("flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg", isMobile && "rounded-t-3xl border-t")}
      >
        {isMobile && (
          <div className="flex shrink-0 justify-center pt-2.5 pb-1">
            <div className="h-1 w-9 rounded-full bg-muted-foreground/25" />
          </div>
        )}

        <SheetHeader className="shrink-0 gap-0.5 pb-3">
          <SheetTitle className="line-clamp-2 leading-snug">{product.name}</SheetTitle>
          <SheetDescription>
            {product.sku ? `SKU ${product.sku} · ` : ""}
            {product.category}
          </SheetDescription>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        >
          {/* Imagem grande — mesma linguagem visual do sheet de afiliação */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-muted">
            {product.image && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem remota do catálogo
              <img
                src={product.image}
                alt={product.name}
                className="h-full w-full object-contain"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground/50">
                <ImageOff className="size-8" strokeWidth={1.5} />
                {imageFailed && <p className="text-[11px]">Não foi possível carregar a imagem</p>}
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
            {product.category && (
              <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.04em] text-white backdrop-blur-sm">
                {product.category}
              </span>
            )}
            {product.source === "kaiross" && (
              <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                <Sparkles className="size-3" strokeWidth={2} />
                Kairóss
              </span>
            )}
          </div>

          {/* Produto ativo */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">Produto ativo</p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Visível para venda no WhatsApp AI e CRM
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={handleActiveChange} />
          </div>

          {/* Preço, custo, margem — bloco único com hierarquia clara */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Preço de venda</p>
                <p className="font-mono text-lg font-semibold tabular-nums">{currency(salePrice)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-muted-foreground">Custo</p>
                <p className="font-mono text-lg font-semibold tabular-nums">{currency(cost)}</p>
              </div>
            </div>

            {cost > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t pt-3.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Ajustar preço de venda</Label>
                  <span className="font-mono text-sm font-semibold tabular-nums">{currency(salePrice)}</span>
                </div>
                <Slider
                  value={[salePrice]}
                  min={minPrice}
                  max={maxPrice}
                  step={0.5}
                  onValueChange={([value]) => handlePriceChange(value)}
                />
                <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                  <span>{currency(pricing.precoMin)} · lucro mín. 10%</span>
                  <span>{currency(maxPrice)}</span>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3.5">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Margem estimada</p>
                <p className="font-mono text-base font-semibold tabular-nums">{currency(pricing.lucro)} · {marginPct}%</p>
              </div>
              <Badge variant="outline" className={cn("shrink-0 font-semibold shadow-sm border-transparent", tone.bg, tone.text)}>
                {tone.label}
              </Badge>
            </div>
          </div>

          {/* Frete — quem assume o custo, réplica do fluxo real da Kairóss */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-[13px] font-semibold">Frete</p>
            <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
              Quem assume o custo do envio para o cliente? Afeta a margem mínima recomendada.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleFreteChange({ clientePagaFrete: true })}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  clientePagaFrete ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <p className="text-[12.5px] font-medium">Cliente paga o frete</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Calculado no checkout. Você não tem custo de envio.
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleFreteChange({ clientePagaFrete: false })}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  !clientePagaFrete ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <p className="text-[12.5px] font-medium">Frete por sua conta</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Você assume o custo. Pode aumentar conversão, mas reduz margem.
                </p>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">Frete cobrado do cliente</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={freteCobrado || ""}
                  onChange={(event) => handleFreteChange({ freteCobrado: Number(event.target.value) || 0 })}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">Seu custo real de envio</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={custoFrete || ""}
                  onChange={(event) => handleFreteChange({ custoFrete: Number(event.target.value) || 0 })}
                  placeholder="R$ 0,00"
                />
              </div>
            </div>
          </div>

          {/* Decomposição do preço — mesma fórmula validada em produção do
              cálculo de precificação Kairóss (imposto 10%, taxa 8,49% + R$2,50) */}
          {cost > 0 && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <p className="mb-3 text-[13px] font-semibold">Decomposição do preço</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Preço de venda</span>
                  <span className="tabular-nums">{currency(salePrice)}</span>
                </div>
                {clientePagaFrete && freteCobrado > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">+ Frete (cliente paga)</span>
                    <span className="tabular-nums">{currency(freteCobrado)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-medium">
                  <span>= Total da venda</span>
                  <span className="tabular-nums">{currency(pricing.totalVenda)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>− Custo do produto</span>
                  <span className="tabular-nums">−{currency(cost)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>− Imposto (10%)</span>
                  <span className="tabular-nums">−{currency(pricing.totalVenda * 0.1)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>− Taxa Kairóss (8,49% + R$2,50)</span>
                  <span className="tabular-nums">
                    −{currency(pricing.totalVenda * 0.0849 + 2.5)}
                  </span>
                </div>
                {custoFrete > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>− Seu custo de frete</span>
                    <span className="tabular-nums">−{currency(custoFrete)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                  <span>Sua margem líquida</span>
                  <span className={cn("tabular-nums", pricing.lucro >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {currency(pricing.lucro)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Estoque, vendas */}
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
                product.stock === 0
                  ? "border-transparent bg-red-600 text-white"
                  : "border-border text-muted-foreground",
              )}
            >
              <Package className="size-3" strokeWidth={2} />
              {product.stock} un em estoque
            </span>
            {typeof product.salesCount === "number" && (
              <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
                {product.salesCount} vendas
              </span>
            )}
          </div>

          {/* Link de checkout, quando existir */}
          {checkoutLink && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Link de checkout (Kairóss)</Label>
              <div className="flex items-center gap-2 rounded-lg border bg-background p-2.5">
                <p className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{checkoutLink}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(checkoutLink);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 1800);
                  }}
                  aria-label="Copiar link de checkout"
                  className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10.5px] transition-colors hover:border-primary hover:text-primary"
                >
                  {linkCopied ? (
                    <>
                      <Check className="size-3" strokeWidth={2.5} /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" strokeWidth={2} /> Copiar
                    </>
                  )}
                </button>
                <a
                  href={checkoutLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir link de checkout"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="size-3.5" strokeWidth={2} />
                </a>
              </div>
            </div>
          )}

          {/* Checkout com marca própria (/checkout/[slug]) — mesmo produto e
              pagamento, mas com a identidade visual do AdKairos em vez do
              domínio pay.kaiross.com.br. Só aparece quando já dá para
              derivar o slug do link Kairóss existente. */}
          {brandedCheckoutLink && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Link de checkout (sua marca)</Label>
                <Badge variant="secondary" className="text-[9.5px]">
                  Novo
                </Badge>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                <p className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{brandedCheckoutLink}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(brandedCheckoutLink);
                    setBrandedLinkCopied(true);
                    setTimeout(() => setBrandedLinkCopied(false), 1800);
                  }}
                  aria-label="Copiar link de checkout com marca própria"
                  className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10.5px] transition-colors hover:border-primary hover:text-primary"
                >
                  {brandedLinkCopied ? (
                    <>
                      <Check className="size-3" strokeWidth={2.5} /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" strokeWidth={2} /> Copiar
                    </>
                  )}
                </button>
                <a
                  href={brandedCheckoutLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir link de checkout com marca própria"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="size-3.5" strokeWidth={2} />
                </a>
              </div>
              <p className="text-[10.5px] leading-snug text-muted-foreground">
                Mesmo produto e pagamento, com a identidade visual da sua loja em vez do domínio da Kairóss.
              </p>
            </div>
          )}

          {/* Descrição */}
          {product.description && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Descrição</Label>
              <p className="text-[13px] leading-5 text-muted-foreground">{product.description}</p>
            </div>
          )}

          {/* IA para este produto */}
          <div className="rounded-2xl border">
            <div className="flex items-center gap-2 px-4 py-3.5">
              <Sparkles className="size-3.5 text-primary" strokeWidth={2} />
              <p className="text-[13px] font-semibold">IA para este produto</p>
            </div>
            <div className="flex flex-col gap-2.5 border-t px-4 pt-3.5 pb-4">
              {/* Palavras-chave: se já tiver salvo, mostra as tags e some o
                  botão de gerar — só resta um jeito discreto de regerar. Se
                  não tiver, mostra só o botão (gerar já salva). */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Tag className="size-3.5 text-muted-foreground" strokeWidth={2} />
                  <p className="text-[12.5px] font-medium">Palavras-chave para o bot</p>
                </div>

                {hasTags ? (
                  <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {savedTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[11px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateTags}
                      disabled={tagsAction.isLoading}
                      className="w-fit text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline disabled:opacity-60"
                    >
                      {tagsAction.isLoading ? "Gerando..." : "Gerar novamente"}
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateTags}
                    disabled={tagsAction.isLoading}
                    className="w-fit"
                  >
                    <Sparkles data-icon="inline-start" className="size-3.5" strokeWidth={2} />
                    {tagsAction.isLoading ? "Gerando..." : "Gerar com IA"}
                  </Button>
                )}

                {tagsAction.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{tagsAction.error}</AlertDescription>
                  </Alert>
                )}
              </div>

              <ComingSoonAiAction
                icon={FileQuestion}
                label="Gerar FAQ"
                hint="Perguntas frequentes automáticas para o bot responder"
              />
              <ComingSoonAiAction
                icon={Clapperboard}
                label="Roteiro para Google Flow"
                hint="Pronto para colar em labs.google/flow"
              />
            </div>
          </div>
        </div>

        <SheetFooter className="shrink-0 flex-row gap-2 border-t bg-popover">
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
      </SheetContent>
    </Sheet>
  );
}

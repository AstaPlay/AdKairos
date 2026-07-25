"use client";

import * as React from "react";

import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImageOff,
  Sparkles,
  TrendingUp,
  Truck,
  Wand2,
  X as XIcon,
} from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useIsMobile } from "@/hooks/use-mobile";
import { calcularPrecificacao, formatarMoeda, STATUS_MARGEM_STYLE } from "@/lib/kaiross-pricing";
import { cn } from "@/lib/utils";

import type { KairoossCatalogProduct } from "./catalog-product-card";

export interface AfiliarResult {
  productId: string;
  sellerProductId: string | null;
  checkoutSlug: string | null;
  link: string | null;
  warning: string | null;
}

interface SugestaoPrecoData {
  origem: "formula" | "formula_com_pesquisa";
  precoSugeridoIA: number;
  precoMinimo: number;
  precoRecomendado: number;
  justificativa: string;
  referenciasMercado: string[];
}

class AfiliarError extends Error {
  code?: string;
  existingProductId?: string;
  constructor(info: { code?: string; message: string; existingProductId?: string }) {
    super(info.message);
    this.code = info.code;
    this.existingProductId = info.existingProductId;
  }
}

async function afiliarProduto(payload: {
  kairoossProductId: string;
  name: string;
  description?: string;
  category?: string;
  images?: string[];
  sku?: string;
  brand?: string;
  precoVenda: number;
  vendedorAssumeFrete: boolean;
  tags?: string[];
  stock?: number;
  custoOrigem?: number;
}): Promise<AfiliarResult> {
  const response = await fetch("/api/integrations/kaiross/afiliar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!json.success) {
    throw new AfiliarError({
      code: json.error?.code,
      message: json.error?.message ?? "Não foi possível salvar o produto.",
      existingProductId: json.error?.existingProductId,
    });
  }
  return json.data as AfiliarResult;
}

async function gerarPalavrasChave(context: { name: string; description?: string; category?: string }): Promise<string[]> {
  const response = await fetch("/api/ai/produtos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "gerarKeywords", context }),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível gerar palavras-chave.");
  return json.data as string[];
}

async function sugerirPreco(payload: {
  nome: string;
  categoria?: string;
  precoSugerido: number;
  custoFrete?: number;
  clientePagaFrete?: boolean;
}): Promise<SugestaoPrecoData> {
  const response = await fetch("/api/ai/kaiross-sugestao-preco", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível sugerir um preço agora.");
  return json.data as SugestaoPrecoData;
}

interface AfiliarState {
  isLoading: boolean;
  data: AfiliarResult | null;
  error: string | null;
  /** Preenchido só quando o erro é "produto já afiliado" — permite oferecer ação (ver produto) em vez de só texto vermelho. */
  alreadyAffiliatedProductId: string | null;
}

const INITIAL_AFILIAR_STATE: AfiliarState = {
  isLoading: false,
  data: null,
  error: null,
  alreadyAffiliatedProductId: null,
};

export function CatalogAffiliateSheet({
  product,
  onClose,
  onSaved,
  onViewExisting,
}: {
  product: KairoossCatalogProduct | null;
  onClose: () => void;
  onSaved: (result: AfiliarResult) => void;
  onViewExisting?: (localProductId: string) => void;
}) {
  const isOpen = product !== null;
  const isMobile = useIsMobile();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const [activeImage, setActiveImage] = React.useState(0);
  const [precoVenda, setPrecoVenda] = React.useState(0);
  const [vendedorAssumeFrete, setVendedorAssumeFrete] = React.useState(false);
  const [custoFrete, setCustoFrete] = React.useState(0);
  const [tags, setTags] = React.useState<string[]>([]);
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [afiliarState, setAfiliarState] = React.useState<AfiliarState>(INITIAL_AFILIAR_STATE);

  const keywordsAction = useAsyncAction(gerarPalavrasChave);
  const sugestaoAction = useAsyncAction(sugerirPreco);

  // Reseta todo o estado local sempre que um novo produto é aberto no sheet.
  React.useEffect(() => {
    if (!product) return;
    setActiveImage(0);
    scrollRef.current?.scrollTo({ top: 0 });
    setPrecoVenda(Math.max(product.price * 1.4, product.price + 10));
    setVendedorAssumeFrete(false);
    setCustoFrete(0);
    setTags([]);
    setLinkCopied(false);
    setAfiliarState(INITIAL_AFILIAR_STATE);
  }, [product]);

  const calculo = React.useMemo(() => {
    if (!product) return null;
    return calcularPrecificacao({
      custo: product.price,
      venda: precoVenda,
      clientePagaFrete: !vendedorAssumeFrete,
      freteCobrado: 0,
      custoFrete,
    });
  }, [product, precoVenda, vendedorAssumeFrete, custoFrete]);

  async function handleGerarPalavrasChave() {
    if (!product) return;
    const result = await keywordsAction.execute({
      name: product.name,
      description: product.description,
      category: product.category,
    });
    if (result) setTags(result);
  }

  async function handleSugerirPreco() {
    if (!product) return;
    const result = await sugestaoAction.execute({
      nome: product.name,
      categoria: product.category,
      precoSugerido: product.price,
      custoFrete,
      clientePagaFrete: !vendedorAssumeFrete,
    });
    if (result) setPrecoVenda(result.precoSugeridoIA);
  }

  async function handleConfirmar() {
    if (!product || afiliarState.isLoading) return;
    setAfiliarState({ isLoading: true, data: null, error: null, alreadyAffiliatedProductId: null });
    try {
      const result = await afiliarProduto({
        kairoossProductId: product.kairoossProductId,
        name: product.name,
        description: product.description,
        category: product.category,
        images: product.images,
        sku: product.sku,
        brand: product.brand,
        precoVenda,
        vendedorAssumeFrete,
        tags,
        stock: product.stock,
        custoOrigem: product.price,
      });
      setAfiliarState({ isLoading: false, data: result, error: null, alreadyAffiliatedProductId: null });
    } catch (error) {
      const isAlreadyAffiliated = error instanceof AfiliarError && error.code === "already_affiliated";
      setAfiliarState({
        isLoading: false,
        data: null,
        error: error instanceof Error ? error.message : "Não foi possível salvar o produto.",
        alreadyAffiliatedProductId: isAlreadyAffiliated
          ? ((error as AfiliarError).existingProductId ?? null)
          : null,
      });
    }
    // Não fecha o sheet aqui — o resultado (link/warning) fica visível e o
    // usuário fecha explicitamente clicando em "Concluir".
  }

  function handleConcluir() {
    if (afiliarState.data) onSaved(afiliarState.data);
  }

  if (!product || !calculo) {
    return <Sheet open={isOpen} onOpenChange={(next) => !next && onClose()} />;
  }

  const statusStyle = STATUS_MARGEM_STYLE[calculo.status];
  const sliderMin = Math.max(product.price, calculo.precoMin * 0.9);
  const sliderMax = Math.max(calculo.precoRec * 2.2, precoVenda * 1.4, product.price * 3);
  const coverImage = product.images[activeImage] ?? product.images[0];

  return (
    <Sheet open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          isMobile && "h-[92vh] rounded-t-3xl border-t",
        )}
      >
        {isMobile && (
          <div className="flex shrink-0 justify-center pt-2.5 pb-1">
            <div className="h-1 w-9 rounded-full bg-muted-foreground/25" />
          </div>
        )}

        <SheetHeader className="shrink-0 gap-0.5 pb-3">
          <SheetTitle className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" strokeWidth={2} />
            Precificar produto
          </SheetTitle>
          <SheetDescription>{product.category || "Kairóss"}</SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-2">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-muted">
              {coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagem remota do catálogo Kairóss
                <img src={coverImage} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <ImageOff className="size-8" strokeWidth={1.5} />
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
              {product.category && (
                <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.04em] text-white backdrop-blur-sm">
                  {product.category}
                </span>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {product.images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={cn(
                      "h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition-all duration-200",
                      index === activeImage ? "border-primary shadow-sm" : "border-transparent opacity-60 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura remota */}
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg leading-snug font-bold tracking-tight">{product.name}</h3>
            {product.description && (
              <p className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{product.description}</p>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">Preço de referência da Kairóss</p>
                <p className="font-mono text-sm font-semibold">R$ {formatarMoeda(product.price)}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleSugerirPreco} disabled={sugestaoAction.isLoading}>
                <Wand2 data-icon="inline-start" className="size-3.5" strokeWidth={2} />
                {sugestaoAction.isLoading ? "Calculando..." : "IA sugere o preço"}
              </Button>
            </div>

            {sugestaoAction.data && (
              <div className="animate-in fade-in mt-3 rounded-lg border border-primary/20 bg-primary/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-primary">
                  <TrendingUp className="size-3.5" strokeWidth={2} />
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em]">
                    {sugestaoAction.data.origem === "formula_com_pesquisa" ? "Pesquisa de mercado" : "Sugestão por fórmula"}
                  </p>
                </div>
                <p className="mt-1 text-[12.5px] leading-5">{sugestaoAction.data.justificativa}</p>
                {sugestaoAction.data.referenciasMercado.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {sugestaoAction.data.referenciasMercado.map((ref) => (
                      <li key={ref} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {ref}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {sugestaoAction.error && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{sugestaoAction.error}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Seu preço de venda</p>
                <p className="text-2xl font-extrabold tracking-tight">R$ {formatarMoeda(precoVenda)}</p>
              </div>
              <div className={cn("rounded-lg border px-2.5 py-1 text-right", statusStyle.bg, statusStyle.border)}>
                <p className={cn("font-mono text-[10px] font-bold uppercase tracking-[0.05em]", statusStyle.text)}>
                  {statusStyle.label}
                </p>
                <p className={cn("font-mono text-[11px] font-semibold tabular-nums", statusStyle.text)}>
                  margem {calculo.margem.toFixed(0)}%
                </p>
              </div>
            </div>

            <Slider
              className="mt-3"
              value={[precoVenda]}
              min={sliderMin}
              max={sliderMax}
              step={0.5}
              onValueChange={([value]) => setPrecoVenda(value)}
            />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground/70">
              <span>mín. R$ {formatarMoeda(calculo.precoMin)}</span>
              <span>recomendado R$ {formatarMoeda(calculo.precoRec)}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 font-mono text-[11px] tabular-nums">
              <div>
                <p className="text-muted-foreground">Lucro líquido</p>
                <p className={cn("font-semibold", statusStyle.text)}>R$ {formatarMoeda(calculo.lucro)}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Total cobrado</p>
                <p className="font-semibold">R$ {formatarMoeda(calculo.totalVenda)}</p>
              </div>
            </div>
          </div>

          <Accordion type="multiple" defaultValue={["frete"]} className="rounded-2xl border px-4">
            <AccordionItem value="frete">
              <AccordionTrigger className="py-3.5 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Truck className="size-3.5 text-muted-foreground" strokeWidth={2} />
                  <div className="text-left">
                    <p className="text-[13px] font-semibold">Frete</p>
                    <p className="text-[11px] font-normal text-muted-foreground">
                      {vendedorAssumeFrete ? "Você assume o custo" : "Cliente paga no checkout"}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2 pb-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVendedorAssumeFrete(false)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left text-[12px] transition-all duration-200",
                      !vendedorAssumeFrete ? "border-primary bg-primary/[0.08]" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <p className="font-semibold text-foreground">Cliente paga</p>
                    <p className="mt-0.5 text-[10.5px] opacity-80">Calculado no checkout</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendedorAssumeFrete(true)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left text-[12px] transition-all duration-200",
                      vendedorAssumeFrete ? "border-primary bg-primary/[0.08]" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <p className="font-semibold text-foreground">Você assume</p>
                    <p className="mt-0.5 text-[10.5px] opacity-80">+conversão, -margem</p>
                  </button>
                </div>
                {vendedorAssumeFrete && (
                  <label className="animate-in fade-in mt-1 flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-muted-foreground">Custo estimado do frete</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={custoFrete || ""}
                      onChange={(event) => setCustoFrete(Number(event.target.value) || 0)}
                      placeholder="0,00"
                      className="w-24 rounded-md border bg-background px-2 py-1 text-right font-mono focus:border-primary focus:outline-none"
                    />
                  </label>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="keywords">
              <AccordionTrigger className="py-3.5 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-muted-foreground" strokeWidth={2} />
                  <div className="text-left">
                    <p className="text-[13px] font-semibold">Palavras-chave para o bot</p>
                    <p className="text-[11px] font-normal text-muted-foreground">
                      {tags.length > 0 ? `${tags.length} palavra${tags.length > 1 ? "s" : ""} definida${tags.length > 1 ? "s" : ""}` : "Ajuda o bot de WhatsApp a reconhecer o produto"}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2 pb-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGerarPalavrasChave}
                  disabled={keywordsAction.isLoading}
                  className="w-fit"
                >
                  <Sparkles data-icon="inline-start" className="size-3.5" strokeWidth={2} />
                  {keywordsAction.isLoading ? "Gerando..." : "Gerar com IA"}
                </Button>
                {tags.length > 0 && (
                  <div className="animate-in fade-in flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1 pr-1.5 text-[10.5px]">
                        {tag}
                        <button
                          type="button"
                          onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                          aria-label={`Remover ${tag}`}
                          className="text-muted-foreground/70 transition-colors hover:text-destructive"
                        >
                          <XIcon className="size-2.5" strokeWidth={2.5} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {keywordsAction.error && (
                  <Alert variant="destructive" className="mt-1">
                    <AlertDescription>{keywordsAction.error}</AlertDescription>
                  </Alert>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {afiliarState.error && !afiliarState.alreadyAffiliatedProductId && (
            <Alert variant="destructive">
              <AlertDescription>{afiliarState.error}</AlertDescription>
            </Alert>
          )}

          {afiliarState.alreadyAffiliatedProductId && (
            <div className="animate-in fade-in flex flex-col gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={2} />
                <p className="text-[13px] font-semibold">Este produto já está no seu catálogo</p>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Não é possível afiliar o mesmo produto duas vezes. Abra a ficha já salva para editar preço, estoque ou
                qualquer outro dado.
              </p>
            </div>
          )}

          {afiliarState.data && (
            <div className="animate-in fade-in flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={2} />
                <p className="text-[13px] font-semibold">Produto salvo e ativo na sua vitrine</p>
              </div>

              {afiliarState.data.warning && (
                <Alert variant="destructive">
                  <AlertDescription>{afiliarState.data.warning}</AlertDescription>
                </Alert>
              )}

              {afiliarState.data.link && (
                <div className="flex items-center gap-2 rounded-lg border bg-background p-2.5">
                  <p className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{afiliarState.data.link}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(afiliarState.data!.link!);
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
                    href={afiliarState.data.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir link de checkout"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ExternalLink className="size-3.5" strokeWidth={2} />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="shrink-0 gap-3 border-t bg-popover">
          {!afiliarState.data && !afiliarState.alreadyAffiliatedProductId && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10.5px] text-muted-foreground">Preço de venda</p>
                <p className="font-mono text-base font-bold tabular-nums">R$ {formatarMoeda(precoVenda)}</p>
              </div>
              <div className={cn("rounded-lg border px-2.5 py-1 text-right", statusStyle.bg, statusStyle.border)}>
                <p className={cn("font-mono text-[10px] font-bold uppercase tracking-[0.05em]", statusStyle.text)}>
                  {statusStyle.label}
                </p>
                <p className={cn("font-mono text-[11px] font-semibold tabular-nums", statusStyle.text)}>
                  margem {calculo.margem.toFixed(0)}%
                </p>
              </div>
            </div>
          )}

          {afiliarState.alreadyAffiliatedProductId ? (
            <div className="flex gap-2.5">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Fechar
              </Button>
              <Button type="button" onClick={() => onViewExisting?.(afiliarState.alreadyAffiliatedProductId!)} className="flex-[2]">
                Ver produto salvo
              </Button>
            </div>
          ) : afiliarState.data ? (
            <Button type="button" onClick={handleConcluir}>
              Concluir
            </Button>
          ) : (
            <div className="flex gap-2.5">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="button" onClick={handleConfirmar} disabled={afiliarState.isLoading} className="flex-[2]">
                {afiliarState.isLoading ? "Salvando..." : "Salvar e ativar venda"}
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

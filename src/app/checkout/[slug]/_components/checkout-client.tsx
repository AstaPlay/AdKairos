"use client";

import * as React from "react";

import {
  AlertTriangle,
  Check,
  CreditCard,
  Lock,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import type { CheckoutProductPublic } from "@/lib/checkout-product-index.server";

// ---------------------------------------------------------------------------
// Config / dados estáticos de vitrine (não fazem parte do fluxo de pagamento)
// ---------------------------------------------------------------------------
const SHIPPING_OPTIONS = [
  { id: "standard", label: "Envio padrão", days: "5 a 9 dias úteis", price: 19.9 },
  { id: "express", label: "Envio expresso", days: "2 a 4 dias úteis", price: 34.9 },
] as const;

const REVIEWS = [
  { name: "Marina C.", stars: 5, text: "Chegou rápido e a qualidade surpreendeu. Uso todo dia." },
  { name: "Eduardo R.", stars: 5, text: "Comprei com receio pelo preço, mas o suporte é excelente." },
  { name: "Patrícia A.", stars: 4, text: "Muito bom, só achei o tamanho um pouco justo." },
] as const;

const PAGARME_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAGARME_PK ?? "";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Máscaras
// ---------------------------------------------------------------------------
function maskCPF(value: string): string {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskCEP(value: string): string {
  return value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
}
function maskCardNumber(value: string): string {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
}
function maskExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
function maskCVV(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}
function luhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
function detectBrand(num: string): string | null {
  const digits = num.replace(/\D/g, "");
  if (/^4/.test(digits)) return "Visa";
  if (/^5[1-5]/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  return null;
}

// ---------------------------------------------------------------------------
// Chamadas de API (server routes próprias — nunca falam direto com a
// Kairóss a partir do client, exceto a tokenização de cartão)
// ---------------------------------------------------------------------------
interface FormState {
  email: string;
  confirmEmail: string;
  nome: string;
  cpf: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;
  metodo: "credito" | "pix";
  cartaoNumero: string;
  cartaoValidade: string;
  cartaoCvv: string;
  cartaoNome: string;
  parcelas: number;
  envio: string | null;
}

const INITIAL_FORM: FormState = {
  email: "",
  confirmEmail: "",
  nome: "",
  cpf: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  telefone: "",
  metodo: "credito",
  cartaoNumero: "",
  cartaoValidade: "",
  cartaoCvv: "",
  cartaoNome: "",
  parcelas: 1,
  envio: null,
};

type Stage = "idle" | "carrinho" | "tokenizando" | "processando" | "aprovado" | "recusado";

async function criarCarrinho(
  slug: string,
  input: {
    quantidade: number;
    nome: string;
    email: string;
    documento: string;
    telefone: string;
  },
) {
  const response = await fetch(`/api/checkout/${slug}/carrinho`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível reservar seu pedido.");
  return json.data as { sessionToken: string };
}

/**
 * Tokeniza o cartão DIRETO no navegador do comprador, contra a API pública
 * do Pagar.me — nunca passa pelo nosso backend. Replica o passo 2 do fluxo
 * real observado no checkout da Kairóss.
 */
async function tokenizarCartao(input: {
  numero: string;
  nome: string;
  mes: string;
  ano: string;
  cvv: string;
  billing: { linha1: string; cep: string; cidade: string; uf: string };
}): Promise<string> {
  if (!PAGARME_PUBLIC_KEY) {
    throw new Error("Chave pública de pagamento não configurada (NEXT_PUBLIC_PAGARME_PK).");
  }
  const response = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${PAGARME_PUBLIC_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "card",
      card: {
        number: input.numero.replace(/\D/g, ""),
        holder_name: input.nome,
        exp_month: Number(input.mes),
        exp_year: Number(input.ano),
        cvv: input.cvv,
        billing_address: {
          line_1: input.billing.linha1,
          zip_code: input.billing.cep,
          city: input.billing.cidade,
          state: input.billing.uf,
          country: "BR",
        },
      },
    }),
  });
  if (!response.ok) throw new Error("Não foi possível validar os dados do cartão.");
  const json = await response.json();
  const token = json?.id as string | undefined;
  if (!token) throw new Error("Não foi possível validar os dados do cartão.");
  return token;
}

async function processarPedido(slug: string, input: Record<string, unknown>) {
  const response = await fetch(`/api/checkout/${slug}/pedido`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!json.success) {
    const error = new Error(json.error?.message ?? "Pagamento não aprovado.");
    throw error;
  }
  return json.data as { status: string; numeroPedido: string | null };
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

function ReservationBanner() {
  const [secondsLeft, setSecondsLeft] = React.useState(14 * 60 + 55);
  React.useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  return (
    <Alert className="border-emerald-600/25 bg-emerald-600/10 [&>svg]:text-emerald-600">
      <Check />
      <AlertDescription className="text-foreground">
        Seu pedido está reservado pelos próximos{" "}
        <span className="font-mono font-semibold tabular-nums">
          {mm}:{ss}
        </span>
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function CheckoutClient({ produto, slug }: { produto: CheckoutProductPublic; slug: string }) {
  const [qty, setQty] = React.useState(1);
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [stage, setStage] = React.useState<Stage>("idle");
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [addressReady, setAddressReady] = React.useState(false);
  const errorRef = React.useRef<HTMLDivElement>(null);

  const submitting = stage === "carrinho" || stage === "tokenizando" || stage === "processando";

  const subtotal = produto.price * qty;
  const freight = form.envio ? (SHIPPING_OPTIONS.find((o) => o.id === form.envio)?.price ?? 0) : 0;
  const total = subtotal + freight;
  const savings = produto.compareAtPrice ? (produto.compareAtPrice - produto.price) * qty : 0;

  // Preenchimento de endereço a partir do CEP via ViaCEP (o mesmo serviço
  // público usado no checkout real observado da Kairóss).
  React.useEffect(() => {
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setAddressReady(false);
      return;
    }
    let cancelled = false;
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data.erro) return;
        setForm((f) => ({
          ...f,
          endereco: data.logradouro || f.endereco,
          bairro: data.bairro || f.bairro,
          cidade: data.localidade || f.cidade,
          uf: data.uf || f.uf,
        }));
        setAddressReady(true);
      })
      .catch(() => {
        // ViaCEP fora do ar não deve travar o checkout — o comprador
        // ainda pode preencher o endereço manualmente.
        setAddressReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [form.cep]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function markTouched(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  const step = React.useMemo(() => {
    if (!form.email || !form.confirmEmail || form.email !== form.confirmEmail) return 1;
    if (!form.nome || !form.cpf || !form.cep || !form.telefone || !form.envio) return 2;
    return 3;
  }, [form]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.email) e.email = "Informe seu e-mail.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = "E-mail inválido.";
    if (form.confirmEmail !== form.email) e.confirmEmail = "Os e-mails não coincidem.";
    if (!form.nome || form.nome.trim().split(" ").length < 2) e.nome = "Informe nome e sobrenome.";
    if (form.cpf.replace(/\D/g, "").length !== 11) e.cpf = "CPF inválido.";
    if (form.cep.replace(/\D/g, "").length !== 8) e.cep = "CEP inválido.";
    if (!form.numero) e.numero = "Informe o número.";
    if (form.telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido.";
    if (!form.envio) e.envio = "Escolha uma forma de envio.";
    if (form.metodo === "credito") {
      if (!luhnValid(form.cartaoNumero)) e.cartaoNumero = "Número de cartão inválido.";
      if (!/^\d{2}\/\d{2}$/.test(form.cartaoValidade)) e.cartaoValidade = "Use o formato MM/AA.";
      if (form.cartaoCvv.length < 3) e.cartaoCvv = "CVV inválido.";
      if (!form.cartaoNome) e.cartaoNome = "Informe o nome impresso no cartão.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({
      email: true,
      confirmEmail: true,
      nome: true,
      cpf: true,
      cep: true,
      numero: true,
      telefone: true,
      envio: true,
      cartaoNumero: true,
      cartaoValidade: true,
      cartaoCvv: true,
      cartaoNome: true,
    });
    if (!validate()) {
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }

    try {
      setStage("carrinho");
      const { sessionToken } = await criarCarrinho(slug, {
        quantidade: qty,
        nome: form.nome,
        email: form.email,
        documento: form.cpf.replace(/\D/g, ""),
        telefone: form.telefone.replace(/\D/g, ""),
      });

      let cartaoToken: string | null = null;
      if (form.metodo === "credito") {
        setStage("tokenizando");
        const [mm, yy] = form.cartaoValidade.split("/");
        cartaoToken = await tokenizarCartao({
          numero: form.cartaoNumero,
          nome: form.cartaoNome,
          mes: mm!,
          ano: `20${yy}`,
          cvv: form.cartaoCvv,
          billing: {
            linha1: `${form.endereco}, ${form.numero}`,
            cep: form.cep.replace(/\D/g, ""),
            cidade: form.cidade,
            uf: form.uf,
          },
        });
      }

      setStage("processando");
      const resultado = await processarPedido(slug, {
        sessionToken,
        quantidade: qty,
        cliente: {
          nome: form.nome,
          email: form.email,
          documento: form.cpf.replace(/\D/g, ""),
          telefone: form.telefone.replace(/\D/g, ""),
          cep: form.cep.replace(/\D/g, ""),
          endereco: form.endereco,
          numero: form.numero,
          bairro: form.bairro,
          complemento: form.complemento || null,
          cidade: form.cidade,
          uf: form.uf,
        },
        formaPagamento: form.metodo === "credito" ? "CREDITO" : "PIX",
        parcelas: form.parcelas,
        cartaoToken,
      });

      setOrderId(resultado.numeroPedido);
      setStage("aprovado");
    } catch (error) {
      setStage("recusado");
      setErrors((e) => ({
        ...e,
        geral: error instanceof Error ? error.message : "Não foi possível processar o pagamento.",
      }));
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }

  if (stage === "aprovado") {
    return <SuccessScreen orderId={orderId} total={total} email={form.email} />;
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            <span className="font-bold text-xs tracking-wide">CHECKOUT SEGURO</span>
          </div>
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck data-icon="inline-start" className="size-3" />
            Ambiente protegido por SSL
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {["Contato", "Entrega", "Pagamento"].map((label, i) => {
            const idx = i + 1;
            const done = idx < step;
            const active = idx === step;
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={
                    done
                      ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs"
                      : active
                        ? "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-primary font-semibold text-primary text-xs"
                        : "flex size-6 shrink-0 items-center justify-center rounded-full border-2 font-semibold text-muted-foreground text-xs"
                  }
                >
                  {done ? <Check className="size-3.5" /> : idx}
                </span>
                <span
                  className={
                    done || active
                      ? "hidden font-medium text-sm sm:inline"
                      : "hidden text-muted-foreground text-sm sm:inline"
                  }
                >
                  {label}
                </span>
                {idx < 3 && <Separator className={done ? "flex-1 bg-primary" : "flex-1"} />}
              </div>
            );
          })}
        </div>

        <ReservationBanner />

        {stage === "recusado" && (
          <div ref={errorRef}>
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{errors.geral}</AlertDescription>
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          {/* Contato */}
          <section className="flex flex-col gap-4">
            <h2 className="font-semibold text-base">Contato</h2>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@email.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => markTouched("email")}
                  aria-invalid={Boolean(touched.email && errors.email)}
                />
                <FieldError message={touched.email ? errors.email : undefined} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmEmail">Confirme o e-mail</Label>
                <Input
                  id="confirmEmail"
                  type="email"
                  placeholder="voce@email.com"
                  value={form.confirmEmail}
                  onChange={(e) => set("confirmEmail", e.target.value)}
                  onBlur={() => markTouched("confirmEmail")}
                  aria-invalid={Boolean(touched.confirmEmail && errors.confirmEmail)}
                />
                <FieldError message={touched.confirmEmail ? errors.confirmEmail : undefined} />
              </div>
            </div>
          </section>

          {/* Entrega */}
          <section className="flex flex-col gap-4">
            <h2 className="font-semibold text-base">Entrega</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                placeholder="Como está no seu documento"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                onBlur={() => markTouched("nome")}
                aria-invalid={Boolean(touched.nome && errors.nome)}
              />
              <FieldError message={touched.nome ? errors.nome : undefined} />
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  inputMode="numeric"
                  className="font-mono"
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => set("cpf", maskCPF(e.target.value))}
                  onBlur={() => markTouched("cpf")}
                  aria-invalid={Boolean(touched.cpf && errors.cpf)}
                />
                <FieldError message={touched.cpf ? errors.cpf : undefined} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="telefone">Celular</Label>
                <Input
                  id="telefone"
                  inputMode="numeric"
                  className="font-mono"
                  placeholder="(00) 00000-0000"
                  value={form.telefone}
                  onChange={(e) => set("telefone", maskPhone(e.target.value))}
                  onBlur={() => markTouched("telefone")}
                  aria-invalid={Boolean(touched.telefone && errors.telefone)}
                />
                <FieldError message={touched.telefone ? errors.telefone : undefined} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input
                id="cep"
                inputMode="numeric"
                className="font-mono"
                placeholder="00000-000"
                value={form.cep}
                onChange={(e) => set("cep", maskCEP(e.target.value))}
                onBlur={() => markTouched("cep")}
                aria-invalid={Boolean(touched.cep && errors.cep)}
              />
              <FieldError message={touched.cep ? errors.cep : undefined} />
            </div>

            {addressReady && (
              <div className="grid grid-cols-1 gap-3.5 rounded-lg border bg-muted/40 p-3.5 sm:grid-cols-[1fr_120px]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="endereco">Endereço</Label>
                  <Input id="endereco" value={form.endereco} onChange={(e) => set("endereco", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    value={form.numero}
                    onChange={(e) => set("numero", e.target.value)}
                    onBlur={() => markTouched("numero")}
                    aria-invalid={Boolean(touched.numero && errors.numero)}
                  />
                  <FieldError message={touched.numero ? errors.numero : undefined} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input id="bairro" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cidadeUf">Cidade / UF</Label>
                  <Input id="cidadeUf" value={`${form.cidade} / ${form.uf}`} readOnly disabled />
                </div>
              </div>
            )}

            {form.cep.replace(/\D/g, "").length === 8 && (
              <div className="flex flex-col gap-2">
                <Label>Forma de envio</Label>
                <RadioGroup value={form.envio ?? undefined} onValueChange={(v) => set("envio", v)}>
                  {SHIPPING_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      htmlFor={`envio-${opt.id}`}
                      className={
                        form.envio === opt.id
                          ? "flex cursor-pointer items-center justify-between rounded-lg border border-primary bg-primary/5 px-4 py-3"
                          : "flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 hover:border-muted-foreground/30"
                      }
                    >
                      <span className="flex items-center gap-3">
                        <RadioGroupItem id={`envio-${opt.id}`} value={opt.id} />
                        <span>
                          <span className="block font-medium text-sm">{opt.label}</span>
                          <span className="block text-muted-foreground text-xs">{opt.days}</span>
                        </span>
                      </span>
                      <span className="font-semibold text-sm">{formatBRL(opt.price)}</span>
                    </label>
                  ))}
                </RadioGroup>
                <FieldError message={touched.envio ? errors.envio : undefined} />
              </div>
            )}
          </section>

          {/* Pagamento */}
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-base">Pagamento</h2>
              <p className="text-muted-foreground text-xs">Todas as transações são seguras e criptografadas.</p>
            </div>

            <RadioGroup
              value={form.metodo}
              onValueChange={(v) => set("metodo", v as FormState["metodo"])}
              className="gap-3"
            >
              <div className={form.metodo === "credito" ? "rounded-lg border border-primary" : "rounded-lg border"}>
                <label
                  htmlFor="metodo-credito"
                  className="flex cursor-pointer items-center justify-between px-4 py-3.5"
                >
                  <span className="flex items-center gap-3">
                    <RadioGroupItem id="metodo-credito" value="credito" />
                    <CreditCard className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Cartão de crédito</span>
                  </span>
                  <span className="font-bold text-[10px] text-muted-foreground">VISA MASTERCARD +2</span>
                </label>

                {form.metodo === "credito" && (
                  <div className="flex flex-col gap-3.5 border-t px-4 py-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="cartaoNumero">Número do cartão</Label>
                      <div className="relative">
                        <Input
                          id="cartaoNumero"
                          inputMode="numeric"
                          className="pr-16 font-mono tracking-wider"
                          placeholder="0000 0000 0000 0000"
                          value={form.cartaoNumero}
                          onChange={(e) => set("cartaoNumero", maskCardNumber(e.target.value))}
                          onBlur={() => markTouched("cartaoNumero")}
                          aria-invalid={Boolean(touched.cartaoNumero && errors.cartaoNumero)}
                        />
                        {detectBrand(form.cartaoNumero) && (
                          <span className="absolute top-1/2 right-3 -translate-y-1/2 font-bold text-[11px] text-muted-foreground">
                            {detectBrand(form.cartaoNumero)}
                          </span>
                        )}
                      </div>
                      <FieldError message={touched.cartaoNumero ? errors.cartaoNumero : undefined} />
                    </div>
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="cartaoValidade">Validade (MM/AA)</Label>
                        <Input
                          id="cartaoValidade"
                          inputMode="numeric"
                          className="font-mono"
                          placeholder="MM/AA"
                          value={form.cartaoValidade}
                          onChange={(e) => set("cartaoValidade", maskExpiry(e.target.value))}
                          onBlur={() => markTouched("cartaoValidade")}
                          aria-invalid={Boolean(touched.cartaoValidade && errors.cartaoValidade)}
                        />
                        <FieldError message={touched.cartaoValidade ? errors.cartaoValidade : undefined} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="cartaoCvv">CVV</Label>
                        <Input
                          id="cartaoCvv"
                          inputMode="numeric"
                          className="font-mono"
                          placeholder="123"
                          value={form.cartaoCvv}
                          onChange={(e) => set("cartaoCvv", maskCVV(e.target.value))}
                          onBlur={() => markTouched("cartaoCvv")}
                          aria-invalid={Boolean(touched.cartaoCvv && errors.cartaoCvv)}
                        />
                        <FieldError message={touched.cartaoCvv ? errors.cartaoCvv : undefined} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="cartaoNome">Nome impresso no cartão</Label>
                      <Input
                        id="cartaoNome"
                        placeholder="Como está no cartão"
                        value={form.cartaoNome}
                        onChange={(e) => set("cartaoNome", e.target.value.toUpperCase())}
                        onBlur={() => markTouched("cartaoNome")}
                        aria-invalid={Boolean(touched.cartaoNome && errors.cartaoNome)}
                      />
                      <FieldError message={touched.cartaoNome ? errors.cartaoNome : undefined} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="parcelas">Parcelamento</Label>
                      <NativeSelect
                        id="parcelas"
                        className="w-full"
                        value={form.parcelas}
                        onChange={(e) => set("parcelas", Number(e.target.value))}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x de {formatBRL(total / n)} {n === 1 ? "à vista" : "sem juros"}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                )}
              </div>

              <label
                htmlFor="metodo-pix"
                className={
                  form.metodo === "pix"
                    ? "flex cursor-pointer items-center justify-between rounded-lg border border-primary px-4 py-3.5"
                    : "flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3.5"
                }
              >
                <span className="flex items-center gap-3">
                  <RadioGroupItem id="metodo-pix" value="pix" />
                  <QrCode className="size-4 text-muted-foreground" />
                  <span className="font-medium text-sm">PIX</span>
                  <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
                    Aprovação imediata
                  </Badge>
                </span>
              </label>
            </RadioGroup>
          </section>

          <div className="flex flex-col gap-3">
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  {stage === "carrinho" && "Reservando seu pedido…"}
                  {stage === "tokenizando" && "Protegendo os dados do cartão…"}
                  {stage === "processando" && "Confirmando pagamento…"}
                </>
              ) : (
                <>Pagar {formatBRL(total)}</>
              )}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
              <Lock className="size-3.5" /> Ambiente protegido · Compra 100% segura
            </p>
          </div>

          <Separator />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground text-xs">
            {/* TODO: apontar para URLs reais quando as páginas existirem */}
            <button type="button" className="hover:text-foreground">
              Termos de serviço
            </button>
            <button type="button" className="hover:text-foreground">
              Política de privacidade
            </button>
            <button type="button" className="hover:text-foreground">
              Contato
            </button>
          </div>
        </form>
      </div>

      {/* Coluna do resumo */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-3.5">
              <div className="relative shrink-0">
                {produto.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={produto.images[0]} alt="" className="size-16 rounded-lg border object-cover" />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-lg border bg-muted" />
                )}
                <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground font-semibold text-[10.5px] text-background">
                  {qty}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">{produto.name}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {produto.compareAtPrice && (
                    <span className="text-muted-foreground text-xs line-through">
                      {formatBRL(produto.compareAtPrice)}
                    </span>
                  )}
                  <span className="font-semibold text-sm">{formatBRL(produto.price)}</span>
                </div>
                <div className="mt-2 flex w-fit items-center rounded-lg border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-6 text-center font-medium text-sm">{qty}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setQty((q) => Math.min(9, q + 1))}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="text-foreground">{formatBRL(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Frete</span>
                <span className={form.envio ? "text-foreground" : undefined}>
                  {form.envio ? formatBRL(freight) : "Informe seu endereço"}
                </span>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Total</span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[11px] text-muted-foreground">BRL</span>
                <span className="font-bold text-lg">{formatBRL(total)}</span>
              </span>
            </div>

            {savings > 0 && (
              <Badge variant="secondary" className="w-fit text-orange-700 dark:text-orange-400">
                Você está economizando {formatBRL(savings)}
              </Badge>
            )}

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3.5 py-3 text-sm">
              <Truck className="size-4 shrink-0 text-muted-foreground" />
              Em estoque, pronto para envio!
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-3">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">Pagamento seguro</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                  Criptografia SSL de ponta a ponta. Seus dados de cartão nunca ficam armazenados aqui.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <RotateCcw className="size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">7 dias de garantia</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                  Não ficou satisfeito? Devolução total em até 7 dias após o recebimento.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Truck className="size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">Entrega em todo o Brasil</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                  Informe o CEP para ver o prazo estimado da sua região.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Avaliações de clientes</span>
              <span className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="size-3.5 fill-emerald-600 text-emerald-600" />
                ))}
              </span>
            </div>
            {REVIEWS.map((r, i) => (
              <div key={r.name} className={i > 0 ? "flex flex-col gap-1 border-t pt-3" : "flex flex-col gap-1"}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs">{r.name}</span>
                  <span className="flex gap-0.5">
                    {[...Array(r.stars)].map((_, j) => (
                      <Star key={j} className="size-3 fill-amber-400 text-amber-400" />
                    ))}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">{r.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela de sucesso
// ---------------------------------------------------------------------------
function SuccessScreen({ orderId, total, email }: { orderId: string | null; total: number; email: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-5 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-600/10">
            <Check className="size-8 text-emerald-600" />
          </div>
          <div>
            <h1 className="font-bold text-xl">Pagamento aprovado!</h1>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              Recebemos seu pedido e já estamos preparando tudo para o envio.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2.5 rounded-lg bg-muted/50 p-4 text-left text-sm">
            {orderId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Número do pedido</span>
                <span className="font-mono font-semibold">{orderId}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor pago</span>
              <span className="font-semibold">{formatBRL(total)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-muted-foreground">Confirmação enviada para</span>
              <span className="truncate font-medium">{email}</span>
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Compra protegida · Processado com segurança
          </p>

          <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
            Voltar à loja
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

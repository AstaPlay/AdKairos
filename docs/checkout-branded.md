# Checkout com marca própria (`/checkout/[slug]`)

## O que é

Página pública de checkout com a marca do AdKairos, que por baixo usa o
mesmo motor de pagamento que a Kairóss já usa em `pay.kaiross.com.br`
(Pagar.me). O comprador nunca vê o domínio da Kairóss.

## Arquivos

```
src/app/checkout/[slug]/
├── layout.tsx                    metadata da página pública
├── page.tsx                      server component, busca produto pelo slug
└── _components/
    └── checkout-client.tsx       formulário completo (client component)

src/app/api/checkout/[slug]/
├── route.ts                      GET  — dados públicos do produto
├── carrinho/route.ts             POST — passo 1: reserva o carrinho
└── pedido/route.ts               POST — passo 3: confirma pagamento

src/lib/
└── checkout-product-index.server.ts   busca produto por kaiross.checkoutSlug

src/services/
└── kaiross-checkout.service.ts   cliente HTTP para pay.kaiross.com.br/backend
```

## Como funciona (mapeamento do fluxo real)

Descoberto por captura de tráfego real do checkout público da Kairóss
(`pay.kaiross.com.br/{slug}`), não é API documentada — pode mudar sem
aviso.

1. **`POST pay.kaiross.com.br/backend/vendas/carrinhos`** (via nosso
   `POST /api/checkout/[slug]/carrinho`) — reserva o carrinho, devolve
   `sessionToken`.

2. **`POST api.pagar.me/core/v5/tokens`** — chamada feita **direto do
   navegador do comprador** (não passa pelo nosso servidor). Tokeniza o
   cartão usando a chave pública do Pagar.me. É assim que o número do
   cartão nunca fica armazenado ou visível no nosso backend.

3. **`POST pay.kaiross.com.br/backend/vendas/checkout`** (via nosso
   `POST /api/checkout/[slug]/pedido`) — confirma o pedido e processa o
   pagamento, recebendo só o token do cartão (nunca o número).

O dinheiro cai na conta Pagar.me da **Kairóss** — sua comissão de afiliado
continua o mesmo mecanismo já existente (`seller-produtos`). Isso não é um
gateway de pagamento próprio, é uma vitrine com marca própria sobre o
motor de pagamento deles.

## Pré-requisitos antes de subir em produção

1. **Variável de ambiente** `NEXT_PUBLIC_PAGARME_PK` — a chave pública
   (`pk_...`) do Pagar.me da conta Kairóss, usada na tokenização no
   client. Sem ela, o checkout com cartão falha com uma mensagem clara
   ("Chave pública de pagamento não configurada").

2. **Índice composto no Firestore** — a busca em
   `checkout-product-index.server.ts` filtra por
   `kaiross.checkoutSlug == slug AND status == "active"` ao mesmo tempo.
   O Firestore vai pedir a criação de um índice composto na primeira
   chamada (aparece um link direto no erro do console do Firebase para
   criar automaticamente).

3. **Confirmar com a Kairóss** se esse uso dos endpoints deles é
   permitido — não é uma integração oficial documentada.

## O que ainda falta (não implementado nesta versão)

- **Tela de QR code do PIX**: o fluxo de PIX está com a chamada pronta
  (`formaPagamento: "PIX"`), mas falta a UI para mostrar o QR code e
  "copia e cola" depois da confirmação — hoje ele segue o mesmo caminho
  do cartão e mostra a tela de sucesso genérica. O formato exato da
  resposta de PIX da Kairóss (`pix.qrCode`, `pix.copiaECola`) ainda não
  foi capturado/confirmado.
- **Cálculo de frete real por CEP**: hoje são 2 opções fixas
  (`SHIPPING_OPTIONS`), não integradas a nenhuma tabela de frete real.
- **Testes automatizados**: nenhum teste foi escrito para as rotas novas.

## Testando localmente

```bash
npm run dev
```

Acesse `http://localhost:3000/checkout/{slug-de-um-produto-afiliado}`,
onde `{slug}` é o `kaiross.checkoutSlug` de um produto com
`status: "active"` já cadastrado no Firestore.

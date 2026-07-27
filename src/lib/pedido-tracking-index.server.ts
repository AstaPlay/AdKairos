import "server-only";
import { firebaseAdminFirestore } from "@/firebase/admin";
import type { KairoossPedidoRaw } from "@/services/kaiross-integration.service";

/**
 * Índice persistente para o rastreio público (`/rastreio`), que precisa
 * achar um pedido só com CPF/telefone/nº do pedido, SEM saber de antemão
 * qual vendedor é o dono — algo que o cache volátil de 10 min por-vendedor
 * (`kaiross_proxy_cache`) não permite fazer com eficiência.
 *
 * Este índice é escrito de forma incremental (upsert) toda vez que a rota
 * autenticada de pedidos busca dados frescos da Kairóss para um vendedor —
 * ver `upsertPedidosIndex`, chamado a partir de
 * `kaiross/pedidos/route.ts`. Nunca é a fonte de verdade sobre valores
 * financeiros (isso continua vindo ao vivo da Kairóss quando o vendedor
 * abre o painel) — é só um índice de busca para a tela pública.
 *
 * Guardamos o mínimo necessário para: (a) confirmar identidade de quem
 * pergunta (hash do CPF/telefone, nunca em texto puro) e (b) mostrar
 * status/rastreio. Nunca gravamos endereço completo ou e-mail aqui.
 */
const TRACKING_INDEX_COLLECTION = "pedidos_tracking_index";

export interface PedidoTrackingIndexDoc {
  vendedorUid: string;
  numeroPedido: string;
  cpfHash: string | null;
  telefoneHash: string | null;
  clienteNomeParcial: string;
  statusPagamento: string;
  statusFornecedor: string | null;
  codigoRastreio: string | null;
  dataCriacao: string;
  dataEnvio: string | null;
  itensResumo: string[];
  updatedAt: string;
}

/**
 * Hash simples (SHA-256) de CPF/telefone normalizados (só dígitos). Não é
 * para segurança criptográfica de senha — é só para nunca guardar o
 * documento em texto puro num índice de busca pública, mantendo a
 * capacidade de comparar "este CPF bate com o de algum pedido".
 */
async function hashDigits(value: string): Promise<string> {
  const digitsOnly = value.replace(/\D/g, "");
  const encoded = new TextEncoder().encode(digitsOnly);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function maskNome(nomeCompleto: string): string {
  const [primeiro, ...resto] = nomeCompleto.trim().split(/\s+/);
  if (!primeiro) return "";
  const ultimo = resto.at(-1);
  return ultimo ? `${primeiro} ${ultimo[0]}.` : primeiro;
}

/**
 * Atualiza o índice de rastreio a partir da lista de pedidos que a rota
 * autenticada acabou de buscar (fresca ou de cache) para um vendedor.
 * Nunca lança — indexação é best-effort, uma falha aqui não pode quebrar a
 * tela normal de pedidos do vendedor.
 */
export async function upsertPedidosIndex(vendedorUid: string, pedidos: KairoossPedidoRaw[]): Promise<void> {
  try {
    const batch = firebaseAdminFirestore.batch();
    const now = new Date().toISOString();

    for (const pedido of pedidos) {
      const cpf = pedido.clienteContato?.documento;
      const telefone = pedido.clienteContato?.telefone;
      // Sem nenhuma forma de contato não há como este pedido ser encontrado
      // no rastreio público — ainda assim indexamos pelo nº do pedido, que
      // o formulário aceita como campo opcional complementar ao CPF.
      const doc: PedidoTrackingIndexDoc = {
        vendedorUid,
        numeroPedido: pedido.numeroPedido,
        cpfHash: cpf ? await hashDigits(cpf) : null,
        telefoneHash: telefone ? await hashDigits(telefone) : null,
        clienteNomeParcial: maskNome(pedido.clienteNome),
        statusPagamento: pedido.statusPagamento,
        statusFornecedor: pedido.statusFornecedor ?? null,
        codigoRastreio: pedido.codigoRastreio ?? null,
        dataCriacao: pedido.dataCriacao,
        dataEnvio: pedido.dataEnvio ?? null,
        itensResumo: pedido.itens.map((item) => item.produtoNome),
        updatedAt: now,
      };

      const ref = firebaseAdminFirestore.collection(TRACKING_INDEX_COLLECTION).doc(pedido.id);
      batch.set(ref, doc, { merge: true });
    }

    await batch.commit();
  } catch {
    // Best-effort: indexação para o rastreio público nunca pode derrubar a
    // tela autenticada de pedidos do vendedor.
  }
}

/**
 * Busca no índice por CPF e, opcionalmente, número do pedido — replica a
 * mesma combinação de campos do formulário público real da Kairóss
 * (CPF obrigatório + nº do pedido opcional, confirmado via captura de
 * `GET /rastreio` em 2026-07-26). Telefone é aceito como alternativa ao
 * CPF para manter o item de produto original, mas o formulário prioriza CPF.
 */
export async function findPedidosByDocumento(input: {
  cpf?: string;
  telefone?: string;
  numeroPedido?: string;
}): Promise<PedidoTrackingIndexDoc[]> {
  const cpfHash = input.cpf ? await hashDigits(input.cpf) : null;
  const telefoneHash = input.telefone ? await hashDigits(input.telefone) : null;
  if (!cpfHash && !telefoneHash) return [];

  const collection = firebaseAdminFirestore.collection(TRACKING_INDEX_COLLECTION);
  const results: PedidoTrackingIndexDoc[] = [];

  if (cpfHash) {
    const snapshot = await collection.where("cpfHash", "==", cpfHash).get();
    results.push(...snapshot.docs.map((doc) => doc.data() as PedidoTrackingIndexDoc));
  }
  if (telefoneHash && results.length === 0) {
    const snapshot = await collection.where("telefoneHash", "==", telefoneHash).get();
    results.push(...snapshot.docs.map((doc) => doc.data() as PedidoTrackingIndexDoc));
  }

  const filtered = input.numeroPedido
    ? results.filter((pedido) => pedido.numeroPedido.toLowerCase() === input.numeroPedido!.toLowerCase())
    : results;

  return filtered.sort((a, b) => (a.dataCriacao < b.dataCriacao ? 1 : -1));
}

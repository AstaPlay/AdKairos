import "server-only";
import { firebaseAdminFirestore } from "@/firebase/admin";
import type { KairoossSession } from "@/services/kaiross-integration.service";

const INTEGRATIONS_COLLECTION = "kaiross_integrations";

export interface KairoossIntegrationDoc extends KairoossSession {
  ownerId: string;
  connectedAt: string;
}

/**
 * Lê a sessão Kairóss guardada para o usuário (cookies/token trocados no
 * login, nunca a senha). Fonte única para todas as rotas de proxy —
 * evita cada endpoint reimplementar a leitura do Firestore Admin.
 */
export async function getKairoossSession(uid: string): Promise<KairoossIntegrationDoc | null> {
  const doc = await firebaseAdminFirestore.collection(INTEGRATIONS_COLLECTION).doc(uid).get();
  const data = doc.data() as KairoossIntegrationDoc | undefined;
  if (!data || (!data.cookies && !data.token)) return null;
  return data;
}

export { INTEGRATIONS_COLLECTION };

const CACHE_COLLECTION = "kaiross_proxy_cache";
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 min — mesmo TTL usado no proxy de referência do AdTurbo.

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
}

/**
 * Cache server-side com TTL para respostas da API da Kairóss, por usuário
 * (chave inclui o uid — nunca compartilha catálogo/ranking entre contas).
 * Evita bater na Kairóss a cada abertura do modal; invalidado explicitamente
 * após qualquer mutação (afiliar, atualizar preço/frete, excluir).
 */
export async function readCachedValue<T>(key: string): Promise<T | null> {
  try {
    const snapshot = await firebaseAdminFirestore.collection(CACHE_COLLECTION).doc(key).get();
    const envelope = snapshot.data() as CacheEnvelope<T> | undefined;
    if (!envelope) return null;
    if (Date.now() - envelope.cachedAt > DEFAULT_TTL_MS) return null;
    return envelope.data;
  } catch {
    // Cache é uma otimização, não uma dependência crítica — qualquer falha
    // de leitura simplesmente força uma busca fresca na Kairóss.
    return null;
  }
}

export async function writeCachedValue<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { data, cachedAt: Date.now() };
    await firebaseAdminFirestore.collection(CACHE_COLLECTION).doc(key).set(envelope);
  } catch {
    // Falha ao gravar cache não deve derrubar a resposta ao usuário.
  }
}

export async function invalidateCachedValues(keys: string[]): Promise<void> {
  try {
    await Promise.all(
      keys.map((key) => firebaseAdminFirestore.collection(CACHE_COLLECTION).doc(key).delete()),
    );
  } catch {
    // Idem — pior caso é servir um dado com até 10 min de atraso.
  }
}

export function kairoossCacheKey(uid: string, suffix: string): string {
  return `${uid}__${suffix}`;
}

import "server-only";
import { firebaseAdminFirestore } from "@/firebase/admin";

const RATE_LIMIT_COLLECTION = "rate_limits";

interface RateLimitEnvelope {
  count: number;
  windowStartedAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Limitador de taxa simples por chave (ex.: `kaiross_login__{uid}`), janela
 * fixa em Firestore Admin. Não é distribuído-perfeito sob concorrência
 * extrema, mas é suficiente para conter tentativas repetidas de login contra
 * a Kairóss a partir de uma única conta.
 */
export async function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const ref = firebaseAdminFirestore.collection(RATE_LIMIT_COLLECTION).doc(key);

  try {
    const result = await firebaseAdminFirestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const envelope = snapshot.data() as RateLimitEnvelope | undefined;
      const now = Date.now();

      const isNewWindow = !envelope || now - envelope.windowStartedAt > windowMs;
      const currentCount = isNewWindow ? 0 : envelope.count;

      if (currentCount >= limit) {
        const windowStartedAt = envelope!.windowStartedAt;
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, windowMs - (now - windowStartedAt)),
        };
      }

      transaction.set(ref, {
        count: currentCount + 1,
        windowStartedAt: isNewWindow ? now : envelope!.windowStartedAt,
      } satisfies RateLimitEnvelope);

      return { allowed: true, remaining: limit - currentCount - 1, retryAfterMs: 0 };
    });

    return result;
  } catch {
    // Se o rate limiter falhar, não bloqueia o usuário legítimo — degrada
    // para "sem limite" nesta chamada, não para "todo mundo bloqueado".
    return { allowed: true, remaining: 0, retryAfterMs: 0 };
  }
}

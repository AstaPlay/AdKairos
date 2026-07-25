import "server-only";

/**
 * Sanitiza um erro de infraestrutura (Firestore, chamada HTTP externa etc.)
 * para uma mensagem segura de expor ao cliente em uma API Route. Erros de
 * infra podem conter nomes de projeto, URLs internas ou stack traces — isso
 * nunca deve chegar à resposta JSON.
 */
export function toSafeApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message.includes("PERMISSION_DENIED") || error.message.includes("firestore.googleapis.com")) {
      return "Não foi possível conectar ao banco de dados no momento. Tente novamente em instantes.";
    }
  }
  return fallback;
}

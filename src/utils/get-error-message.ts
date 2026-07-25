function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "TypeError" &&
    (message.includes("fetch") || message.includes("network") || message.includes("load failed"))
  );
}

/** Erro amigável para exibir no client — usado onde error.message já tende a ser legível (validação, fetch). */
export function getErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Sem conexão com a internet. Verifique sua rede e tente novamente.";
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Algo deu errado. Tente novamente.";
}

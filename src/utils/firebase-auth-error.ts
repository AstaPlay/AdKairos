/**
 * Traduz códigos de erro do Firebase Auth (ex.: "auth/wrong-password") em
 * mensagens curtas e humanas em português. Sem isso, erros do Firebase
 * vazam crus pro usuário (ex.: "Firebase: Error (auth/wrong-password).").
 */

interface FirebaseAuthErrorLike {
  code?: string;
  message?: string;
}

const FIREBASE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos. Confira os dados e tente novamente.",
  "auth/wrong-password": "Senha incorreta. Confira e tente novamente.",
  "auth/user-not-found": "Não encontramos uma conta com este e-mail.",
  "auth/invalid-email": "Este e-mail não parece válido.",
  "auth/user-disabled": "Esta conta foi desativada. Fale com o suporte.",
  "auth/too-many-requests": "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.",
  "auth/email-already-in-use": "Já existe uma conta com este e-mail. Tente entrar.",
  "auth/weak-password": "Senha muito fraca. Use ao menos 8 caracteres, com letras e números.",
  "auth/network-request-failed": "Falha de conexão. Verifique sua internet e tente novamente.",
  "auth/popup-closed-by-user": "Janela fechada antes de concluir. Tente novamente.",
  "auth/requires-recent-login": "Por segurança, faça login novamente para continuar.",
  "auth/expired-action-code": "Este link expirou. Solicite um novo.",
  "auth/invalid-action-code": "Este link não é mais válido. Solicite um novo.",
};

/** Extrai o código "auth/..." de um erro do Firebase, cru ou já com prefixo. */
function extractFirebaseCode(error: unknown): string | null {
  const candidate = error as FirebaseAuthErrorLike | null;
  const raw = candidate?.code ?? (typeof error === "string" ? error : null);
  if (!raw) return null;
  const match = /auth\/[a-z-]+/.exec(raw);
  return match ? match[0] : null;
}

/**
 * Retorna uma mensagem amigável para um erro de autenticação. Se o erro não
 * vier do Firebase (código desconhecido), cai para o texto padrão fornecido.
 */
export function getFirebaseAuthErrorMessage(error: unknown, fallback: string): string {
  const code = extractFirebaseCode(error);
  if (code && FIREBASE_AUTH_ERROR_MESSAGES[code]) {
    return FIREBASE_AUTH_ERROR_MESSAGES[code];
  }
  return fallback;
}

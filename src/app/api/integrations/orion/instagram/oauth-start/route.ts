import { type NextRequest, NextResponse } from "next/server";

import { buildInstagramOAuthStartUrl } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";

/**
 * Redireciona para `GET /instagram/oauth/start` no Órion. É navegação
 * de browser (o botão "Conectar com Instagram" da UI aponta direto
 * pra cá via `<a href>`), não uma chamada `fetch` — por isso a
 * autenticação aqui usa a sessão do Next (cookie), não um header
 * Bearer, e a resposta é um redirect 302, não JSON.
 */
export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const startUrl = await buildInstagramOAuthStartUrl(user.uid);
  return NextResponse.redirect(startUrl);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // firebase-admin (via jwks-rsa -> jose) mistura require() com um pacote
  // publicado apenas como ESM. O Turbopack tenta bundlar essa cadeia e
  // quebra em runtime com ERR_REQUIRE_ESM. Marcando como pacote externo do
  // server, o Next.js carrega via require/import nativo do Node em vez de
  // tentar empacotar — é o caminho oficialmente suportado para isso.
  serverExternalPackages: ["firebase-admin"],
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

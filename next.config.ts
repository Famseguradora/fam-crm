import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A tela do FAM Financeiro é um HTML único que a rota lê do disco em tempo de
  // execução. Como o caminho é montado com process.cwd(), o rastreador do build
  // não enxerga a dependência e o arquivo não subiria para a Vercel · sem esta
  // linha, /financeiro funciona local e quebra em produção.
  // Só o dashboard.html entra: o resto da pasta é fonte de build (_p*.html),
  // planilha e PDF de exemplo, que não têm o que fazer no servidor.
  outputFileTracingIncludes: {
    '/api/financeiro/pagina': ['./fam-financeiro/dashboard.html'],
  },

  async headers() {
    return [
      {
        // O service worker deve ser sempre revalidado (nunca cacheado pelo browser/CDN)
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

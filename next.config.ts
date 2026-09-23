import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A equipe abre o CRM tanto por localhost quanto por 127.0.0.1. Em modo
  // desenvolvimento, o Next bloqueia os assets do cliente quando o hostname
  // da aba difere do hostname usado para iniciar o servidor; a tela então
  // renderiza, mas fica sem hidratação e parece estática.
  allowedDevOrigins: ['127.0.0.1'],

  // A tela do FAM Financeiro é um HTML único que a rota lê do disco em tempo de
  // execução. Como o caminho é montado com process.cwd(), o rastreador do build
  // não enxerga a dependência e o arquivo não subiria para a Vercel · sem esta
  // linha, /financeiro funciona local e quebra em produção.
  // Só o dashboard.html entra: o resto da pasta é fonte de build (_p*.html),
  // planilha e PDF de exemplo, que não têm o que fazer no servidor.
  outputFileTracingIncludes: {
    '/api/financeiro/pagina': ['./fam-financeiro/dashboard.html'],
  },

  experimental: {
    /* O TETO DE 10 MB DO NEXT, e por que ele tinha que subir (09/09/2026).
     *
     * Quando existe um `proxy.ts` (o nosso gate de sessão), o Next lê o corpo
     * da requisição para o proxy e o CORTA em 10 MB por padrão. O corte é
     * silencioso do lado de quem envia: o servidor recebe meio multipart, o
     * `request.formData()` estoura com "expected boundary after body", e a
     * rota responde 500 sem nunca ter visto o arquivo.
     *
     * Foi assim que o "Trazer para a esteira" parou de funcionar: o e-mail da
     * RIALMA tem 16,5 MB (anexos de balanço), o Carteiro tentava de 5 em 5
     * segundos, e o erro chegava vazio na tela dele. Um e-mail de pedido de
     * garantia com dois balanços e Serasa passa de 10 MB com facilidade.
     *
     * 50 MB é o mesmo número que já valia nos outros dois lugares: o
     * `MAX_BYTES_EMAIL` da rota (que recusa com mensagem legível) e o teto do
     * bucket `fam-anexos` no Storage. Os três precisam concordar, senão o
     * arquivo passa num lugar e morre no seguinte.
     *
     * `proxyClientMaxBodySize` é o nome atual; `middlewareClientMaxBodySize`
     * é o alias antigo, deste mesmo campo, e está deprecado.
     */
    proxyClientMaxBodySize: '50mb',
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

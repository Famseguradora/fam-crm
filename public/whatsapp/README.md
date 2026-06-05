# Assets do WhatsApp

Banner exibido no topo dos cards de KPI enviados no WhatsApp.

- **Arquivo:** `banner-fam.png` (já gerado, 1024×536) — servido em `/whatsapp/banner-fam.png`
- **Configuração:** defina `WHATSAPP_BANNER_URL` no ambiente, ex.:
  `https://SEU-APP.vercel.app/whatsapp/banner-fam.png`

## Regerar o banner

A arte-fonte é HTML ([scripts/banner-fam.html](../../scripts/banner-fam.html)) e o PNG é
renderizado via Playwright:

```
node scripts/gen-banner.mjs
```

(Se for a primeira vez: `npx playwright install chromium`.)

Se `WHATSAPP_BANNER_URL` não estiver definida, o card usa um cabeçalho de texto simples
("FAM Seguradora") como fallback — a integração continua funcionando.

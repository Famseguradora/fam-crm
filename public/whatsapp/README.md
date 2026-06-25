# Assets do WhatsApp

Banner do FAM (1024×536) — `banner-fam.png`, servido em `/whatsapp/banner-fam.png`.

> Nota: desde a migração para a **Z-API**, os cards de KPI são enviados como texto
> (sem imagem de cabeçalho), então este banner **não é mais usado** pela integração.
> O arquivo é mantido apenas como asset reaproveitável (ex.: futura arte de mensagem).

## Regerar o banner

A arte-fonte é HTML ([scripts/banner-fam.html](../../scripts/banner-fam.html)) e o PNG é
renderizado via Playwright:

```
node scripts/gen-banner.mjs
```

(Se for a primeira vez: `npx playwright install chromium`.)

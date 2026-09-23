// ============================================================================
//  A PELE DAS TELAS DA ANÁLISE DE CRÉDITO  ·  um bloco de CSS, prefixo `an-`
//
//  Fica num componente, e não no `globals.css`, por um motivo medido mais de
//  uma vez: classe nova no globals.css não chega ao navegador com o dev server
//  de pé (é preciso derrubar, apagar .next e subir de novo), e isso já custou
//  horas. Um `<style>` dentro da árvore chega na hora.
//
//  A PALETA, remodelada em 09/09/2026 a pedido dele: "está muito cara de IA".
//  Saíram os gradientes, as sombras longas, o glow do pulso, os dois roxos dos
//  selos, o lilás da fase "Analisando" e a CAIXA ALTA ESPAÇADA dos rótulos —
//  esse último é o tique que ele já tinha nomeado uma vez no cockpit.
//
//  AS CORES SÃO AS DO CRM, e vêm de `lib/ui/painel.ts` (o mesmo `:root` do
//  globals.css). Aqui elas estão escritas como hex, e isso é uma EXCEÇÃO
//  consciente: este bloco é CSS dentro de um `<style>` com prefixo `an-`, não
//  estilo inline, e interpolar token em template literal a cada linha deixaria
//  a folha ilegível. Combinado com a sessão que criou os tokens em 09/09/2026.
//  Se um valor daqui divergir de `painel.ts`, painel.ts é quem manda.
//
//    fundo ....... #f4f7fb na área, #ffffff no cartão, #f7fafd na zebra
//    texto ....... #0a1628 forte · #26374a corrido · #6080a0 apoio · #8ba3c0 fraco
//    borda ....... #c5d5e8 e #e3ebf5, sempre 1px, sem sombra
//    acento ...... #1e4080 (o azul FAM), e SÓ em link, foco e ação
//    ouro ........ #e8b84b em filete e marcador, NUNCA fundo de bloco grande;
//                  #8a6410 quando precisa ser texto (o #e8b84b não tem contraste)
//    situação .... #1a7a50 bom · #a07b1e atenção · #d64545 ruim
//
//  PROIBIDO aqui dentro, e a regra é dele: caixa alta espaçada, gradiente,
//  glow, sombra colorida, roxo, ciano elétrico, neon. Ver AGENTS.md.
//
//  A única caixa alta espaçada que sobrou está DENTRO do painel de missão
//  (`.an-missao`), e é de propósito: é o que faz o olho achar a etapa sem ler
//  nada em volta. Em qualquer outro rótulo ela volta a ser cara de máquina.
//
//  O DESENHO continua sendo o do cockpit do Sistema de Análise, tela a tela;
//  só a pele é a da casa. O sistema antigo não é tocado por nada daqui.
// ============================================================================

export default function EstiloAnalises() {
  return (
    <style>{`
/* ── a área ──────────────────────────────────────────────────────────────
   O papel em que a Análise inteira é desenhada. O resto do CRM continua com o
   fundo azulado da casa; aqui dentro é papel, para o azul sobrar só no acento. */
.an-area { background:#f4f7fb; min-height:calc(100vh - 60px); }

/* AS CLASSES DA CASA, DENTRO DA ÁREA DA ANÁLISE.
   O Acervo e o relatório são desenhados com as classes 'mt-' e 'kpi-' do
   globals.css, que são de TODO o CRM: o Acervo abria com EMPRESAS, APROVADAS,
   EMPRESA, CORRETORA, tudo em caixa alta espaçada, que é o tique que ele
   mandou tirar. Corrigir no globals repintaria o CRM inteiro, o que ele não
   pediu; então a correção vive aqui, presa a '.an-area'.

   Fora da Análise, tudo continua exatamente como estava. */
.an-area .kpi-label,
.an-area .mt-lab,
.an-area .mt-bloco-tit,
.an-area .mt-tab th,
.an-area .cs-rot,
.an-area .filter-label,
.an-area .form-label,
.an-area .dossie-mini-label {
  text-transform:none; letter-spacing:0; font-size:11.5px; font-weight:600;
}
.an-area .mt-bloco-tit { font-size:13px; font-weight:700; }
/* A tela do relatório e do editor tem os proprios rotulos, tambem em caixa
   alta espacada. Mesma correcao, mesmo lugar. */
.an-area .mt-campo-rot, .an-area .mt-ed-rot, .an-area .mt-item-meta,
.an-area .mt-cab-rot, .an-area .mt-kpi-rot, .an-area .mt-sec-tit {
  text-transform:none; letter-spacing:0; font-size:11.5px; font-weight:600;
}
.an-area .mt-tab th { color:#6080a0; background:#f7fafd; border-bottom-color:#e3ebf5; }


/* ── a moldura ─────────────────────────────────────────────────────────── */
.an-topo { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:12px 18px; }
.an-marca { display:flex; flex-direction:column; min-width:0; }
.an-marca-tit { font-size:17px; font-weight:700; color:#0a1628; letter-spacing:-.2px; line-height:1.1; }
.an-marca-sub { font-size:11.5px; color:#6080a0; margin-top:3px; font-variant-numeric:tabular-nums; }
.an-abas { display:flex; align-items:center; gap:4px; margin-left:auto; flex-wrap:wrap; }
.an-aba { font:inherit; font-size:13.5px; font-weight:700; color:#6080a0; background:none; border:1px solid transparent;
  border-radius:9px; padding:7px 13px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
.an-aba:hover { background:#f2f7fd; color:#1e4080; }
.an-aba.on { background:#fff; color:#1e4080; border-color:#c5d5e8; }
.an-aba i { font-style:normal; font-size:11px; font-weight:700; background:#e8f0fa; color:#26374a; border-radius:10px; padding:1px 7px; min-width:20px; text-align:center; }
.an-aba i.quente { background:#e8b84b; color:#2a1f05; }
.an-links { display:flex; align-items:center; gap:2px; flex-wrap:wrap; }
.an-lk { font:inherit; font-size:12.5px; font-weight:600; color:#3070c8; background:none; border:none; padding:6px 9px; border-radius:7px; cursor:pointer; text-decoration:none; white-space:nowrap; }
.an-lk:hover { background:#e8f0fa; }
.an-lk.on { background:#e8f0fa; color:#1e4080; }
.an-lk.ouro { color:#8a6410; }
.an-lk.ouro:hover { background:#fdf6e3; }
.an-pulso { width:8px; height:8px; border-radius:50%; background:#27a96c; display:inline-block; flex:none; animation:anPulso 2.4s ease-in-out infinite; }
.an-pulso.off { background:#c5d5e8; animation:none; }
@keyframes anPulso { 0%,100%{opacity:1} 50%{opacity:.35} }
@media (prefers-reduced-motion: reduce){ .an-pulso{animation:none} }

/* ── a faixa de comando (os cinco números) ────────────────────────────── */
.an-faixa { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:12px; margin:14px 0; }
.an-kpi { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:13px 16px; min-width:0; text-align:left;
  font:inherit; cursor:default; }
.an-kpi.vai { cursor:pointer; }
.an-kpi.vai:hover { border-color:#3070c8; }
.an-kpi .r { font-size:11.5px; font-weight:600; color:#6080a0; letter-spacing:0; }
.an-kpi .v { font-size:26px; font-weight:700; color:#0a1628; margin-top:4px; line-height:1.1; font-variant-numeric:tabular-nums; }
.an-kpi .v.atencao { color:#a07b1e; }
.an-kpi .v.bom { color:#1a7a50; }
.an-kpi .n { font-size:11.5px; color:#6080a0; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
@media (max-width:1100px){ .an-faixa { grid-template-columns:repeat(3, minmax(0,1fr)); } }
@media (max-width:640px){ .an-faixa { grid-template-columns:repeat(2, minmax(0,1fr)); } }

/* ── a execução ao vivo ───────────────────────────────────────────────── */
.an-exec { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:13px 16px; margin-bottom:12px; }
.an-exec-l { display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:13px; }
.an-exec-l b { color:#0a1628; }
.an-exec-l .et { color:#1e4080; font-weight:700; text-transform:uppercase; font-size:11px; letter-spacing:.6px; }
.an-barra { height:6px; background:#e3ebf5; border-radius:3px; overflow:hidden; margin-top:8px; }
.an-barra i { display:block; height:100%; background:#1e4080; transition:width .4s; }
.an-barra i.ruim { background:#d64545; }

/* ── O PAINEL DE MISSÃO ────────────────────────────────────────────────────
   Porte do 'blocoExecucao()' do cockpit ('_sistema/cockpit/cockpit.js') com o
   CSS de '.fx-missao', peça por peça: o anel que corre contra a meta de 5:00,
   a etapa em letra de marco, os três quadrinhos de telemetria, o trilho das
   etapas, o custo de cada etapa fechada, o botão de parar e o aviso do rodapé.

   O que mudou em relação ao modelo é SÓ a pele: lá o cartão é dourado sobre
   azul-noite, aqui é papel com uma borda âmbar fina. Nenhuma peça foi tirada e
   nenhuma foi inventada.

   A caixa alta espaçada sobrevive aqui, e só aqui, pelo motivo escrito no
   cockpit: é o que faz o olho achar em que pé a análise está sem ler o resto. */
.an-rodando { display:grid; grid-template-columns:repeat(auto-fit, minmax(520px,1fr)); gap:12px; }
@media (max-width:640px){ .an-rodando { grid-template-columns:1fr; } }

.an-missao { background:#fffdf6; border:1px solid #ecdfb4; border-radius:13px; padding:17px 19px; min-width:0; }
.an-missao.travado { background:#fff8f7; border-color:#f5b8b8; }

.an-missao .m2 { display:grid; grid-template-columns:auto minmax(0,1fr); gap:22px; align-items:center; }
.an-missao .m2-tx { min-width:0; }
@media (max-width:820px){ .an-missao .m2 { grid-template-columns:1fr; justify-items:start; } }

/* O anel é um 'conic-gradient' com o furo por cima: sem SVG e sem biblioteca.
   Quem faz o arco andar é o relógio da Mesa, que reescreve '--arco' a cada
   segundo. */
.an-missao .anel {
  width:152px; height:152px; border-radius:50%; flex:none;
  display:grid; place-items:center; position:relative;
  background:conic-gradient(#e8b84b var(--arco,0deg), #e3ebf5 var(--arco,0deg) 360deg);
}
.an-missao .anel::before { content:''; position:absolute; inset:10px; border-radius:50%; background:#fffdf6; }
.an-missao .anel .miolo { position:relative; text-align:center; }
.an-missao .anel .tmais { font-size:23px; font-weight:800; color:#8a6410; font-variant-numeric:tabular-nums; }
.an-missao .anel .de { font-size:10.5px; letter-spacing:.7px; text-transform:uppercase; color:#6080a0; }
.an-missao.travado .anel { background:conic-gradient(#d64545 var(--arco,0deg), #e3ebf5 var(--arco,0deg) 360deg); }
.an-missao.travado .anel::before { background:#fff8f7; }
.an-missao.travado .anel .tmais { color:#a02020; }

.an-missao .marco {
  display:inline-block; margin-bottom:8px;
  font-size:11px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase;
  color:#8a6410; border:1px solid #e8b84b; border-radius:5px; padding:3px 10px;
}
.an-missao.travado .marco { color:#a02020; border-color:#d64545; }

.an-missao h3 { margin:0; font-size:20px; font-weight:700; color:#0a1628; letter-spacing:-.2px; overflow-wrap:anywhere; }
.an-missao .msg { font-size:12.5px; color:#26374a; margin-top:2px; min-height:17px; }

.an-missao .telemetria { display:grid; grid-template-columns:repeat(auto-fit, minmax(132px,1fr)); gap:8px; margin-top:12px; }
.an-missao .tele { border:1px solid #ecdfb4; border-radius:10px; padding:8px 11px; background:#fff; min-width:0; }
.an-missao .tele .r { display:block; font-size:10px; letter-spacing:.8px; text-transform:uppercase; color:#6080a0; margin-bottom:2px; }
.an-missao .tele b { font-size:17px; color:#0a1628; font-variant-numeric:tabular-nums; }
.an-missao .tele .u { font-size:11.5px; color:#26374a; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.an-missao .trilho { display:flex; gap:3px; margin:12px 0 7px; }
.an-missao .trilho i { flex:1; height:4px; border-radius:2px; background:#e3ebf5; transition:.3s; }
.an-missao .trilho i.feito { background:#27a96c; }
/* A etapa em curso respira. É o único sinal de vida da tela quando uma análise
   demora, e é o que separa "está trabalhando" de "travou". */
.an-missao .trilho i.agora { background:#e8b84b; animation:anRespira 1.6s ease-in-out infinite; }
@keyframes anRespira { 0%,100%{opacity:1} 50%{opacity:.35} }
@media (prefers-reduced-motion: reduce){ .an-missao .trilho i.agora { animation:none } }

.an-missao .custo { margin-top:7px; color:#6080a0; font-size:12.5px; overflow-wrap:anywhere; }
.an-missao .recado { margin:12px 0 0; font-size:12.5px; line-height:1.5; color:#26374a; background:#f7fafd; border:1px solid #dbe6f3; border-radius:9px; padding:9px 12px; }
.an-missao .recado.para { background:#fbeaea; border-color:#f5b8b8; color:#a02020; }
.an-missao .pe { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:12px; }
.an-missao .pe .obs { font-size:12px; color:#6080a0; }
.an-obs-rodando { margin-top:9px; color:#6080a0; font-size:12.5px; line-height:1.5; }

/* O título de seção do cockpit: sem caixa alta espaçada e sem a régua comprida
   correndo até a borda, que foram as duas coisas que ele chamou de cara de
   feito por IA. */
.an-tit { display:flex; align-items:baseline; gap:9px; flex-wrap:wrap; margin:16px 0 9px; font-size:14.5px; font-weight:700; color:#0a1628; }
.an-tit .q { font-size:13px; font-weight:600; color:#6080a0; }
.an-tit .dica { font-size:12.5px; font-weight:400; color:#6080a0; margin-left:auto; text-align:right; }

/* ── a barra da mesa ──────────────────────────────────────────────────── */
.an-mesabar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
.an-seg { display:inline-flex; background:#fff; border:1px solid #c5d5e8; border-radius:9px; overflow:hidden; }
.an-seg button { font:inherit; font-size:13px; font-weight:700; color:#6080a0; background:none; border:none; padding:8px 14px; cursor:pointer; border-right:1px solid #e3ebf5; }
.an-seg button:last-child { border-right:none; }
.an-seg button.on { background:#e8f0fa; color:#1e4080; }
.an-busca { flex:1 1 220px; min-width:0; max-width:380px; font:inherit; font-size:13.5px; padding:8px 12px; border:1px solid #c5d5e8; border-radius:9px; background:#fff; }
.an-varr { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:12px; color:#6080a0; }
.an-bt { font:inherit; font-size:13px; font-weight:700; padding:8px 14px; border-radius:9px; border:1px solid #c5d5e8; background:#fff; color:#26374a; cursor:pointer; white-space:nowrap; }
.an-bt:hover:not(:disabled) { border-color:#3070c8; color:#1e4080; }
.an-bt:disabled { opacity:.55; cursor:default; }
.an-bt.ouro { background:#fdf6e3; border-color:#ecdfb4; color:#8a6410; }
.an-bt.ouro:hover:not(:disabled) { color:#6b5310; border-color:#e8b84b; }
.an-bt.azul { background:#1e4080; border-color:#1e4080; color:#fff; }
.an-bt.azul:hover:not(:disabled) { background:#2a55a0; color:#fff; }
.an-bt.contorno { border-color:#1e4080; color:#1e4080; }
.an-bt.forcar { border-color:#e0a0a0; color:#a02020; }
.an-bt.forcar:hover:not(:disabled) { background:#fbeaea; color:#a02020; }
.an-bt.mini { font-size:12px; padding:5px 10px; border-radius:7px; }
.an-bt.grande { padding:11px 20px; font-size:14px; }

/* ── o kanban ─────────────────────────────────────────────────────────── */
.an-kb { display:grid; grid-auto-flow:column; grid-auto-columns:236px; gap:12px; overflow-x:auto; padding-bottom:6px; align-items:start; }
.an-col-mexer { margin-left:4px; border:none; background:none; color:#6080a0; font-size:15px; line-height:1; cursor:pointer; padding:0 4px; border-radius:6px; }
.an-col-mexer:hover { background:#fff; color:#0a1628; }
/* Ordenar a coluna (23/09/2026): o nome é o botão, com cara de título. */
.an-col-nome { border:none; background:none; padding:0; font:inherit; font-size:13px; font-weight:700; color:#0a1628; cursor:pointer; text-align:left; }
.an-col-nome:hover { text-decoration:underline; text-decoration-color:#8ba3c0; text-underline-offset:3px; }
.an-col-ord { font-size:11px; color:#6080a0; margin-left:2px; }
.an-col-menu { background:#fff; border:1px solid #dbe6f3; border-radius:9px; padding:4px; margin:0 0 9px; display:flex; flex-direction:column; }
.an-col-menu-tit { font-size:11px; color:#8ba3c0; padding:4px 8px 2px; }
.an-col-menu button { display:flex; align-items:center; gap:6px; border:none; background:none; font:inherit; font-size:12.5px; color:#26374a; text-align:left; padding:6px 8px; border-radius:6px; cursor:pointer; }
.an-col-menu button span { width:12px; color:#3070c8; font-size:11px; flex:none; }
.an-col-menu button:hover { background:#eef4fc; }
.an-col-menu button.on { font-weight:700; color:#0a1628; }
.an-col-menu button.fim { border-top:1px solid #eef2f8; border-radius:0 0 6px 6px; margin-top:3px; padding-top:8px; color:#6080a0; }
.an-col-nova { min-height:60px; border-style:dashed; background:transparent; color:#6080a0; font:inherit; font-size:13px; font-weight:600; cursor:pointer; text-align:center; }
.an-col-nova:hover { background:#eaf0f8; color:#0a1628; }
.an-colunas-escolha { display:flex; flex-direction:column; gap:6px; max-height:300px; overflow-y:auto; }
.an-col-op { display:flex; align-items:center; gap:9px; padding:8px 10px; border:1px solid #dbe6f3; border-radius:8px; cursor:pointer; font-size:13px; color:#26374a; }
.an-col-op:hover { background:#f7fafd; }
.an-col-op.on { border-color:#3070c8; background:#eef4fc; }
.an-col-op input { margin:0; }
.an-col-op .pt { width:9px; height:9px; border-radius:50%; flex:none; }
.an-col-op small { display:block; font-size:11.5px; color:#6080a0; font-weight:400; }
.an-col { background:#eaf0f8; border:1px solid #dbe6f3; border-radius:13px; padding:10px; min-height:140px; }
.an-col-cab { display:flex; align-items:center; gap:8px; padding:2px 4px 10px; }
.an-col-cab b { font-size:13px; color:#0a1628; }
.an-col-cab i { font-style:normal; font-size:11.5px; font-weight:700; color:#26374a; background:#fff; border-radius:10px; padding:1px 8px; }
.an-col-cab .pt { width:8px; height:8px; border-radius:50%; flex:none; }
.an-col-cab small { margin-left:auto; color:#8ba3c0; font-size:11px; }
.an-col-vazia { color:#8ba3c0; font-size:12px; text-align:center; padding:18px 6px; }

/* ── a ordem da coluna, arrastando (23/09/2026) ───────────────────────────
   O card ganhou uma moldura porque o número e as setas não podem morar DENTRO
   do <button> da ficha (botão dentro de botão é HTML inválido, e o teclado
   passa a tropeçar nele). A moldura é quem arrasta; a ficha continua sendo o
   botão que abre o card.

   AS SETAS EXISTEM POR CAUSA DO CELULAR. Arrastar com o dedo não dispara o
   drag-and-drop do HTML, e ele usa o CRM no telefone o tempo todo: sem as
   setas, a prioridade seria uma função que só funciona sentado. */
.an-fi-box { position:relative; }
.an-fi-box.arrastando { opacity:.45; }
.an-fi-box.alvo .an-ficha { border-color:#3070c8; box-shadow:0 -3px 0 -1px #3070c8; }
.an-fi-num { position:absolute; top:-5px; left:-5px; z-index:2; min-width:19px; height:19px; padding:0 5px;
  border-radius:10px; background:#5a7290; color:#fff; font-size:11px; font-weight:700; line-height:19px;
  text-align:center; font-variant-numeric:tabular-nums; box-shadow:0 1px 3px rgba(10,22,40,.3); }
.an-fi-num.mao { background:#8a6410; }
.an-fi-setas { position:absolute; top:6px; right:6px; z-index:2; display:flex; flex-direction:column; gap:2px; opacity:0; transition:opacity .12s; }
.an-fi-box:hover .an-fi-setas, .an-fi-box:focus-within .an-fi-setas { opacity:1; }
.an-fi-seta { border:1px solid #dbe6f3; background:#fff; color:#5a7290; border-radius:5px; width:20px; height:17px;
  font-size:9px; line-height:1; cursor:pointer; padding:0; display:grid; place-items:center; }
.an-fi-seta:hover:not(:disabled) { background:#eef4fc; color:#0a1628; border-color:#3070c8; }
.an-fi-seta:disabled { opacity:.35; cursor:default; }
/* No celular não há hover, e sem isto as setas nunca apareceriam — que é
   justamente onde elas são a única forma de reordenar. Alvo de 30px. */
@media (hover:none) {
  .an-fi-setas { opacity:1; }
  .an-fi-seta { width:30px; height:26px; font-size:11px; }
  /* Os botões do cabeçalho da coluna (↺ e ⋯) no dedo: eram ~15px, que é menos
     da metade do alvo mínimo. Mesma correção, mesmo motivo. */
  .an-col-mexer { min-width:30px; min-height:28px; font-size:17px; }
  .an-col-nome { min-height:30px; }
  .an-col-menu button { min-height:36px; font-size:14px; }
}

.an-ficha { background:#fff; border:1px solid #e3ebf5; border-left:4px solid var(--cor,#8ba3c0); border-radius:11px; padding:11px 12px; margin-bottom:9px;
  cursor:pointer; text-align:left; width:100%; font:inherit; color:inherit; display:block; transition:.12s; }
.an-ficha:hover { border-color:#3070c8; border-left-color:var(--cor,#8ba3c0); }
.an-ficha:focus-visible { outline:2px solid #3070c8; outline-offset:2px; }
.an-fi-cab { display:flex; align-items:flex-start; gap:9px; }
.an-selo { width:34px; height:34px; border-radius:9px; flex:none; display:grid; place-items:center; color:#fff; font-weight:700; font-size:12.5px; letter-spacing:.3px; background:var(--cor,#3A6491); }
.an-selo.gr { width:52px; height:52px; border-radius:13px; font-size:18px; }
.an-fi-nome { min-width:0; }
.an-fi-nome b { display:block; font-size:13.5px; color:#0a1628; line-height:1.25; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.an-fi-nome small { display:block; font-size:11.5px; color:#6080a0; margin-top:2px; font-variant-numeric:tabular-nums; }
.an-med { margin-top:9px; }
.an-med-barra { height:5px; background:#e3ebf5; border-radius:3px; overflow:hidden; }
.an-med-barra span { display:block; height:100%; background:#3070c8; }
.an-med-barra span.cheia { background:#27a96c; }
.an-med-barra span.trava { background:#d64545; }
.an-med-txt { font-size:11.5px; color:#6080a0; margin-top:4px; display:block; }
.an-med-txt.ok { color:#1a7a50; }
.an-chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.an-chip { font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:6px; background:#eef3f9; color:#26374a; }
.an-chip.falta { background:#fbeaea; color:#a02020; }
.an-chip.duvida { background:#fdf6e3; color:#8a6410; }
.an-chip.ok { background:#e6f9f0; color:#1a7a50; }
.an-chip.erro { background:#fbeaea; color:#a02020; }
.an-chip.varr { background:#fdf6e3; color:#8a6410; }
.an-chip.fase { background:transparent; border:1px solid var(--cor,#3070c8); color:var(--cor,#3070c8); }
.an-fi-ult { font-size:11.5px; color:#26374a; margin-top:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* AS OUTRAS PASTAS DA MESMA EMPRESA (09/09/2026). A analise renomeia a pasta
   enquanto trabalha, entao a mesma empresa tem varias. O card mostra uma so,
   e esta linha diz quais sao as outras: unir calado esconderia trabalho que
   existe no disco. */
.an-fi-pastas { display:flex; align-items:center; gap:6px; margin-top:7px; flex-wrap:wrap; }
.an-fi-pastas-txt { font-size:11px; color:#6080a0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.an-fi-palpite { font-size:10px; font-weight:700; color:#8a6410; background:#fdf6e3; border:1px solid #ecdfb4; border-radius:9px; padding:1px 6px; white-space:nowrap; }
.an-fi-pe { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:11.5px; color:#6080a0; flex-wrap:wrap; }
.an-fi-pe .idade.estourou { color:#d64545; font-weight:700; }
.an-fi-pe .ordem { color:#8a6410; font-weight:700; }
.an-fi-pe .enc { display:inline-flex; align-items:center; gap:5px; }
.an-av { width:20px; height:20px; border-radius:50%; display:inline-grid; place-items:center; color:#fff; font-size:9.5px; font-weight:700; background:var(--cor,#3A6491); flex:none; }

/* ── a galeria ────────────────────────────────────────────────────────── */
.an-gl { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:12px; }
.an-gl-card { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:14px 15px; cursor:pointer; text-align:left; font:inherit; color:inherit; transition:.12s; }
.an-gl-card:hover { border-color:#3070c8; }
.an-gl-card:focus-visible { outline:2px solid #3070c8; outline-offset:2px; }
.an-gl-cab { display:flex; align-items:center; gap:11px; }
.an-gl-cab b { display:block; font-size:14.5px; color:#0a1628; line-height:1.25; }
.an-gl-cab small { display:block; font-size:12px; color:#6080a0; margin-top:2px; }
.an-gl-fase { margin-top:12px; display:flex; gap:6px; flex-wrap:wrap; }
.an-gl-pe { display:flex; align-items:center; justify-content:space-between; margin-top:10px; font-size:12px; color:#6080a0; }
.an-gl-pe .atraso { color:#d64545; font-weight:700; }
.an-pe { font-size:11.5px; color:#6080a0; margin-top:12px; }

/* ── a tabela da mesa ─────────────────────────────────────────────────── */
.an-tab-wrap { background:#fff; border:1px solid #e3ebf5; border-radius:13px; overflow:auto; }
.an-tab { width:100%; border-collapse:collapse; font-size:12.5px; }
.an-tab th { text-align:left; font-size:11.5px; letter-spacing:0; color:#6080a0; padding:10px 12px; border-bottom:1px solid #e3ebf5; background:#f7fafd; white-space:nowrap; }
.an-tab td { padding:10px 12px; border-bottom:1px solid #eef3f9; vertical-align:middle; }
.an-tab tbody tr { cursor:pointer; }
.an-tab tbody tr:hover td { background:#fbfdff; }
.an-tab td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.an-tab td.atrasado { color:#d64545; font-weight:700; }
.an-tab .nome { display:flex; align-items:center; gap:9px; min-width:220px; }
.an-tab .nome b { color:#0a1628; }

/* ── o card do tomador ────────────────────────────────────────────────── */
.an-card-topo { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:14px 18px; }
.an-card-nome { font-size:20px; font-weight:700; color:#0a1628; letter-spacing:-.3px; line-height:1.15; margin:0; }
.an-card-cnpj { font-size:12.5px; color:#6080a0; margin-top:3px; font-variant-numeric:tabular-nums; }
.an-card-fita { margin-left:auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.an-tag { font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:8px; background:#eef3f9; color:#26374a; }
.an-tag.banco { background:#e8f0fa; color:#1a55a0; }
.an-tag.voce { background:#fdf6e3; color:#8a6410; }
.an-tag.rodando { background:#fdf6e3; color:#8a6410; }
.an-tag.pronta { background:#e6f9f0; color:#1a7a50; }
.an-tag.ruim { background:#fbeaea; color:#a02020; }
.an-tag.sub { background:#fdf6e3; color:#8a6410; }
.an-card-abas { display:flex; gap:2px; border-bottom:1px solid #c5d5e8; margin:0 18px; overflow-x:auto; }
.an-card-aba { font:inherit; font-size:13.5px; font-weight:700; color:#6080a0; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-1px;
  padding:9px 13px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
.an-card-aba:hover { color:#1e4080; }
.an-card-aba.on { color:#1e4080; border-bottom-color:#e8b84b; }
.an-card-aba i { font-style:normal; font-size:10.5px; font-weight:700; background:#e8f0fa; color:#26374a; border-radius:9px; padding:1px 6px; }
.an-card-aba b.ponto { width:7px; height:7px; border-radius:50%; background:#e8b84b; display:inline-block; }
.an-card-corpo { padding:16px 18px 22px; }
.an-relatorio-comando { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:0 0 10px; }
.an-relatorio-modos { display:inline-flex; border:1px solid #c5d5e8; border-radius:8px; overflow:hidden; background:#fff; }
.an-relatorio-modos button { border:0; border-right:1px solid #c5d5e8; background:#fff; color:#6080a0; padding:7px 11px; font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; }
.an-relatorio-modos button:last-child { border-right:0; }
.an-relatorio-modos button[aria-selected="true"] { background:#1e4080; color:#fff; }
.an-relatorio-modos button:disabled { opacity:.45; cursor:not-allowed; }
.an-relatorio-estado { color:#6080a0; font-size:11.5px; flex:1; min-width:180px; }
.an-relatorio-integral { height:calc(100vh - 230px); min-height:720px; border:1px solid #c5d5e8; border-radius:10px; overflow:hidden; background:#f4f7fb; }
.an-relatorio-integral iframe { display:block; width:100%; height:100%; border:0; background:#f4f7fb; }
@media (max-width:760px){ .an-relatorio-integral { height:calc(100vh - 190px); min-height:620px; border-radius:8px; } .an-relatorio-comando { gap:7px; } .an-relatorio-estado { flex-basis:100%; } }
.an-duas { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:14px; align-items:start; }
@media (max-width:980px){ .an-duas { grid-template-columns:1fr; }  }

.an-bloco { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:14px 16px 16px; margin-bottom:14px; }
.an-bloco h4 { margin:0 0 10px; font-size:11.5px; font-weight:600; color:#6080a0; letter-spacing:0; display:flex; align-items:center; gap:8px; }
.an-bloco h4 .dir { margin-left:auto; font-weight:600; text-transform:none; letter-spacing:0; font-size:11.5px; display:flex; gap:6px; align-items:center; }
.an-dados { display:grid; grid-template-columns:auto 1fr; gap:6px 16px; margin:0; font-size:13.5px; }
.an-dados dt { color:#6080a0; }
.an-dados dd { margin:0; text-align:right; color:#0a1628; font-weight:700; font-variant-numeric:tabular-nums; }
.an-dados dd.dec.ok { color:#1a7a50; } .an-dados dd.dec.res { color:#a07b1e; } .an-dados dd.dec.nao { color:#a02020; }
.an-dados dd small { display:block; font-weight:500; color:#6080a0; font-size:11.5px; }
.an-acoes { display:flex; flex-direction:column; gap:8px; }
.an-acoes .an-bt { width:100%; text-align:center; padding:10px 14px; font-size:13.5px; }
.an-vazio { color:#8ba3c0; font-size:12.5px; line-height:1.55; padding:8px 0; }
.an-explica { font-size:12.5px; color:#6080a0; line-height:1.55; margin:0 0 12px; }
.an-aviso { display:flex; gap:9px; align-items:flex-start; border-radius:9px; padding:9px 12px; font-size:12.5px; line-height:1.5; margin:8px 0; background:#f7fafd; border:1px solid #dbe6f3; color:#26374a; }
.an-aviso.erro { background:#fbeaea; border-color:#f5b8b8; color:#a02020; }
.an-aviso.aviso { background:#fdf6e3; border-color:#ecdfb4; color:#8a6410; }
.an-aviso.bom { background:#e6f9f0; border-color:#a7e9c8; color:#1a7a50; }
.an-fam { display:flex; align-items:center; gap:10px; padding:9px 12px; border:1px solid #e3ebf5; border-radius:9px; margin-bottom:7px; background:#fbfdff; }
.an-fam b { font-size:13px; color:#0a1628; }
.an-fam .n { font-size:12px; color:#6080a0; }
.an-fam .anos { margin-left:auto; font-size:11.5px; color:#1e4080; font-weight:700; }
.an-fam .est { margin-left:auto; font-size:11px; font-weight:700; }
.an-fam .est.ok { color:#1a7a50; } .an-fam .est.falta { color:#a02020; } .an-fam .est.duvida { color:#8a6410; } .an-fam .est.a_caminho { color:#3070c8; } .an-fam .est.dispensado { color:#6080a0; }
.an-dica { font-size:11.5px; color:#8ba3c0; line-height:1.5; margin-top:8px; }

/* ── as notas ─────────────────────────────────────────────────────────── */
.an-nt-barra { display:flex; align-items:center; gap:2px; flex-wrap:wrap; border:1px solid #c5d5e8; border-bottom:none; border-radius:9px 9px 0 0; padding:5px 8px; background:#f7fafd; }
.an-nt-barra button { font:inherit; font-size:13px; font-weight:700; width:30px; height:28px; border-radius:6px; border:none; background:none; color:#26374a; cursor:pointer; }
.an-nt-barra button:hover { background:#e8f0fa; }
.an-nt-barra .sep { width:1px; height:18px; background:#dbe6f3; margin:0 4px; }
.an-nt-titulo { width:100%; font:inherit; font-size:14px; font-weight:700; padding:9px 12px; border:1px solid #c5d5e8; border-top:none; border-bottom:1px solid #e3ebf5; background:#fff; outline:none; }
.an-nt-editor { min-height:130px; max-height:420px; overflow:auto; padding:11px 13px; border:1px solid #c5d5e8; border-top:none; border-radius:0 0 9px 9px; background:#fff; font-size:14px; line-height:1.55; outline:none; }
.an-nt-editor:empty::before { content:attr(data-vazio); color:#8ba3c0; }
.an-nt-editor img { max-width:100%; height:auto; border-radius:6px; }
.an-nt-editor mark { background:#fdf0b8; }
.an-nt-editor [data-tarefa]::before { content:'☐ '; color:#3070c8; }
.an-nt-editor [data-tarefa="feita"]::before { content:'☑ '; color:#1a7a50; }
.an-nt-editor.cheia { position:fixed; inset:60px 24px 24px; z-index:1300; max-height:none; border-radius:12px; border:1px solid #c5d5e8; box-shadow:0 18px 48px rgba(10,22,40,.18); font-size:16px; }
.an-nt-pe { display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap; }
.an-nt-pe small { color:#8ba3c0; font-size:11.5px; margin-left:auto; }
.an-nota { border:1px solid #e3ebf5; border-radius:10px; padding:10px 13px; margin-top:9px; background:#fbfdff; font-size:13.5px; line-height:1.55; }
.an-nota.fixada { border-color:#ecdfb4; background:#fdf6e3; }
.an-nota .tit { font-weight:700; color:#0a1628; display:flex; align-items:center; gap:8px; }
.an-nota .tit .q { margin-left:auto; font-weight:500; font-size:11px; color:#8ba3c0; white-space:nowrap; }
.an-nota .corpo { margin-top:5px; color:#26374a; overflow-wrap:anywhere; }
.an-nota .corpo img { max-width:100%; border-radius:6px; }
.an-nota .corpo mark { background:#fdf0b8; }
.an-nota .bts { display:flex; gap:6px; margin-top:7px; }
.an-nota .bts button { font:inherit; font-size:11.5px; color:#3070c8; background:none; border:none; cursor:pointer; padding:0; }
.an-nota .bts button:hover { text-decoration:underline; }
.an-nota .bts button.perigo { color:#a02020; }

/* ── arquivos ─────────────────────────────────────────────────────────── */
.an-arq-topo { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:9px; font-size:12.5px; }
.an-arq-topo .conta b { color:#0a1628; }
.an-lote { display:flex; gap:6px; margin-left:auto; }
.an-lote button { font:inherit; font-size:11.5px; color:#3070c8; background:none; border:1px solid #dbe6f3; border-radius:6px; padding:3px 8px; cursor:pointer; }
.an-lote button:hover { background:#e8f0fa; }
.an-familias { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.an-familia { font-size:11.5px; font-weight:600; color:#26374a; display:inline-flex; align-items:center; gap:6px; background:#f7fafd; border:1px solid #e3ebf5; border-radius:7px; padding:3px 9px; }
.an-bola { width:8px; height:8px; border-radius:50%; background:var(--cor,#7A7A7A); display:inline-block; }
.an-arqs { list-style:none; margin:0; padding:0; }
.an-arq { display:flex; align-items:flex-start; gap:10px; padding:8px 4px; border-bottom:1px solid #eef3f9; }
.an-arq:last-child { border-bottom:none; }
.an-arq.fora { opacity:.6; }
.an-arq input { margin-top:3px; width:16px; height:16px; flex:none; cursor:pointer; }
.an-arq .caixa { width:16px; height:16px; flex:none; text-align:center; font-size:12px; color:#1a7a50; margin-top:2px; }
.an-arq-meio { min-width:0; flex:1; }
.an-arq-nome { font-size:13.5px; color:#0a1628; font-weight:600; overflow-wrap:anywhere; }
.an-arq-sub { display:flex; flex-wrap:wrap; gap:4px 8px; font-size:11.5px; color:#6080a0; margin-top:2px; align-items:center; }
.an-classe { display:inline-flex; align-items:center; gap:5px; font-weight:700; color:var(--cor,#6080a0); }
.an-certeza { font-weight:700; color:#8a6410; }
.an-certeza.nao-lido { color:#a02020; }
.an-atende { color:#1a7a50; font-weight:700; }
.an-arq-leitura { display:block; margin-top:5px; font-size:12.5px; color:#26374a; line-height:1.5; }
.an-arq-leitura b { color:#0a1628; }
.an-achado { display:inline-block; font-size:11px; background:#eef3f9; color:#26374a; border-radius:5px; padding:1px 7px; margin:3px 4px 0 0; }
.an-fonte { display:flex; gap:9px; align-items:flex-start; font-size:12.5px; color:#26374a; line-height:1.5; background:#f7fafd; border:1px solid #dbe6f3; border-radius:9px; padding:9px 12px; margin-bottom:10px; }
.an-emp-fichas { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px,1fr)); gap:8px 16px; margin-bottom:10px; }
.an-emp-fichas div { font-size:13px; color:#0a1628; border-bottom:1px solid #eef3f9; padding:5px 0; }
.an-emp-fichas span { display:block; font-size:11.5px; color:#6080a0; letter-spacing:0; font-weight:700; }
.an-cp-tab { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:8px; }
.an-cp-tab th { text-align:left; background:#f7fafd; color:#6080a0; font-size:11.5px; letter-spacing:0; padding:6px 8px; border-bottom:1px solid #e3ebf5; }
.an-cp-tab td { padding:6px 8px; border-bottom:1px solid #eef3f9; font-variant-numeric:tabular-nums; }

/* ── a aba análise ────────────────────────────────────────────────────── */
.an-campo { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
.an-campo label { font-size:11.5px; font-weight:600; color:#6080a0; letter-spacing:0; }
.an-campo select, .an-campo input[type=text], .an-campo input[type=date], .an-campo textarea { font:inherit; font-size:13.5px; padding:8px 11px; border:1px solid #c5d5e8; border-radius:8px; background:#fbfdff; color:#26374a; }
.an-campo textarea { min-height:72px; resize:vertical; line-height:1.5; }
.an-campo select:focus, .an-campo textarea:focus, .an-campo input:focus { outline:none; border-color:#3070c8; background:#fff; }
.an-bt-linha { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:6px; }
.an-bt-nota { font-size:12px; color:#6080a0; line-height:1.45; flex:1 1 220px; }
.an-resumo { font-size:13.5px; color:#26374a; line-height:1.55; margin-bottom:10px; }
.an-resumo ul { margin:4px 0 0; padding-left:18px; color:#6080a0; font-size:12.5px; }
.an-pensando { display:flex; align-items:center; gap:9px; font-size:13px; color:#6080a0; }
.an-girando { width:14px; height:14px; border:2px solid #dbe6f3; border-top-color:#1e4080; border-radius:50%; animation:anGira 1s linear infinite; flex:none; }
@keyframes anGira { to { transform:rotate(360deg) } }
.an-ordem { background:#fdf6e3; border:1px solid #ecdfb4; color:#6b5310; border-radius:9px; padding:9px 12px; font-size:12.5px; line-height:1.5; margin:8px 0; }
.an-pedido { border:1px solid #e8b84b; background:#fdf6e3; border-radius:11px; padding:13px 15px; margin-bottom:12px; }
.an-pedido .cab { font-size:11.5px; font-weight:600; letter-spacing:0; color:#8a6410; margin-bottom:6px; }
.an-pedido .mot { font-size:14px; font-weight:600; color:#0a1628; line-height:1.5; white-space:pre-wrap; }
.an-pedido .raz { font-size:12.5px; color:#6080a0; border-left:2px solid #dbe6f3; padding-left:10px; margin-top:8px; white-space:pre-wrap; line-height:1.5; max-height:170px; overflow:auto; }

/* ── a IA do card ─────────────────────────────────────────────────────── */
.an-ia-onde { font-size:12.5px; color:#6080a0; line-height:1.55; background:#f7fafd; border:1px dashed #c5d5e8; border-radius:9px; padding:9px 12px; margin-bottom:12px; }
.an-ia-onde b { color:#26374a; }
.an-fio { display:flex; flex-direction:column; gap:10px; max-height:520px; overflow:auto; padding:2px; }
.an-balao { max-width:92%; border-radius:12px; padding:10px 13px; font-size:13.5px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
.an-balao.eu { align-self:flex-end; background:#e8f0fa; color:#0a1628; border-bottom-right-radius:3px; }
.an-balao.ia { align-self:flex-start; background:#f7fafd; border:1px solid #e3ebf5; color:#26374a; border-bottom-left-radius:3px; }
.an-balao.ruim { align-self:flex-start; background:#fbeaea; color:#a02020; }
.an-balao .q { display:block; font-size:10.5px; color:#8ba3c0; margin-top:5px; white-space:nowrap; }
.an-atalhos { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
.an-atalho { font:inherit; font-size:12.5px; color:#26374a; background:#fbfdff; border:1px solid #dbe6f3; border-radius:8px; padding:7px 11px; cursor:pointer; text-align:left; }
.an-atalho:hover { border-color:#3070c8; }
.an-perguntar { display:flex; gap:8px; margin-top:10px; align-items:flex-end; }
.an-perguntar textarea { flex:1; min-width:0; font:inherit; font-size:14px; min-height:44px; max-height:140px; padding:9px 11px; border:1px solid #c5d5e8; border-radius:9px; background:#fff; resize:vertical; }

/* ── encaminhar ───────────────────────────────────────────────────────── */
.an-destinos { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:10px; }
.an-destino { font:inherit; font-size:12.5px; font-weight:600; color:#26374a; background:#fff; border:1px solid #dbe6f3; border-radius:9px; padding:6px 10px 6px 6px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; }
.an-destino:hover { border-color:#3070c8; }
.an-destino.viva { border-color:#1e4080; background:#e8f0fa; color:#1e4080; }
.an-destino .area { color:#6080a0; font-weight:500; font-size:11.5px; }
.an-enc { border:1px solid #e3ebf5; border-radius:10px; padding:10px 13px; margin-bottom:8px; background:#fff; }
.an-enc.aberto { border-left:4px solid #e8b84b; } .an-enc.respondido { border-left:4px solid #2f7d55; } .an-enc.fechado { opacity:.7; border-left:4px solid #c5d5e8; }
.an-enc-cab { display:flex; align-items:center; gap:9px; flex-wrap:wrap; font-size:12.5px; }
.an-enc-cab .quem { font-weight:700; color:#0a1628; }
.an-enc-cab .est { font-weight:700; font-size:11px; letter-spacing:0; }
.an-enc-cab .dias { margin-left:auto; color:#6080a0; font-size:11.5px; }
.an-enc-cab .dias.atrasado { color:#d64545; font-weight:700; }
.an-enc-ped { font-size:13.5px; color:#26374a; margin-top:6px; line-height:1.5; white-space:pre-wrap; }
.an-enc-resp { font-size:13px; color:#1a7a50; margin-top:6px; line-height:1.5; }
.an-enc-bts { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
.an-quem-tem { display:flex; flex-wrap:wrap; gap:10px; }
.an-quem { display:flex; align-items:center; gap:9px; border:1px solid #e3ebf5; border-radius:10px; padding:8px 12px; background:#fbfdff; }
.an-quem.atrasado { border-color:#f5b8b8; }
.an-quem b { font-size:16px; color:#0a1628; }
.an-quem small { display:block; font-size:11.5px; color:#6080a0; }

/* ── atividades ───────────────────────────────────────────────────────── */
.an-ativ { list-style:none; margin:0; padding:0; }
.an-ativ li { display:grid; grid-template-columns:14px 1fr; gap:10px; padding:8px 0; border-bottom:1px solid #eef3f9; align-items:start; }
.an-ativ li:last-child { border-bottom:none; }
.an-ativ .pt { width:9px; height:9px; border-radius:50%; margin-top:5px; background:var(--cor,#8ba3c0); }
.an-ativ .tx { font-size:13.5px; color:#0a1628; line-height:1.45; }
.an-ativ .tx a { color:#1e4080; }
.an-ativ .pe { font-size:11.5px; color:#6080a0; margin-top:2px; }

/* ── recados ──────────────────────────────────────────────────────────── */
.an-rc { display:grid; grid-template-columns:360px minmax(0,1fr); gap:12px; align-items:stretch; min-height:520px; }
@media (max-width:900px){ .an-rc { grid-template-columns:1fr; } }
.an-rc-col { background:#fff; border:1px solid #e3ebf5; border-radius:13px; display:flex; flex-direction:column; min-height:0; max-height:calc(100vh - 230px); }
.an-rc-barra { display:flex; align-items:center; gap:8px; padding:11px 14px; border-bottom:1px solid #e3ebf5; font-size:12.5px; color:#6080a0; flex-wrap:wrap; }
.an-rc-barra .bts { margin-left:auto; display:flex; gap:6px; }
.an-rc-rolo { overflow:auto; flex:1; min-height:0; }
.an-rc-item { display:flex; gap:10px; padding:10px 14px; border-bottom:1px solid #eef3f9; cursor:pointer; width:100%; text-align:left; font:inherit; background:none; border-left:3px solid transparent; border-right:none; border-top:none; }
.an-rc-item:hover { background:#fbfdff; }
.an-rc-item.on { background:#e8f0fa; border-left-color:#1e4080; }
.an-rc-item .meio { min-width:0; flex:1; }
.an-rc-item .de { font-size:11.5px; color:#6080a0; display:flex; gap:6px; align-items:center; }
.an-rc-item .de .q { margin-left:auto; white-space:nowrap; }
.an-rc-item .tit { font-size:13.5px; color:#0a1628; font-weight:700; margin-top:2px; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.an-rc-item.lido .tit { font-weight:600; color:#26374a; }
.an-rc-item .prev { font-size:12px; color:#6080a0; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.an-rc-item .nl { width:8px; height:8px; border-radius:50%; background:#e8b84b; flex:none; margin-top:6px; }
.an-rc-leitura { padding:16px 20px; overflow:auto; flex:1; min-height:0; }
.an-rc-leitura h3 { margin:0; font-size:17px; color:#0a1628; line-height:1.3; }
.an-rc-de { display:flex; align-items:center; gap:10px; margin:10px 0 14px; font-size:12.5px; color:#6080a0; }
.an-rc-de .nm { font-weight:700; color:#0a1628; }
.an-rc-corpo { font-size:14px; line-height:1.65; color:#26374a; white-space:pre-wrap; overflow-wrap:anywhere; }
.an-rc-corpo h4 { font-size:11px; letter-spacing:0; color:#6080a0; margin:16px 0 6px; }
.an-rc-acoes3 { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:10px; margin:8px 0 12px; }
.an-rc-acoes3 .a { border:1px solid #e3ebf5; border-radius:10px; padding:10px 12px; background:#fbfdff; font-size:13px; }
.an-rc-acoes3 .a b { display:block; color:#0a1628; margin-bottom:3px; }
.an-rc-acoes3 .a small { color:#6080a0; line-height:1.45; white-space:normal; }
.an-rc-bts { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
.an-rc-licao { margin-top:14px; font-size:13px; background:#fdf6e3; border:1px solid #ecdfb4; border-radius:9px; padding:9px 12px; color:#6b5310; }
.an-rc-nada { color:#8ba3c0; font-size:13px; padding:20px 14px; line-height:1.55; }

/* ── gestão e sala ────────────────────────────────────────────────────── */
.an-tiles { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:14px; }
@media (max-width:900px){ .an-tiles { grid-template-columns:repeat(2, minmax(0,1fr)); } }
.an-tile { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:12px 16px; min-width:0; }
.an-tile .r { font-size:11.5px; font-weight:600; color:#6080a0; letter-spacing:0; }
.an-tile .v { font-size:24px; font-weight:700; color:#0a1628; margin-top:3px; font-variant-numeric:tabular-nums; line-height:1.1; }
.an-tile .v.ouro { color:#a07b1e; } .an-tile .v.ok { color:#1a7a50; }
.an-tile .u { font-size:14px; color:#6080a0; font-weight:600; }
.an-tile .n { font-size:11.5px; color:#6080a0; margin-top:3px; line-height:1.4; }
.an-grade { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; }
@media (max-width:1100px){ .an-grade { grid-template-columns:repeat(2, minmax(0,1fr)); } }
@media (max-width:700px){ .an-grade { grid-template-columns:1fr; } }
.an-cartao { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:14px 16px; min-width:0; }
.an-cartao h2 { margin:0; font-size:13.5px; color:#0a1628; }
.an-cartao .nota { font-size:11.5px; color:#6080a0; margin:3px 0 10px; line-height:1.45; }
.an-cartao .rodape { font-size:11.5px; color:#6080a0; margin-top:10px; line-height:1.45; }
.an-hbars { display:flex; flex-direction:column; gap:6px; }
.an-hb { display:grid; grid-template-columns:150px 1fr 44px; gap:8px; align-items:center; font-size:12.5px; }
.an-hb .rot { color:#26374a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.an-hb .tr { height:9px; background:#eef3f9; border-radius:5px; overflow:hidden; }
.an-hb .tr i { display:block; height:100%; background:var(--cor,#3070c8); }
.an-hb .n { text-align:right; color:#0a1628; font-weight:700; font-variant-numeric:tabular-nums; }
.an-vcols { display:flex; align-items:flex-end; gap:6px; height:130px; }
.an-vcol { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width:0; }
.an-vcol .val { font-size:11px; color:#0a1628; font-weight:700; margin-bottom:3px; }
.an-vcol .bar { width:100%; background:#3070c8; border-radius:4px 4px 0 0; min-height:3px; }
.an-vcol.andamento .bar { background:#e8b84b; }
.an-vcol .rot { font-size:10.5px; color:#6080a0; margin-top:4px; }
.an-vivo { display:grid; grid-template-columns:120px 1fr; gap:16px; align-items:center; }
.an-anel { width:112px; height:112px; border-radius:50%; background:conic-gradient(#1e4080 var(--arco,0deg), #eef3f9 0); display:grid; place-items:center; }
.an-anel .miolo { width:88px; height:88px; border-radius:50%; background:#fff; display:grid; place-items:center; text-align:center; }
.an-anel .tmais { font-size:17px; font-weight:700; color:#0a1628; font-variant-numeric:tabular-nums; }
.an-anel .de { font-size:10px; color:#6080a0; }
.an-tele { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px,1fr)); gap:8px; margin-top:8px; }
.an-tele div { border:1px solid #e3ebf5; border-radius:8px; padding:6px 9px; }
.an-tele .r { font-size:10px; color:#6080a0; letter-spacing:0; }
.an-tele b { display:block; font-size:15px; color:#0a1628; }
.an-tele .u { font-size:11px; color:#6080a0; }
.an-vagas { display:flex; align-items:center; gap:8px; font-size:13px; color:#6080a0; }
.an-vaga { width:14px; height:14px; border-radius:50%; border:2px dashed #c5d5e8; display:inline-block; }

/* ── a equipe ─────────────────────────────────────────────────────────── */
.an-regua { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
.an-regua .k { background:#fff; border:1px solid #e3ebf5; border-radius:12px; padding:10px 16px; display:flex; flex-direction:column; min-width:120px; }
.an-regua .k b { font-size:22px; color:#0a1628; line-height:1.1; }
.an-regua .k span { font-size:11.5px; color:#6080a0; }
.an-setor { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:14px 16px; margin-bottom:12px; }
.an-setor-cab { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.an-setor-cab h2 { margin:0; font-size:14.5px; color:#0a1628; }
.an-setor-cab .conta { font-size:12px; color:#6080a0; }
.an-setor-fio { height:2px; background:var(--cor,#c5d5e8); border-radius:2px; margin:10px 0 12px; opacity:.6; }
.an-gente { display:flex; gap:14px; flex-wrap:wrap; align-items:flex-start; }
.an-grupo { display:flex; flex-direction:column; gap:8px; }
.an-subs { display:flex; gap:8px; flex-wrap:wrap; padding-left:16px; border-left:2px dashed #dbe6f3; margin-left:16px; }
.an-p { width:250px; border:1px solid #e3ebf5; border-radius:11px; padding:10px 12px; background:#fbfdff; cursor:pointer; text-align:left; font:inherit; color:inherit; position:relative; }
.an-p:hover { border-color:#3070c8; }
.an-p.chefe { background:#fff; border-color:var(--cor,#c5d5e8); }
.an-p.fora { opacity:.6; }
.an-p .av-linha { display:flex; align-items:center; gap:10px; }
.an-p .av { width:38px; height:38px; border-radius:50%; background:var(--cor,#3A6491); color:#fff; display:grid; place-items:center; font-weight:700; font-size:13px; position:relative; flex:none; }
.an-p .av.humano { background:#0a1628; }
.an-p .av.vivo { box-shadow:0 0 0 3px #fff, 0 0 0 5px #27a96c; }
.an-p .av .luz { position:absolute; top:-4px; right:-6px; background:#e8b84b; color:#2a1f05; font-size:10px; font-weight:700; border-radius:9px; padding:0 5px; min-width:16px; text-align:center; }
.an-p .nome { font-size:13.5px; font-weight:700; color:#0a1628; }
.an-p .cargo { font-size:11.5px; color:#6080a0; }
.an-p .faz { font-size:12px; color:#26374a; line-height:1.45; margin-top:8px; }
.an-p .selos { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.an-p .selo { font-size:10px; font-weight:700; letter-spacing:0; padding:2px 7px; border-radius:6px; background:#eef3f9; color:#26374a; }
.an-p .selo.ia { background:#fdf6e3; color:#8a6410; } .an-p .selo.node { background:#e6f9f0; color:#1a7a50; } .an-p .selo.fora { background:#fbeaea; color:#a02020; } .an-p .selo.vivo { background:#e6f9f0; color:#1a7a50; }
.an-p .responde { font-size:11px; color:#6080a0; margin-top:6px; font-style:italic; }
.an-ficha-fundo { position:fixed; inset:0; background:rgba(10,22,40,.45); z-index:1200; display:grid; place-items:center; padding:20px; }
.an-ficha-caixa { background:#fff; border-radius:14px; max-width:560px; width:100%; padding:20px 22px; box-shadow:0 18px 48px rgba(10,22,40,.20); max-height:90vh; overflow:auto; }
.an-ficha-caixa h3 { margin:0; font-size:18px; color:#0a1628; }
.an-ficha-caixa .cargo2 { color:#6080a0; font-size:12.5px; margin-bottom:12px; }
.an-ficha-caixa dl { display:grid; grid-template-columns:120px 1fr; gap:6px 12px; font-size:13px; margin:0; }
.an-ficha-caixa dt { color:#6080a0; } .an-ficha-caixa dd { margin:0; color:#0a1628; line-height:1.5; }
.an-ficha-caixa code { font-size:12px; background:#eef3f9; border-radius:4px; padding:1px 6px; margin-right:4px; }
.an-ficha-caixa .nota { margin-top:12px; font-size:12.5px; color:#6b5310; background:#fdf6e3; border:1px solid #ecdfb4; border-radius:8px; padding:8px 11px; }

/* ── alçadas ──────────────────────────────────────────────────────────── */
.an-ped { border:1px solid #e8b84b; background:#fdf6e3; border-radius:11px; padding:12px 14px; margin-bottom:10px; }
.an-ped h3 { margin:0; font-size:14.5px; color:#0a1628; }
.an-ped .motivo { font-size:13px; color:#26374a; margin:6px 0; line-height:1.5; white-space:pre-wrap; max-height:160px; overflow:auto; }
.an-ped .detalhe { font-size:12px; color:#6080a0; line-height:1.5; max-height:120px; overflow:auto; }
.an-ped .pe { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px; }
.an-ped .quando { margin-left:auto; font-size:11.5px; color:#6080a0; }
.an-niveis { display:inline-flex; border:1px solid #c5d5e8; border-radius:8px; overflow:hidden; }
.an-niveis button { font:inherit; font-size:11.5px; font-weight:700; color:#6080a0; background:#fff; border:none; border-right:1px solid #e3ebf5; padding:5px 10px; cursor:pointer; }
.an-niveis button:last-child { border-right:none; }
.an-niveis button.on { background:#1e4080; color:#fff; }
.an-niveis button.on.livre { background:#27a96c; } .an-niveis button.on.proibido { background:#d64545; }
.an-extrato div { display:flex; gap:10px; font-size:12.5px; padding:6px 0; border-bottom:1px solid #eef3f9; }
.an-extrato div i { color:#8ba3c0; font-style:normal; white-space:nowrap; min-width:70px; }
.an-extrato div.falhou span { color:#a02020; }

/* ── modais pequenos ──────────────────────────────────────────────────── */
.an-modal { position:fixed; inset:0; background:rgba(10,22,40,.45); z-index:1200; display:grid; place-items:center; padding:20px; }
.an-modal-caixa { background:#fff; border-radius:14px; max-width:520px; width:100%; padding:18px 20px; box-shadow:0 18px 48px rgba(10,22,40,.20); }
.an-modal-caixa h3 { margin:0 0 10px; font-size:16px; color:#0a1628; }
.an-modal-bts { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
    `}</style>
  )
}

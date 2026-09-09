// ============================================================================
//  A PELE DAS TELAS DA ANÁLISE DE CRÉDITO  ·  um bloco de CSS, prefixo `an-`
//
//  Fica num componente, e não no `globals.css`, por um motivo medido mais de
//  uma vez: classe nova no globals.css não chega ao navegador com o dev server
//  de pé (é preciso derrubar, apagar .next e subir de novo), e isso já custou
//  horas. Um `<style>` dentro da árvore chega na hora.
//
//  As cores são as fichas do CRM (`:root` do globals.css): azul 1e4080,
//  dourado e8b84b, verde 27a96c, vermelho d64545, cinza 6080a0. O DESENHO é o
//  do cockpit do Sistema de Análise, tela a tela; só a pele é a da casa.
// ============================================================================

export default function EstiloAnalises() {
  return (
    <style>{`
/* ── a moldura ─────────────────────────────────────────────────────────── */
.an-topo { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:12px 18px; }
.an-marca { display:flex; flex-direction:column; min-width:0; }
.an-marca-tit { font-size:17px; font-weight:700; color:#0a1628; letter-spacing:-.2px; line-height:1.1; }
.an-marca-sub { font-size:11.5px; color:#6080a0; margin-top:3px; font-variant-numeric:tabular-nums; }
.an-abas { display:flex; align-items:center; gap:4px; margin-left:auto; flex-wrap:wrap; }
.an-aba { font:inherit; font-size:13.5px; font-weight:700; color:#6080a0; background:none; border:1px solid transparent;
  border-radius:9px; padding:7px 13px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
.an-aba:hover { background:#f2f7fd; color:#1e4080; }
.an-aba.on { background:#fff; color:#1e4080; border-color:#c5d5e8; box-shadow:0 1px 2px rgba(16,32,64,.06); }
.an-aba i { font-style:normal; font-size:11px; font-weight:700; background:#e8f0fa; color:#1a3560; border-radius:10px; padding:1px 7px; min-width:20px; text-align:center; }
.an-aba i.quente { background:#e8b84b; color:#2a1f05; }
.an-links { display:flex; align-items:center; gap:2px; flex-wrap:wrap; }
.an-lk { font:inherit; font-size:12.5px; font-weight:600; color:#3070c8; background:none; border:none; padding:6px 9px; border-radius:7px; cursor:pointer; text-decoration:none; white-space:nowrap; }
.an-lk:hover { background:#eef5fd; }
.an-lk.on { background:#eef5fd; color:#1e4080; }
.an-lk.ouro { color:#8a6410; }
.an-lk.ouro:hover { background:#fdf6e3; }
.an-pulso { width:8px; height:8px; border-radius:50%; background:#27a96c; display:inline-block; flex:none; box-shadow:0 0 0 0 rgba(39,169,108,.5); animation:anPulso 2s ease-out infinite; }
.an-pulso.off { background:#c5d5e8; animation:none; }
@keyframes anPulso { 0%{box-shadow:0 0 0 0 rgba(39,169,108,.5)} 70%{box-shadow:0 0 0 8px rgba(39,169,108,0)} 100%{box-shadow:0 0 0 0 rgba(39,169,108,0)} }
@media (prefers-reduced-motion: reduce){ .an-pulso{animation:none} }

/* ── a faixa de comando (os cinco números) ────────────────────────────── */
.an-faixa { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:12px; margin:14px 0; }
.an-kpi { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:13px 16px; min-width:0; text-align:left;
  font:inherit; cursor:default; box-shadow:0 1px 2px rgba(16,32,64,.04); }
.an-kpi.vai { cursor:pointer; }
.an-kpi.vai:hover { border-color:#3070c8; }
.an-kpi .r { font-size:10.5px; font-weight:700; color:#6080a0; text-transform:uppercase; letter-spacing:.7px; }
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
.an-barra { height:6px; background:#e6edf6; border-radius:3px; overflow:hidden; margin-top:8px; }
.an-barra i { display:block; height:100%; background:#1e4080; transition:width .4s; }
.an-barra i.ruim { background:#d64545; }

/* ── a barra da mesa ──────────────────────────────────────────────────── */
.an-mesabar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
.an-seg { display:inline-flex; background:#fff; border:1px solid #c5d5e8; border-radius:9px; overflow:hidden; }
.an-seg button { font:inherit; font-size:13px; font-weight:700; color:#6080a0; background:none; border:none; padding:8px 14px; cursor:pointer; border-right:1px solid #e3ebf5; }
.an-seg button:last-child { border-right:none; }
.an-seg button.on { background:#e8f0fa; color:#1e4080; }
.an-busca { flex:1 1 220px; min-width:0; max-width:380px; font:inherit; font-size:13.5px; padding:8px 12px; border:1px solid #c5d5e8; border-radius:9px; background:#fff; }
.an-varr { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:12px; color:#6080a0; }
.an-bt { font:inherit; font-size:13px; font-weight:700; padding:8px 14px; border-radius:9px; border:1px solid #c5d5e8; background:#fff; color:#1a2a3a; cursor:pointer; white-space:nowrap; }
.an-bt:hover:not(:disabled) { border-color:#3070c8; color:#1e4080; }
.an-bt:disabled { opacity:.55; cursor:default; }
.an-bt.ouro { background:linear-gradient(135deg,#e8b84b,#d9a72f); border-color:#d9a72f; color:#2a1f05; }
.an-bt.ouro:hover:not(:disabled) { color:#2a1f05; border-color:#b8851f; }
.an-bt.azul { background:#1e4080; border-color:#1e4080; color:#fff; }
.an-bt.azul:hover:not(:disabled) { background:#2a55a0; color:#fff; }
.an-bt.contorno { border-color:#1e4080; color:#1e4080; }
.an-bt.forcar { border-color:#e0a0a0; color:#a02020; }
.an-bt.forcar:hover:not(:disabled) { background:#fbeaea; color:#a02020; }
.an-bt.mini { font-size:12px; padding:5px 10px; border-radius:7px; }
.an-bt.grande { padding:11px 20px; font-size:14px; }

/* ── o kanban ─────────────────────────────────────────────────────────── */
.an-kb { display:grid; grid-template-columns:repeat(5, minmax(210px,1fr)); gap:12px; overflow-x:auto; padding-bottom:6px; align-items:start; }
.an-col { background:#eaf0f8; border:1px solid #dbe6f3; border-radius:13px; padding:10px; min-height:140px; }
.an-col-cab { display:flex; align-items:center; gap:8px; padding:2px 4px 10px; }
.an-col-cab b { font-size:13px; color:#0a1628; }
.an-col-cab i { font-style:normal; font-size:11.5px; font-weight:700; color:#1a3560; background:#fff; border-radius:10px; padding:1px 8px; }
.an-col-cab .pt { width:8px; height:8px; border-radius:50%; flex:none; }
.an-col-cab small { margin-left:auto; color:#8ba3c0; font-size:11px; }
.an-col-vazia { color:#8ba3c0; font-size:12px; text-align:center; padding:18px 6px; }

.an-ficha { background:#fff; border:1px solid #e3ebf5; border-left:4px solid var(--cor,#4a90d0); border-radius:11px; padding:11px 12px; margin-bottom:9px;
  cursor:pointer; text-align:left; width:100%; font:inherit; color:inherit; display:block; transition:.12s; }
.an-ficha:hover { border-color:#3070c8; border-left-color:var(--cor,#4a90d0); box-shadow:0 6px 18px -12px rgba(16,32,64,.4); }
.an-ficha:focus-visible { outline:2px solid #3070c8; outline-offset:2px; }
.an-fi-cab { display:flex; align-items:flex-start; gap:9px; }
.an-selo { width:34px; height:34px; border-radius:9px; flex:none; display:grid; place-items:center; color:#fff; font-weight:700; font-size:12.5px; letter-spacing:.3px; background:var(--cor,#2E6DB4); }
.an-selo.gr { width:52px; height:52px; border-radius:13px; font-size:18px; }
.an-fi-nome { min-width:0; }
.an-fi-nome b { display:block; font-size:13.5px; color:#0a1628; line-height:1.25; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.an-fi-nome small { display:block; font-size:11.5px; color:#6080a0; margin-top:2px; font-variant-numeric:tabular-nums; }
.an-med { margin-top:9px; }
.an-med-barra { height:5px; background:#e6edf6; border-radius:3px; overflow:hidden; }
.an-med-barra span { display:block; height:100%; background:#3070c8; }
.an-med-barra span.cheia { background:#27a96c; }
.an-med-barra span.trava { background:#d64545; }
.an-med-txt { font-size:11.5px; color:#6080a0; margin-top:4px; display:block; }
.an-med-txt.ok { color:#1a7a50; }
.an-chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.an-chip { font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:6px; background:#eef3f9; color:#1a3560; }
.an-chip.falta { background:#fbeaea; color:#a02020; }
.an-chip.duvida { background:#fdf8e6; color:#907010; }
.an-chip.ok { background:#e6f9f0; color:#1a7a50; }
.an-chip.erro { background:#fbeaea; color:#a02020; }
.an-chip.varr { background:#fdf6e3; color:#8a6410; }
.an-chip.fase { background:transparent; border:1px solid var(--cor,#3070c8); color:var(--cor,#3070c8); }
.an-fi-ult { font-size:11.5px; color:#22344d; margin-top:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.an-fi-pe { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:11.5px; color:#6080a0; flex-wrap:wrap; }
.an-fi-pe .idade.estourou { color:#d64545; font-weight:700; }
.an-fi-pe .ordem { color:#8a6410; font-weight:700; }
.an-fi-pe .enc { display:inline-flex; align-items:center; gap:5px; }
.an-av { width:20px; height:20px; border-radius:50%; display:inline-grid; place-items:center; color:#fff; font-size:9.5px; font-weight:700; background:var(--cor,#2E6DB4); flex:none; }

/* ── a galeria ────────────────────────────────────────────────────────── */
.an-gl { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:12px; }
.an-gl-card { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:14px 15px; cursor:pointer; text-align:left; font:inherit; color:inherit; transition:.12s; }
.an-gl-card:hover { border-color:#3070c8; box-shadow:0 8px 22px -14px rgba(16,32,64,.4); }
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
.an-tab th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.6px; color:#6080a0; padding:10px 12px; border-bottom:1px solid #e3ebf5; background:#f7fafd; white-space:nowrap; }
.an-tab td { padding:10px 12px; border-bottom:1px solid #f2f6fb; vertical-align:middle; }
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
.an-tag { font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:8px; background:#eef3f9; color:#1a3560; }
.an-tag.banco { background:#e6f0fb; color:#1a55a0; }
.an-tag.voce { background:#fdf8e6; color:#907010; }
.an-tag.rodando { background:#f0eafa; color:#6030a0; }
.an-tag.pronta { background:#e6f9f0; color:#1a7a50; }
.an-tag.ruim { background:#fbeaea; color:#a02020; }
.an-tag.sub { background:#fdf6e3; color:#8a6410; }
.an-card-abas { display:flex; gap:2px; border-bottom:1px solid #c5d5e8; margin:0 18px; overflow-x:auto; }
.an-card-aba { font:inherit; font-size:13.5px; font-weight:700; color:#6080a0; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-1px;
  padding:9px 13px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
.an-card-aba:hover { color:#1e4080; }
.an-card-aba.on { color:#1e4080; border-bottom-color:#e8b84b; }
.an-card-aba i { font-style:normal; font-size:10.5px; font-weight:700; background:#e8f0fa; color:#1a3560; border-radius:9px; padding:1px 6px; }
.an-card-aba b.ponto { width:7px; height:7px; border-radius:50%; background:#e8b84b; display:inline-block; }
.an-card-corpo { padding:16px 18px 22px; }
.an-duas { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:14px; align-items:start; }
@media (max-width:980px){ .an-duas { grid-template-columns:1fr; } .an-kb { grid-template-columns:repeat(5, 230px); } }

.an-bloco { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:14px 16px 16px; margin-bottom:14px; }
.an-bloco h4 { margin:0 0 10px; font-size:10.5px; font-weight:700; color:#6080a0; text-transform:uppercase; letter-spacing:.9px; display:flex; align-items:center; gap:8px; }
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
.an-aviso { display:flex; gap:9px; align-items:flex-start; border-radius:9px; padding:9px 12px; font-size:12.5px; line-height:1.5; margin:8px 0; background:#f7fafd; border:1px solid #dbe6f3; color:#22344d; }
.an-aviso.erro { background:#fbeaea; border-color:#f5b8b8; color:#a02020; }
.an-aviso.aviso { background:#fdf8e6; border-color:#ecdfb4; color:#8a6410; }
.an-aviso.bom { background:#e6f9f0; border-color:#a7e9c8; color:#1a7a50; }
.an-fam { display:flex; align-items:center; gap:10px; padding:9px 12px; border:1px solid #e3ebf5; border-radius:9px; margin-bottom:7px; background:#fbfdff; }
.an-fam b { font-size:13px; color:#0a1628; }
.an-fam .n { font-size:12px; color:#6080a0; }
.an-fam .anos { margin-left:auto; font-size:11.5px; color:#1e4080; font-weight:700; }
.an-fam .est { margin-left:auto; font-size:11px; font-weight:700; }
.an-fam .est.ok { color:#1a7a50; } .an-fam .est.falta { color:#a02020; } .an-fam .est.duvida { color:#907010; } .an-fam .est.a_caminho { color:#3070c8; } .an-fam .est.dispensado { color:#6080a0; }
.an-dica { font-size:11.5px; color:#8ba3c0; line-height:1.5; margin-top:8px; }

/* ── as notas ─────────────────────────────────────────────────────────── */
.an-nt-barra { display:flex; align-items:center; gap:2px; flex-wrap:wrap; border:1px solid #c5d5e8; border-bottom:none; border-radius:9px 9px 0 0; padding:5px 8px; background:#f7fafd; }
.an-nt-barra button { font:inherit; font-size:13px; font-weight:700; width:30px; height:28px; border-radius:6px; border:none; background:none; color:#1a3560; cursor:pointer; }
.an-nt-barra button:hover { background:#e8f0fa; }
.an-nt-barra .sep { width:1px; height:18px; background:#dbe6f3; margin:0 4px; }
.an-nt-titulo { width:100%; font:inherit; font-size:14px; font-weight:700; padding:9px 12px; border:1px solid #c5d5e8; border-top:none; border-bottom:1px solid #e3ebf5; background:#fff; outline:none; }
.an-nt-editor { min-height:130px; max-height:420px; overflow:auto; padding:11px 13px; border:1px solid #c5d5e8; border-top:none; border-radius:0 0 9px 9px; background:#fff; font-size:14px; line-height:1.55; outline:none; }
.an-nt-editor:empty::before { content:attr(data-vazio); color:#8ba3c0; }
.an-nt-editor img { max-width:100%; height:auto; border-radius:6px; }
.an-nt-editor mark { background:#fdf0b8; }
.an-nt-editor [data-tarefa]::before { content:'☐ '; color:#3070c8; }
.an-nt-editor [data-tarefa="feita"]::before { content:'☑ '; color:#1a7a50; }
.an-nt-editor.cheia { position:fixed; inset:60px 24px 24px; z-index:1300; max-height:none; border-radius:12px; border:1px solid #c5d5e8; box-shadow:0 30px 80px rgba(10,22,40,.35); font-size:16px; }
.an-nt-pe { display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap; }
.an-nt-pe small { color:#8ba3c0; font-size:11.5px; margin-left:auto; }
.an-nota { border:1px solid #e3ebf5; border-radius:10px; padding:10px 13px; margin-top:9px; background:#fffdf7; font-size:13.5px; line-height:1.55; }
.an-nota.fixada { border-color:#ecdfb4; background:#fdf9ec; }
.an-nota .tit { font-weight:700; color:#0a1628; display:flex; align-items:center; gap:8px; }
.an-nota .tit .q { margin-left:auto; font-weight:500; font-size:11px; color:#8ba3c0; white-space:nowrap; }
.an-nota .corpo { margin-top:5px; color:#22344d; overflow-wrap:anywhere; }
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
.an-lote button:hover { background:#eef5fd; }
.an-familias { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.an-familia { font-size:11.5px; font-weight:600; color:#22344d; display:inline-flex; align-items:center; gap:6px; background:#f7fafd; border:1px solid #e3ebf5; border-radius:7px; padding:3px 9px; }
.an-bola { width:8px; height:8px; border-radius:50%; background:var(--cor,#7A7A7A); display:inline-block; }
.an-arqs { list-style:none; margin:0; padding:0; }
.an-arq { display:flex; align-items:flex-start; gap:10px; padding:8px 4px; border-bottom:1px solid #f2f6fb; }
.an-arq:last-child { border-bottom:none; }
.an-arq.fora { opacity:.6; }
.an-arq input { margin-top:3px; width:16px; height:16px; flex:none; cursor:pointer; }
.an-arq .caixa { width:16px; height:16px; flex:none; text-align:center; font-size:12px; color:#1a7a50; margin-top:2px; }
.an-arq-meio { min-width:0; flex:1; }
.an-arq-nome { font-size:13.5px; color:#0a1628; font-weight:600; overflow-wrap:anywhere; }
.an-arq-sub { display:flex; flex-wrap:wrap; gap:4px 8px; font-size:11.5px; color:#6080a0; margin-top:2px; align-items:center; }
.an-classe { display:inline-flex; align-items:center; gap:5px; font-weight:700; color:var(--cor,#6080a0); }
.an-certeza { font-weight:700; color:#907010; }
.an-certeza.nao-lido { color:#a02020; }
.an-atende { color:#1a7a50; font-weight:700; }
.an-arq-leitura { display:block; margin-top:5px; font-size:12.5px; color:#22344d; line-height:1.5; }
.an-arq-leitura b { color:#0a1628; }
.an-achado { display:inline-block; font-size:11px; background:#eef3f9; color:#1a3560; border-radius:5px; padding:1px 7px; margin:3px 4px 0 0; }
.an-fonte { display:flex; gap:9px; align-items:flex-start; font-size:12.5px; color:#22344d; line-height:1.5; background:#f7fafd; border:1px solid #dbe6f3; border-radius:9px; padding:9px 12px; margin-bottom:10px; }
.an-emp-fichas { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px,1fr)); gap:8px 16px; margin-bottom:10px; }
.an-emp-fichas div { font-size:13px; color:#0a1628; border-bottom:1px solid #eef3f9; padding:5px 0; }
.an-emp-fichas span { display:block; font-size:10.5px; color:#6080a0; text-transform:uppercase; letter-spacing:.6px; font-weight:700; }
.an-cp-tab { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:8px; }
.an-cp-tab th { text-align:left; background:#f7fafd; color:#6080a0; font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; padding:6px 8px; border-bottom:1px solid #e3ebf5; }
.an-cp-tab td { padding:6px 8px; border-bottom:1px solid #f2f6fb; font-variant-numeric:tabular-nums; }

/* ── a aba análise ────────────────────────────────────────────────────── */
.an-campo { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
.an-campo label { font-size:10.5px; font-weight:700; color:#6080a0; text-transform:uppercase; letter-spacing:.6px; }
.an-campo select, .an-campo input[type=text], .an-campo input[type=date], .an-campo textarea { font:inherit; font-size:13.5px; padding:8px 11px; border:1px solid #c5d5e8; border-radius:8px; background:#fbfdff; color:#1a2a3a; }
.an-campo textarea { min-height:72px; resize:vertical; line-height:1.5; }
.an-campo select:focus, .an-campo textarea:focus, .an-campo input:focus { outline:none; border-color:#3070c8; background:#fff; }
.an-bt-linha { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:6px; }
.an-bt-nota { font-size:12px; color:#6080a0; line-height:1.45; flex:1 1 220px; }
.an-resumo { font-size:13.5px; color:#22344d; line-height:1.55; margin-bottom:10px; }
.an-resumo ul { margin:4px 0 0; padding-left:18px; color:#6080a0; font-size:12.5px; }
.an-pensando { display:flex; align-items:center; gap:9px; font-size:13px; color:#6080a0; }
.an-girando { width:14px; height:14px; border:2px solid #dbe6f3; border-top-color:#1e4080; border-radius:50%; animation:anGira 1s linear infinite; flex:none; }
@keyframes anGira { to { transform:rotate(360deg) } }
.an-ordem { background:#fdf6e3; border:1px solid #e8d9a8; color:#6b5310; border-radius:9px; padding:9px 12px; font-size:12.5px; line-height:1.5; margin:8px 0; }
.an-pedido { border:1px solid #e8b84b; background:#fdf9ec; border-radius:11px; padding:13px 15px; margin-bottom:12px; }
.an-pedido .cab { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.7px; color:#8a6410; margin-bottom:6px; }
.an-pedido .mot { font-size:14px; font-weight:600; color:#0a1628; line-height:1.5; white-space:pre-wrap; }
.an-pedido .raz { font-size:12.5px; color:#6080a0; border-left:2px solid #dbe6f3; padding-left:10px; margin-top:8px; white-space:pre-wrap; line-height:1.5; max-height:170px; overflow:auto; }

/* ── a IA do card ─────────────────────────────────────────────────────── */
.an-ia-onde { font-size:12.5px; color:#6080a0; line-height:1.55; background:#f7fafd; border:1px dashed #c5d5e8; border-radius:9px; padding:9px 12px; margin-bottom:12px; }
.an-ia-onde b { color:#1a3560; }
.an-fio { display:flex; flex-direction:column; gap:10px; max-height:520px; overflow:auto; padding:2px; }
.an-balao { max-width:92%; border-radius:12px; padding:10px 13px; font-size:13.5px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
.an-balao.eu { align-self:flex-end; background:#e8f0fa; color:#0a1628; border-bottom-right-radius:3px; }
.an-balao.ia { align-self:flex-start; background:#f7fafd; border:1px solid #e3ebf5; color:#1a2a3a; border-bottom-left-radius:3px; }
.an-balao.ruim { align-self:flex-start; background:#fbeaea; color:#a02020; }
.an-balao .q { display:block; font-size:10.5px; color:#8ba3c0; margin-top:5px; white-space:nowrap; }
.an-atalhos { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
.an-atalho { font:inherit; font-size:12.5px; color:#1a3560; background:#fbfdff; border:1px solid #dbe6f3; border-radius:8px; padding:7px 11px; cursor:pointer; text-align:left; }
.an-atalho:hover { border-color:#3070c8; }
.an-perguntar { display:flex; gap:8px; margin-top:10px; align-items:flex-end; }
.an-perguntar textarea { flex:1; min-width:0; font:inherit; font-size:14px; min-height:44px; max-height:140px; padding:9px 11px; border:1px solid #c5d5e8; border-radius:9px; background:#fff; resize:vertical; }

/* ── encaminhar ───────────────────────────────────────────────────────── */
.an-destinos { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:10px; }
.an-destino { font:inherit; font-size:12.5px; font-weight:600; color:#1a2a3a; background:#fff; border:1px solid #dbe6f3; border-radius:9px; padding:6px 10px 6px 6px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; }
.an-destino:hover { border-color:#3070c8; }
.an-destino.viva { border-color:#1e4080; background:#e8f0fa; color:#1e4080; }
.an-destino .area { color:#6080a0; font-weight:500; font-size:11.5px; }
.an-enc { border:1px solid #e3ebf5; border-radius:10px; padding:10px 13px; margin-bottom:8px; background:#fff; }
.an-enc.aberto { border-left:4px solid #e8b84b; } .an-enc.respondido { border-left:4px solid #27a96c; } .an-enc.fechado { opacity:.7; border-left:4px solid #c5d5e8; }
.an-enc-cab { display:flex; align-items:center; gap:9px; flex-wrap:wrap; font-size:12.5px; }
.an-enc-cab .quem { font-weight:700; color:#0a1628; }
.an-enc-cab .est { font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.5px; }
.an-enc-cab .dias { margin-left:auto; color:#6080a0; font-size:11.5px; }
.an-enc-cab .dias.atrasado { color:#d64545; font-weight:700; }
.an-enc-ped { font-size:13.5px; color:#22344d; margin-top:6px; line-height:1.5; white-space:pre-wrap; }
.an-enc-resp { font-size:13px; color:#1a7a50; margin-top:6px; line-height:1.5; }
.an-enc-bts { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
.an-quem-tem { display:flex; flex-wrap:wrap; gap:10px; }
.an-quem { display:flex; align-items:center; gap:9px; border:1px solid #e3ebf5; border-radius:10px; padding:8px 12px; background:#fbfdff; }
.an-quem.atrasado { border-color:#f5b8b8; }
.an-quem b { font-size:16px; color:#0a1628; }
.an-quem small { display:block; font-size:11.5px; color:#6080a0; }

/* ── atividades ───────────────────────────────────────────────────────── */
.an-ativ { list-style:none; margin:0; padding:0; }
.an-ativ li { display:grid; grid-template-columns:14px 1fr; gap:10px; padding:8px 0; border-bottom:1px solid #f2f6fb; align-items:start; }
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
.an-rc-item { display:flex; gap:10px; padding:10px 14px; border-bottom:1px solid #f2f6fb; cursor:pointer; width:100%; text-align:left; font:inherit; background:none; border-left:3px solid transparent; border-right:none; border-top:none; }
.an-rc-item:hover { background:#fbfdff; }
.an-rc-item.on { background:#eef5fd; border-left-color:#1e4080; }
.an-rc-item .meio { min-width:0; flex:1; }
.an-rc-item .de { font-size:11.5px; color:#6080a0; display:flex; gap:6px; align-items:center; }
.an-rc-item .de .q { margin-left:auto; white-space:nowrap; }
.an-rc-item .tit { font-size:13.5px; color:#0a1628; font-weight:700; margin-top:2px; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.an-rc-item.lido .tit { font-weight:600; color:#22344d; }
.an-rc-item .prev { font-size:12px; color:#6080a0; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.an-rc-item .nl { width:8px; height:8px; border-radius:50%; background:#e8b84b; flex:none; margin-top:6px; }
.an-rc-leitura { padding:16px 20px; overflow:auto; flex:1; min-height:0; }
.an-rc-leitura h3 { margin:0; font-size:17px; color:#0a1628; line-height:1.3; }
.an-rc-de { display:flex; align-items:center; gap:10px; margin:10px 0 14px; font-size:12.5px; color:#6080a0; }
.an-rc-de .nm { font-weight:700; color:#0a1628; }
.an-rc-corpo { font-size:14px; line-height:1.65; color:#1a2a3a; white-space:pre-wrap; overflow-wrap:anywhere; }
.an-rc-corpo h4 { font-size:11px; text-transform:uppercase; letter-spacing:.8px; color:#6080a0; margin:16px 0 6px; }
.an-rc-acoes3 { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:10px; margin:8px 0 12px; }
.an-rc-acoes3 .a { border:1px solid #e3ebf5; border-radius:10px; padding:10px 12px; background:#fbfdff; font-size:13px; }
.an-rc-acoes3 .a b { display:block; color:#0a1628; margin-bottom:3px; }
.an-rc-acoes3 .a small { color:#6080a0; line-height:1.45; white-space:normal; }
.an-rc-bts { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
.an-rc-licao { margin-top:14px; font-size:13px; background:#fdf9ec; border:1px solid #ecdfb4; border-radius:9px; padding:9px 12px; color:#6b4d0a; }
.an-rc-nada { color:#8ba3c0; font-size:13px; padding:20px 14px; line-height:1.55; }

/* ── gestão e sala ────────────────────────────────────────────────────── */
.an-tiles { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:14px; }
@media (max-width:900px){ .an-tiles { grid-template-columns:repeat(2, minmax(0,1fr)); } }
.an-tile { background:#fff; border:1px solid #e3ebf5; border-radius:13px; padding:12px 16px; min-width:0; }
.an-tile .r { font-size:10.5px; font-weight:700; color:#6080a0; text-transform:uppercase; letter-spacing:.7px; }
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
.an-hb .rot { color:#22344d; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
.an-tele .r { font-size:10px; color:#6080a0; text-transform:uppercase; letter-spacing:.5px; }
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
.an-p .av { width:38px; height:38px; border-radius:50%; background:var(--cor,#2E6DB4); color:#fff; display:grid; place-items:center; font-weight:700; font-size:13px; position:relative; flex:none; }
.an-p .av.humano { background:#0a1628; }
.an-p .av.vivo { box-shadow:0 0 0 3px #fff, 0 0 0 5px #27a96c; }
.an-p .av .luz { position:absolute; top:-4px; right:-6px; background:#e8b84b; color:#2a1f05; font-size:10px; font-weight:700; border-radius:9px; padding:0 5px; min-width:16px; text-align:center; }
.an-p .nome { font-size:13.5px; font-weight:700; color:#0a1628; }
.an-p .cargo { font-size:11.5px; color:#6080a0; }
.an-p .faz { font-size:12px; color:#22344d; line-height:1.45; margin-top:8px; }
.an-p .selos { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.an-p .selo { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; padding:2px 7px; border-radius:6px; background:#eef3f9; color:#1a3560; }
.an-p .selo.ia { background:#f0eafa; color:#6030a0; } .an-p .selo.node { background:#e6f9f0; color:#1a7a50; } .an-p .selo.fora { background:#fbeaea; color:#a02020; } .an-p .selo.vivo { background:#e6f9f0; color:#1a7a50; }
.an-p .responde { font-size:11px; color:#6080a0; margin-top:6px; font-style:italic; }
.an-ficha-fundo { position:fixed; inset:0; background:rgba(10,22,40,.45); z-index:1200; display:grid; place-items:center; padding:20px; }
.an-ficha-caixa { background:#fff; border-radius:14px; max-width:560px; width:100%; padding:20px 22px; box-shadow:0 30px 80px rgba(10,22,40,.4); max-height:90vh; overflow:auto; }
.an-ficha-caixa h3 { margin:0; font-size:18px; color:#0a1628; }
.an-ficha-caixa .cargo2 { color:#6080a0; font-size:12.5px; margin-bottom:12px; }
.an-ficha-caixa dl { display:grid; grid-template-columns:120px 1fr; gap:6px 12px; font-size:13px; margin:0; }
.an-ficha-caixa dt { color:#6080a0; } .an-ficha-caixa dd { margin:0; color:#0a1628; line-height:1.5; }
.an-ficha-caixa code { font-size:12px; background:#eef3f9; border-radius:4px; padding:1px 6px; margin-right:4px; }
.an-ficha-caixa .nota { margin-top:12px; font-size:12.5px; color:#6b4d0a; background:#fdf9ec; border:1px solid #ecdfb4; border-radius:8px; padding:8px 11px; }

/* ── alçadas ──────────────────────────────────────────────────────────── */
.an-ped { border:1px solid #e8b84b; background:#fdf9ec; border-radius:11px; padding:12px 14px; margin-bottom:10px; }
.an-ped h3 { margin:0; font-size:14.5px; color:#0a1628; }
.an-ped .motivo { font-size:13px; color:#22344d; margin:6px 0; line-height:1.5; white-space:pre-wrap; max-height:160px; overflow:auto; }
.an-ped .detalhe { font-size:12px; color:#6080a0; line-height:1.5; max-height:120px; overflow:auto; }
.an-ped .pe { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px; }
.an-ped .quando { margin-left:auto; font-size:11.5px; color:#6080a0; }
.an-niveis { display:inline-flex; border:1px solid #c5d5e8; border-radius:8px; overflow:hidden; }
.an-niveis button { font:inherit; font-size:11.5px; font-weight:700; color:#6080a0; background:#fff; border:none; border-right:1px solid #e3ebf5; padding:5px 10px; cursor:pointer; }
.an-niveis button:last-child { border-right:none; }
.an-niveis button.on { background:#1e4080; color:#fff; }
.an-niveis button.on.livre { background:#27a96c; } .an-niveis button.on.proibido { background:#d64545; }
.an-extrato div { display:flex; gap:10px; font-size:12.5px; padding:6px 0; border-bottom:1px solid #f2f6fb; }
.an-extrato div i { color:#8ba3c0; font-style:normal; white-space:nowrap; min-width:70px; }
.an-extrato div.falhou span { color:#a02020; }

/* ── modais pequenos ──────────────────────────────────────────────────── */
.an-modal { position:fixed; inset:0; background:rgba(10,22,40,.45); z-index:1200; display:grid; place-items:center; padding:20px; }
.an-modal-caixa { background:#fff; border-radius:14px; max-width:520px; width:100%; padding:18px 20px; box-shadow:0 30px 80px rgba(10,22,40,.4); }
.an-modal-caixa h3 { margin:0 0 10px; font-size:16px; color:#0a1628; }
.an-modal-bts { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
    `}</style>
  )
}

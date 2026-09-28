// ============================================================================
//  A ANÁLISE COMPLEMENTAR EM PDF  ·  28/09/2026
//
//  Pedido dele: "insira um botão de exportar a análise complementar em PDF,
//  um PDF bonito". O fluxo com a Subscrição ainda é por e-mail, então a leitura
//  dos documentos novos precisa sair da tela como documento.
//
//  É um HTML estático em A4, impresso pelo navegador ("Salvar como PDF"). As
//  contas são as MESMAS da tela (lib/analise/complemento.ts): o PDF não calcula
//  nada por conta própria, para não haver dois números para a mesma coisa.
// ============================================================================

import { cor } from '@/lib/ui/painel'
import type { FichaAnalise } from '@/lib/analise/ficha'
import {
  CONTAS, NOME_CONTA, FLUXO, NOME_VEREDITO, NOME_ACAO,
  linhaDoTempo, comparavel, variacao, indices, comparacaoPrincipal,
  type Complemento, type Veredito, type Indices,
} from '@/lib/analise/complemento'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function reais(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '·'
  const a = Math.abs(v)
  const f = (n: number, s: string) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${s}`
  if (a >= 1e9) return f(v / 1e9, 'bi')
  if (a >= 1e6) return f(v / 1e6, 'mi')
  if (a >= 1e3) return f(v / 1e3, 'mil')
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
const pct = (v: number | null) => v === null ? '·' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const vezes = (v: number | null) => v === null ? '·' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const margem = (v: number | null) => v === null ? '·' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const dataBR = (iso: string | null | undefined) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : ''
const cnpjBR = (c: string | null) =>
  c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c ?? '')

const COR_VEREDITO: Record<Veredito, string> = {
  mantem: cor.acaoClara, melhora: cor.areaOperacao, piora: cor.alerta, mudou_de_rumo: cor.alerta, inconclusivo: cor.ouroTexto,
}

const INDICES: { k: keyof Indices; nome: string; fmt: (v: number | null) => string; bomSobe: boolean }[] = [
  { k: 'liquidez_corrente', nome: 'Liquidez corrente', fmt: vezes, bomSobe: true },
  { k: 'endividamento', nome: 'Endividamento (exigível ÷ PL)', fmt: vezes, bomSobe: false },
  { k: 'margem_ebitda', nome: 'Margem EBITDA', fmt: margem, bomSobe: true },
  { k: 'margem_liquida', nome: 'Margem líquida', fmt: margem, bomSobe: true },
]

export function nomeDoPdfComplemento(c: Complemento, ficha: FichaAnalise): string {
  return 'FAM_Analise_complementar_' + ficha.razao_social.replace(/[^\wÀ-ÿ .-]/g, '').trim().replace(/\s+/g, '_').slice(0, 70)
    + '_' + c.criado_em.slice(0, 10)
}

export function htmlDoComplemento(c: Complemento, ficha: FichaAnalise): string {
  const r = c.resultado!
  const colunas = linhaDoTempo(ficha.exercicios, r.periodos)
  const { base, novo } = comparacaoPrincipal(colunas)
  const corV = COR_VEREDITO[r.veredito]
  const iBase = base ? indices(base) : null
  const iNovo = novo ? indices(novo) : null
  const rotNovo = novo ? `${novo.rotulo}${novo.parcial ? ` (${novo.meses} meses)` : ''}` : ''
  const varDe = (k: typeof CONTAS[number]) => base && novo ? variacao(comparavel(base, k), comparavel(novo, k)) : null

  const cartao = (rot: string, num: string, sub: string, alerta = false) =>
    `<div class="kpi${alerta ? ' al' : ''}"><div class="kr">${esc(rot)}</div><div class="kn">${esc(num)}</div><div class="ks">${esc(sub)}</div></div>`

  const kpis = novo ? `<div class="kpis">
    ${cartao(`Receita ${novo.parcial ? 'anualizada ' : ''}${rotNovo}`, reais(comparavel(novo, 'receita_operacional')),
      base ? `${pct(varDe('receita_operacional'))} contra ${base.rotulo}` : 'sem exercício anterior',
      (varDe('receita_operacional') ?? 0) <= -0.2)}
    ${cartao(`Patrimônio líquido ${novo.rotulo}`, reais(novo.valores.patrimonio_liquido ?? null),
      base ? `${pct(varDe('patrimonio_liquido'))} contra ${base.rotulo}` : 'sem exercício anterior',
      (novo.valores.patrimonio_liquido ?? 0) < 0)}
    ${cartao('Liquidez corrente', vezes(iNovo?.liquidez_corrente ?? null), base ? `era ${vezes(iBase?.liquidez_corrente ?? null)} em ${base.rotulo}` : '',
      iNovo?.liquidez_corrente != null && iNovo.liquidez_corrente < 1)}
    ${cartao('Endividamento', vezes(iNovo?.endividamento ?? null), base ? `era ${vezes(iBase?.endividamento ?? null)} em ${base.rotulo}` : '')}
  </div>` : `<div class="aviso">Os documentos novos não trouxeram demonstração com números. A leitura é só qualitativa.</div>`

  let tabela = ''
  if (novo) {
    const contas = CONTAS.filter(k => colunas.some(col => col.valores[k] !== null && col.valores[k] !== undefined))
    const idx = colunas.map(indices)
    const cab = colunas.map(col => `<th class="n${col.origem === 'complemento' ? ' novo' : ''}">${esc(col.rotulo)}<small>${col.origem === 'analise' ? 'análise' : col.parcial ? `novo · ${col.meses} meses` : 'novo'}</small></th>`).join('')
    const linhas = contas.map(k => {
      const v = varDe(k)
      const deB = base ? comparavel(base, k) : null
      const paraN = comparavel(novo, k)
      const virou = deB !== null && paraN !== null && deB > 0 && paraN < 0
      const ruim = v !== null && (k === 'exigivel_total' || k === 'passivo_circulante' ? v > 0.15 : v < -0.15)
      return `<tr><td>${esc(NOME_CONTA[k])}${FLUXO.includes(k) && novo.parcial ? '<small> anualizada na variação</small>' : ''}</td>${
        colunas.map(col => `<td class="n${col.origem === 'complemento' ? ' novo' : ''}">${esc(reais(col.valores[k] ?? null))}</td>`).join('')
      }<td class="n var${ruim || virou ? ' ruim' : ''}">${virou ? 'virou negativo' : esc(pct(v))}</td></tr>`
    }).join('')
    const linhasInd = INDICES.map(ind => {
      const a = iBase?.[ind.k] ?? null
      const b = iNovo?.[ind.k] ?? null
      const piorou = a !== null && b !== null && (ind.bomSobe ? b < a * 0.85 : b > a * 1.15)
      return `<tr class="ind"><td>${esc(ind.nome)}</td>${
        idx.map((ii, j) => `<td class="n${colunas[j].origem === 'complemento' ? ' novo' : ''}">${esc(ind.fmt(ii[ind.k]))}</td>`).join('')
      }<td class="n var${piorou ? ' ruim' : ''}">${a !== null && b !== null ? (b > a ? 'subiu' : b < a ? 'caiu' : 'igual') : '·'}</td></tr>`
    }).join('')
    tabela = `<h2>Os números no tempo</h2>
    <table class="tempo"><thead><tr><th>Conta</th>${cab}<th class="n">Variação<small>${base ? `${esc(novo.rotulo)} × ${esc(base.rotulo)}` : ''}</small></th></tr></thead>
    <tbody>${linhas}${linhasInd}</tbody></table>
    <div class="origem">Exercícios da análise de ${esc(dataBR(ficha.data_analise))}; períodos novos lidos nos documentos enviados; variação e índices calculados pelo CRM. Período parcial anualizado de forma linear (valor ÷ meses × 12), sem ajuste de sazonalidade.</div>`
  }

  const lista = (titulo: string, itens: string[], corPonto: string, vazio: string) =>
    `<div class="col"><div class="colt"><span style="background:${corPonto}"></span>${esc(titulo)}</div>${
      itens.length ? `<ul>${itens.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : `<div class="vazio">${esc(vazio)}</div>`
    }</div>`

  const docs = r.documentos.length ? `<h2>Qualidade dos documentos</h2>
    <table class="docs"><thead><tr><th>Documento</th><th>Período</th><th>Assinado</th><th>Situação</th><th>Observação</th></tr></thead><tbody>${
      r.documentos.map(d => `<tr><td><b>${esc(d.tipo || '·')}</b><small>${esc(d.arquivo)}</small></td><td>${esc(d.periodo ?? '·')}</td><td>${
        d.assinado === null ? 'não dá para ver' : d.assinado ? 'sim' : 'não'}</td><td class="sit ${d.consistencia}">${
        d.consistencia === 'ok' ? 'consistente' : d.consistencia === 'problema' ? 'problema' : 'atenção'}</td><td>${esc(d.observacao)}</td></tr>`).join('')
    }</tbody></table>` : ''

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(nomeDoPdfComplemento(c, ficha))}</title>
<style>
  @page{size:A4;margin:14mm 13mm 16mm}
  *{box-sizing:border-box}
  html,body{margin:0;background:#fff;color:${cor.texto};font:10.5pt/1.5 "Segoe UI",Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  header{background:${cor.tinta};color:#fff;border-bottom:3px solid ${cor.ouro};padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0}
  header .m{font-weight:700;font-size:11.5pt}
  header .t{color:${cor.ouro};font-weight:600;font-size:10pt}
  .capa{border:1px solid ${cor.borda};border-top:none;border-radius:0 0 8px 8px;padding:14px 16px 12px;margin-bottom:14px}
  h1{margin:0;font-size:17pt;color:${cor.tinta};line-height:1.2}
  .sub{color:${cor.textoSub};font-size:9.5pt;margin-top:3px}
  .base{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid ${cor.bordaSuave};font-size:9.5pt}
  .base b{color:${cor.tinta}}
  .veredito{border:1px solid ${cor.borda};border-left:5px solid ${corV};border-radius:8px;padding:12px 14px;break-inside:avoid}
  .veredito .v{font-weight:700;color:${corV};font-size:10pt}
  .veredito .vt{font-weight:700;color:${cor.tinta};font-size:12.5pt;margin:2px 0 6px}
  .veredito p{margin:0}
  .rec{margin-top:9px;padding-top:8px;border-top:1px solid ${cor.bordaSuave}}
  .rec b{color:${cor.tinta}}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 4px;break-inside:avoid}
  .kpi{border:1px solid ${cor.borda};border-radius:8px;padding:9px 10px;background:${cor.papelZebra}}
  .kpi.al{border-color:${cor.alertaBorda};background:${cor.alertaFundo}}
  .kr{font-size:8.5pt;color:${cor.textoFraco}}
  .kn{font-size:14pt;font-weight:800;color:${cor.tinta};line-height:1.2;margin:2px 0}
  .kpi.al .kn{color:${cor.alerta}}
  .ks{font-size:8.5pt;color:${cor.textoSub}}
  h2{font-size:11.5pt;color:${cor.tinta};margin:18px 0 8px;padding-left:9px;border-left:3px solid ${cor.ouro};break-after:avoid}
  table{width:100%;border-collapse:collapse;font-size:9pt;font-variant-numeric:tabular-nums}
  th,td{padding:5px 7px;border-bottom:1px solid ${cor.bordaSuave};text-align:left;vertical-align:top}
  thead th{background:${cor.tinta};color:#fff;font-weight:600}
  thead th small{display:block;font-weight:400;font-size:7.5pt;color:${cor.textoSobreEscuro}}
  .n{text-align:right;white-space:nowrap}
  td.novo{background:${cor.destaque}}
  thead th.novo{background:${cor.acao}}
  td.var{font-weight:700;color:${cor.tinta}}
  td.var.ruim{color:${cor.alerta}}
  tr.ind td{color:${cor.textoSub}}
  tr{break-inside:avoid}
  td small{display:block;font-size:7.5pt;color:${cor.textoFraco}}
  .origem{font-size:8pt;color:${cor.textoFraco};margin-top:5px}
  .leitura p{margin:0 0 6px}
  .leitura b{color:${cor.tinta}}
  .cols{display:grid;gap:8px}
  .col{border:1px solid ${cor.borda};border-radius:8px;padding:9px 12px}
  .col li{break-inside:avoid}
  .colt{font-weight:700;color:${cor.tinta};font-size:9.5pt;display:flex;gap:6px;align-items:center;margin-bottom:4px}
  .colt span{width:6px;height:6px;border-radius:50%;display:inline-block}
  .col ul{margin:0;padding-left:15px}
  .col li{margin:2px 0}
  .vazio{color:${cor.textoFraco};font-size:9pt}
  .sit{font-weight:700}
  .sit.ok{color:${cor.areaOperacao}}
  .sit.atencao{color:${cor.ouroTexto}}
  .sit.problema{color:${cor.alerta}}
  .aviso{border:1px solid ${cor.borda};background:${cor.papelZebra};border-radius:8px;padding:9px 12px;margin-top:12px}
  .pend{border:1px solid ${cor.alertaBorda};background:${cor.alertaFundo};border-radius:8px;padding:9px 12px 9px 26px}
  .pend li{break-inside:avoid}
  .pend li{margin:2px 0}
  .rodape{margin-top:18px;padding-top:8px;border-top:1px solid ${cor.borda};font-size:8pt;color:${cor.textoFraco};display:flex;justify-content:space-between;gap:12px}
  @media screen{body{max-width:210mm;margin:12px auto;padding:0 10mm}}
</style></head><body>
<header><span class="m">FAM Seguradora</span><span class="t">Análise complementar | ${esc(dataBR(c.concluido_em ?? c.criado_em))}</span></header>
<div class="capa">
  <h1>${esc(ficha.razao_social)}</h1>
  <div class="sub">${ficha.cnpj ? `CNPJ ${esc(cnpjBR(ficha.cnpj))} · ` : ''}documentos novos lidos contra a Análise de Crédito de ${esc(dataBR(ficha.data_analise))}</div>
  <div class="base">
    <span>Decisão vigente: <b>${esc(ficha.recomendacao ?? '·')}</b></span>
    <span>Score FAM: <b>${esc(ficha.score_final !== null ? Number(ficha.score_final).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '·')}</b></span>
    <span>Rating: <b>${esc(ficha.rating_cod ?? ficha.rating_txt ?? '·')}</b></span>
    <span>Limite: <b>${esc(ficha.limiteNum !== null ? ficha.limiteNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '·')}</b></span>
  </div>
</div>

<div class="veredito">
  <div class="v">${esc(NOME_VEREDITO[r.veredito])}</div>
  ${r.titulo ? `<div class="vt">${esc(r.titulo)}</div>` : ''}
  <p>${esc(r.resumo)}</p>
  <div class="rec"><b>Recomendação: ${esc(NOME_ACAO[r.recomendacao.acao])}.</b> ${esc(r.recomendacao.texto)}</div>
</div>

${kpis}
${tabela}

${r.leitura_quantitativa.length ? `<h2>Leitura dos números</h2><div class="leitura">${
  r.leitura_quantitativa.map(l => `<p>${l.tema ? `<b>${esc(l.tema)}.</b> ` : ''}${esc(l.texto)}</p>`).join('')}</div>` : ''}

<h2>Contra a análise anterior</h2>
<div class="cols">
  ${lista('Confirma a análise', r.confirma, cor.areaOperacao, 'Nada destacado.')}
  ${lista('Contradiz a análise', r.contradiz, cor.alerta, 'Nada contradiz.')}
  ${lista('Riscos novos', r.novos_riscos, cor.ouro, 'Nenhum risco novo.')}
</div>

${docs}

${r.pendencias.length ? `<h2>Pedir ao tomador</h2><ul class="pend">${r.pendencias.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}

<div class="rodape">
  <span>Pedido em ${esc(dataBR(c.criado_em))}${c.criado_por_nome ? ` por ${esc(c.criado_por_nome)}` : ''}. Documentos: ${esc(c.arquivos.map(a => a.nome).join(', '))}.</span>
  <span>Leitura complementar: não altera a análise oficial.</span>
</div>
</body></html>`
}

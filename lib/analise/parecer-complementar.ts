// ============================================================================
//  PARECER COMPLEMENTAR  ·  a determinação da Diretoria, ao lado da oficial
//  28/09/2026
//
//  Ordem do Marco, depois da Alphaville: "a análise segue o padrão correto, mas
//  quando eu faço uma solicitação fora dos parâmetros, deve vir destacado". E,
//  como o fluxo ainda é por e-mail para a Subscrição, o parecer tem de sair
//  como arquivo, com as duas visões lado a lado e o que motivou o pedido.
//
//  O template do relatório (v13) não é tocado (ordem de 01/09). Este é um
//  documento próprio, e o MESMO HTML serve à tela e ao download: o que ele vê
//  no CRM é exatamente o que vai para a Subscrição.
// ============================================================================

import { cor } from '@/lib/ui/painel'

type Supa = ReturnType<typeof import('@/lib/supabase/client').createClient>

/** Um resultado de crédito, em texto já formatado pelo analista. */
export interface ResultadoCredito {
  pl?: string
  score?: string
  classe?: string
  rating?: string
  limite?: string
  decisao?: string
  risco?: string
}

/** O bloco que o analista grava no JSON da análise (`determinacao`). */
export interface Determinacao {
  pedido_por?: string
  resumo?: string
  premissas?: string[]
  oficial?: ResultadoCredito
  com_determinacao?: ResultadoCredito
  calculos?: { indicador?: string; formula?: string; substituicao?: string; resultado?: string }[]
  conclusao?: string
  para_virar_oficial?: string
}

export interface DadosParecer {
  analiseId: string
  razao: string
  cnpj: string | null
  dataAnalise: string
  dataAnterior: string | null
  /** O texto que ele escreveu no CRM ao pedir a reanálise (o e-mail do Ivan, no caso da Alphaville). */
  motivo: string | null
  pedidoPor: string | null
  pedidoEm: string | null
  oficial: ResultadoCredito
  det: Determinacao
  /** O parecer como o analista o deixou. Quando existe, é ele que vale na tela e no download. */
  editado: { html: string; por?: string; em?: string } | null
}

const dataBR = (iso: string | null | undefined) => {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}

const cnpjBR = (c: string | null) =>
  c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c ?? '')

const scoreBR = (v: unknown) => {
  const n = Number(v)
  return v === null || v === undefined || v === '' || !Number.isFinite(n)
    ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/**
 * O parecer de uma análise, por `id` ou por `chave_local`. `null` quando a
 * análise não teve determinação: aí não há parecer, e a tela não mostra nada.
 */
export async function carregarParecer(sb: Supa, alvo: { id?: string; chave?: string }): Promise<DadosParecer | null> {
  let q = sb.from('analises').select(
    'id, cnpj, razao_social, data_analise, score_final, classe, rating_txt, limite_recomendado_txt, recomendacao, nivel_risco, determinacao, parecer_editado',
  )
  if (alvo.id) q = q.eq('id', alvo.id)
  else if (alvo.chave) q = q.eq('chave_local', alvo.chave)
  else return null
  const { data: a } = await q.maybeSingle()
  const det = a?.determinacao as Determinacao | null
  if (!a || !det || typeof det !== 'object') return null

  const { data: r } = await sb
    .from('analise_reanalises')
    .select('motivo, criado_por_nome, criado_em, analise_base_id')
    .eq('analise_nova_id', a.id)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let dataAnterior: string | null = null
  if (r?.analise_base_id) {
    const { data: b } = await sb.from('analises').select('data_analise').eq('id', r.analise_base_id).maybeSingle()
    dataAnterior = b?.data_analise ?? null
  }

  // O oficial vem da LINHA da análise, que é a fonte da verdade; o bloco só
  // completa o que a linha não tem (o PL, por exemplo).
  const daLinha: ResultadoCredito = {
    score: scoreBR(a.score_final),
    classe: a.classe ?? '',
    rating: a.rating_txt ?? '',
    limite: a.limite_recomendado_txt ?? '',
    decisao: a.recomendacao ?? '',
    risco: a.nivel_risco ?? '',
  }
  const oficial: ResultadoCredito = { ...(det.oficial ?? {}) }
  for (const [k, v] of Object.entries(daLinha)) if (v) oficial[k as keyof ResultadoCredito] = v

  return {
    analiseId: a.id,
    razao: a.razao_social,
    cnpj: a.cnpj,
    dataAnalise: a.data_analise,
    dataAnterior,
    motivo: r?.motivo ?? null,
    pedidoPor: r?.criado_por_nome ?? null,
    pedidoEm: r?.criado_em ?? null,
    oficial,
    det,
    editado: a.parecer_editado && typeof a.parecer_editado.html === 'string' && a.parecer_editado.html
      ? a.parecer_editado : null,
  }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const LINHAS: [keyof ResultadoCredito, string][] = [
  ['pl', 'Patrimônio líquido'],
  ['score', 'Score FAM'],
  ['classe', 'Classe'],
  ['rating', 'Rating FAM'],
  ['limite', 'Limite recomendado'],
  ['decisao', 'Decisão'],
  ['risco', 'Nível de risco'],
]

/** O documento inteiro, estático: sem script, abre igual em qualquer navegador e imprime em A4. */
export function htmlDoParecer(p: DadosParecer): string {
  const d = p.det
  const com = d.com_determinacao ?? {}
  const linhas = LINHAS
    .filter(([k]) => p.oficial[k] || com[k])
    .map(([k, rot]) => {
      const mudou = (p.oficial[k] ?? '') !== (com[k] ?? '') && !!com[k]
      return `<tr><th>${esc(rot)}</th><td>${esc(p.oficial[k] || '·')}</td><td class="det${mudou ? ' mudou' : ''}">${esc(com[k] || '·')}</td></tr>`
    }).join('')

  const premissas = (d.premissas ?? []).filter(Boolean)
  const calculos = (d.calculos ?? []).filter(c => c && (c.indicador || c.resultado))

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parecer complementar · ${esc(p.razao)} · ${esc(dataBR(p.dataAnalise))}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:${cor.fundo};color:${cor.texto};font:13px/1.55 "Segoe UI",Roboto,Arial,sans-serif}
  .folha{max-width:880px;margin:0 auto;background:${cor.papel};border:1px solid ${cor.borda};border-radius:10px;overflow:hidden}
  header{background:${cor.tinta};color:#fff;border-bottom:3px solid ${cor.ouro};padding:18px 26px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  header .marca{font-weight:700;font-size:14px}
  header .tipo{color:${cor.ouro};font-weight:600;font-size:13px}
  .corpo{padding:22px 26px 26px}
  h1{margin:0;font-size:22px;color:${cor.tinta}}
  .sub{color:${cor.textoSub};margin-top:4px}
  .selo{display:inline-block;margin-top:12px;background:${cor.alertaFundo};border:1px solid ${cor.alertaBorda};color:${cor.alerta};border-radius:8px;padding:6px 10px;font-weight:600;font-size:12.5px}
  h2{font-size:15px;color:${cor.tinta};margin:26px 0 10px;padding-left:10px;border-left:3px solid ${cor.ouro}}
  .motivo{background:${cor.papelZebra};border:1px solid ${cor.borda};border-radius:10px;padding:14px 16px;white-space:pre-wrap}
  .quem{color:${cor.textoFraco};font-size:12px;margin-top:6px}
  table{width:100%;border-collapse:collapse;border:1px solid ${cor.borda};border-radius:10px;overflow:hidden}
  th,td{padding:9px 12px;border-bottom:1px solid ${cor.bordaSuave};text-align:left;vertical-align:top}
  thead th{background:${cor.tinta};color:#fff;font-weight:600}
  thead th.det{background:${cor.acao}}
  tbody th{width:28%;color:${cor.textoSub};font-weight:600;background:${cor.papelZebra}}
  td.det{background:${cor.destaque};font-weight:600;color:${cor.tinta}}
  td.det.mudou{box-shadow:inset 3px 0 0 ${cor.ouro}}
  ul{margin:0;padding-left:20px}
  li{margin:3px 0}
  .calc td,.calc th{font-size:12px}
  .nota{color:${cor.textoFraco};font-size:11.5px;margin-top:22px;border-top:1px solid ${cor.bordaSuave};padding-top:12px}
  .caixa{border:1px solid ${cor.borda};border-radius:10px;padding:12px 14px}
  .ressalva{border:1px solid ${cor.alertaBorda};background:${cor.alertaFundo};border-left:4px solid ${cor.alerta};border-radius:10px;padding:12px 14px;margin:14px 0}
  figure.img{margin:16px auto;text-align:center;max-width:100%}
  figure.img img{width:100%;height:auto;border:1px solid ${cor.borda};border-radius:8px;display:block}
  figure.img figcaption{font-size:12px;color:${cor.textoSub};margin-top:6px}
  hr{border:none;border-top:1px solid ${cor.borda};margin:18px 0}
  @media print{body{background:#fff}.folha{border:none;border-radius:0;max-width:none}thead th,header,td.det{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  @media (max-width:600px){.corpo{padding:16px}header{padding:14px 16px}th,td{padding:7px 8px}}
</style></head><body><div class="folha">
<header><span class="marca">FAM Seguradora</span><span class="tipo">Parecer complementar | ${esc(dataBR(p.dataAnalise))}</span></header>
<div class="corpo">
  <h1>${esc(p.razao)}</h1>
  <div class="sub">CNPJ ${esc(cnpjBR(p.cnpj))} · complementa a Análise de Crédito oficial de ${esc(dataBR(p.dataAnalise))}${p.dataAnterior ? ` (anterior: ${esc(dataBR(p.dataAnterior))})` : ''}</div>
  <div class="selo">Solicitação fora dos parâmetros da metodologia COD-EEC V001-2025${d.pedido_por ? `, por ${esc(d.pedido_por)}` : ''}</div>

  <h2>O que motivou este parecer</h2>
  ${p.motivo ? `<div class="motivo">${esc(p.motivo)}</div>` : d.resumo ? `<div class="motivo">${esc(d.resumo)}</div>` : '<div class="motivo">Motivo não registrado no CRM.</div>'}
  ${p.pedidoPor || p.pedidoEm ? `<div class="quem">Registrado no CRM${p.pedidoPor ? ` por ${esc(p.pedidoPor)}` : ''}${p.pedidoEm ? ` em ${esc(dataBR(p.pedidoEm))}` : ''}.</div>` : ''}

  <h2>As duas visões</h2>
  <table><thead><tr><th></th><th>Oficial (metodologia)</th><th class="det">Com a determinação</th></tr></thead>
  <tbody>${linhas}</tbody></table>

  ${premissas.length ? `<h2>Premissas aplicadas na determinação</h2><ul>${premissas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}

  ${calculos.length ? `<h2>Memória do cálculo</h2><table class="calc"><thead><tr><th>Indicador</th><th>Fórmula</th><th>Conta</th><th>Resultado</th></tr></thead><tbody>${
    calculos.map(c => `<tr><td>${esc(c.indicador)}</td><td>${esc(c.formula)}</td><td>${esc(c.substituicao)}</td><td><b>${esc(c.resultado)}</b></td></tr>`).join('')
  }</tbody></table>` : ''}

  ${d.conclusao ? `<h2>Leitura do analista</h2><div class="caixa">${esc(d.conclusao)}</div>` : ''}
  ${d.para_virar_oficial ? `<h2>Para a determinação virar a análise oficial</h2><div class="caixa">${esc(d.para_virar_oficial)}</div>` : ''}

  <div class="nota">Este parecer não substitui a análise oficial: ele mostra, ao lado dela, o resultado com a determinação pedida, para decisão da Subscrição. A análise oficial completa segue no relatório de ${esc(dataBR(p.dataAnalise))}.</div>
</div></div></body></html>`
}

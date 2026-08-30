// ============================================================================
//  BAIXAR HTML — o dossiê do tomador num arquivo só, para mandar à equipe.
//
//  O Marco pediu isto em 30/08/2026, junto com a decisão de parar de guardar a
//  análise em JSON: *"so mantenha o baixar html que preciso enviar para
//  equipe"*. O JSON deixa de ser a fonte da verdade (quem guarda é o banco),
//  mas a SAÍDA em HTML continua, e passa a ser gerada do banco.
//
//  Regras do arquivo gerado:
//   • É um arquivo só. CSS embutido, nenhuma imagem externa, nenhum script.
//     Abre com dois cliques em qualquer máquina, e sobrevive ao anexo de
//     e-mail. Ver [[html-exportado-nao-tem-render]]: o que depende de JS para
//     desenhar SOME no arquivo baixado, então aqui não há JS nenhum.
//   • Tudo o que a Mesa mostra na tela está nele, aberto. Nada de "clique para
//     ver": quem recebe não tem o sistema.
//   • Texto vindo do banco é ESCAPADO. A conclusão da análise tem HTML de
//     verdade lá dentro (<b>, <div>), escrito no template antigo, e colar isso
//     cru num arquivo que circula por e-mail é exatamente como se abre um furo.
// ============================================================================

import { maskCNPJ } from '@/lib/utils'

/** Escapa para texto. Vale para TUDO que vem do banco, sem exceção. */
const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Alguns campos da análise vieram do editor antigo com HTML dentro. Aqui só
 *  interessa o texto: tira as marcas e devolve a frase limpa, já escapada. */
const semTags = (s: unknown): string =>
  esc(String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())

export interface LinhaDossie { rotulo: string; valor: string }
export interface SecaoDossie {
  titulo: string
  campos?: LinhaDossie[]
  /** tabela opcional: cabeçalho + linhas já formatadas */
  tabela?: { cabecalho: string[]; linhas: string[][] }
  /** parágrafos livres (conclusão, condições, pontos) */
  textos?: { titulo: string; itens: string[] }[]
  vazio?: string
}

export interface DossieParaHtml {
  razaoSocial: string
  cnpj: string | null
  subtitulo: string
  chips: string[]
  kpis: { rotulo: string; valor: string }[]
  secoes: SecaoDossie[]
  rodape: string
}

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{font-family:'Calibri','Segoe UI',sans-serif;background:#eef2f7;color:#1a2a3a;
 margin:0;padding:26px 16px 60px;font-size:14px;line-height:1.5}
.f{max-width:940px;margin:0 auto}
.cab{background:#fff;border:1px solid #e3ebf5;border-radius:14px;padding:20px 22px;margin-bottom:14px}
.eyebrow{font-size:10.5px;font-weight:800;color:#3070c8;text-transform:uppercase;letter-spacing:1.2px}
h1{font-size:24px;font-weight:700;color:#0a1628;margin:6px 0 4px;line-height:1.15}
.sub{font-size:13px;color:#6080a0}
.chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.chip{font-size:12px;font-weight:600;padding:4px 11px;border-radius:8px;
 border:1px solid #dbe6f3;background:#f2f7fd;color:#1e4080}
.kpis{display:flex;gap:11px;flex-wrap:wrap;margin-top:16px}
.kpi{border:1px solid #e3ebf5;border-radius:11px;padding:11px 17px;min-width:158px;background:#fbfdff}
.kpi .r{font-size:10.5px;font-weight:700;color:#6080a0;text-transform:uppercase;letter-spacing:.9px}
.kpi .v{font-size:19px;font-weight:700;color:#1e4080;margin-top:4px;font-variant-numeric:tabular-nums}
.sec{background:#fff;border:1px solid #e3ebf5;border-radius:14px;margin-bottom:14px;overflow:hidden}
.sec h2{font-size:12px;font-weight:700;color:#0a1628;text-transform:uppercase;letter-spacing:.9px;
 margin:0;padding:14px 20px;border-bottom:1px solid #eef3f9;background:#fbfdff}
.sec .in{padding:14px 20px 18px}
.campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 20px}
.campo{padding:8px 0;border-bottom:1px solid #eef3f9;min-width:0}
.campo .r{font-size:10.5px;font-weight:700;color:#6080a0;text-transform:uppercase;letter-spacing:.5px}
.campo .v{font-size:13.5px;color:#0a1628;margin-top:2px;word-break:break-word}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:10.5px;font-weight:700;color:#8ba3c0;text-transform:uppercase;
 letter-spacing:.7px;padding:9px 12px;border-bottom:1px solid #eef3f9;background:#fbfdff}
td{padding:9px 12px;border-bottom:1px solid #f2f6fb}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bloco{margin-top:14px}
.bloco h3{font-size:12px;font-weight:700;color:#1e4080;margin:0 0 6px}
.bloco ul{margin:0;padding-left:18px}
.bloco li{margin-bottom:5px;color:#1a2a3a}
.bloco p{margin:0;color:#1a2a3a}
.vazio{color:#8ba3c0;font-size:13px}
.rod{font-size:12px;color:#6080a0;text-align:center;margin-top:22px;line-height:1.6}
@media print{body{background:#fff;padding:0}.sec,.cab{break-inside:avoid;box-shadow:none}}
`

function secaoHtml(s: SecaoDossie): string {
  const partes: string[] = []

  if (s.campos && s.campos.length) {
    partes.push('<div class="campos">' + s.campos.map(c =>
      `<div class="campo"><div class="r">${esc(c.rotulo)}</div><div class="v">${esc(c.valor)}</div></div>`
    ).join('') + '</div>')
  }

  if (s.tabela && s.tabela.linhas.length) {
    partes.push(
      '<table><thead><tr>'
      + s.tabela.cabecalho.map((h, i) =>
          `<th${i > 0 ? ' style="text-align:right"' : ''}>${esc(h)}</th>`).join('')
      + '</tr></thead><tbody>'
      + s.tabela.linhas.map(l => '<tr>'
          + l.map((c, i) => `<td${i > 0 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')
          + '</tr>').join('')
      + '</tbody></table>'
    )
  }

  if (s.textos) {
    for (const t of s.textos) {
      if (!t.itens.length) continue
      partes.push(`<div class="bloco"><h3>${esc(t.titulo)}</h3>`
        + (t.itens.length > 1
          ? '<ul>' + t.itens.map(i => `<li>${semTags(i)}</li>`).join('') + '</ul>'
          : `<p>${semTags(t.itens[0])}</p>`)
        + '</div>')
    }
  }

  if (!partes.length) partes.push(`<div class="vazio">${esc(s.vazio || 'Sem informação.')}</div>`)

  return `<section class="sec"><h2>${esc(s.titulo)}</h2><div class="in">${partes.join('')}</div></section>`
}

/** Monta o arquivo inteiro. Devolve o HTML como string. */
export function montarDossieHtml(d: DossieParaHtml): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.razaoSocial)} · Dossiê do Tomador · FAM Seguradora</title>
<style>${CSS}</style></head><body><div class="f">
<header class="cab">
  <div class="eyebrow">Dossiê do Tomador · FAM Seguradora</div>
  <h1>${esc(d.razaoSocial)}</h1>
  <div class="sub">${esc(d.cnpj ? maskCNPJ(d.cnpj) : 'sem CNPJ cadastrado')}${d.subtitulo ? ' · ' + esc(d.subtitulo) : ''}</div>
  <div class="chips">${d.chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
  <div class="kpis">${d.kpis.map(k =>
    `<div class="kpi"><div class="r">${esc(k.rotulo)}</div><div class="v">${esc(k.valor)}</div></div>`).join('')}</div>
</header>
${d.secoes.map(secaoHtml).join('\n')}
<p class="rod">${esc(d.rodape)}</p>
</div></body></html>`
}

/** Dispara o download no navegador. Nome do arquivo com a razão social e a data. */
export function baixarDossie(html: string, razaoSocial: string): void {
  // NFD separa o acento da letra; tirar tudo que nao e ASCII imprimivel
  // remove os acentos soltos e deixa a letra base. Sem faixa de combinantes
  // escrita no codigo, que fica ilegivel e some ao trocar de codificacao.
  const limpo = razaoSocial.normalize('NFD').replace(/[^ -~]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'tomador'
  const hoje = new Date()
  const carimbo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dossie-${limpo}-${carimbo}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Sem o revoke o blob fica preso na memória da aba até recarregar.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export { esc as escaparHtml, semTags as textoLimpo }

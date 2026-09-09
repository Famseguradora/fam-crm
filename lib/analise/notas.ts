// ============================================================================
//  AS NOTAS DO TOMADOR  ·  "O que eu sei deste tomador"
//
//  Porta o `notas.mjs` do Sistema de Análise. A regra que sustenta o resto,
//  decidida com ele em 10/08/2026: NOTA é o que ele escreve. Não tem estado,
//  não tem prazo, não reabre análise nenhuma. É por TOMADOR (a chave), e não
//  por análise: o que ele sabe da empresa atravessa as análises dela.
//
//  A LIMPEZA DO HTML é cópia da de lá, e o motivo também: o texto vem de um
//  contenteditable, com o que o navegador (e o Word, e o Outlook) resolveram
//  colar junto. Guardar isso cru seria guardar folha de estilo do Office
//  dentro do banco, e abrir a porta para script. A lista é de PERMISSÃO,
//  nunca de proibição: proibição esquece um caso, e o caso esquecido é
//  justamente o que entra.
// ============================================================================

export interface Nota {
  id: string
  chave: string
  fila_id: string | null
  tomador_id: string | null
  cnpj: string | null
  titulo: string | null
  html: string
  fixada: boolean
  origem: 'crm' | 'motor'
  autor_nome: string | null
  em: string
  atualizado_em: string
}

/** Teto por nota. Print colado vira data: URI e engorda depressa. */
export const TETO_NOTA = 4 * 1024 * 1024

const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'ul', 'ol', 'li', 'span', 'h3', 'h4', 'blockquote', 'code', 'img', 'mark', 'a'])
const HREF_OK = /^(https?:\/\/|mailto:)/i
const ESTILOS = /^(font-weight|font-style|text-decoration)\s*:\s*[\w -]+$/i

export function limparHtml(bruto: string | null | undefined): string {
  let s = String(bruto ?? '')
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')

  s = s.replace(/<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (inteiro, tag: string, atributos: string) => {
    const t = tag.toLowerCase()
    if (!TAGS.has(t)) return ''
    if (inteiro.startsWith('</')) return `</${t}>`

    const guardados: string[] = []
    if (t === 'img') {
      // SÓ imagem colada, que viaja dentro da própria nota. src http buscaria
      // na internet a cada abertura, e um dia o endereço morre.
      const src = (atributos.match(/\ssrc\s*=\s*"([^"]*)"/i) || atributos.match(/\ssrc\s*=\s*'([^']*)'/i) || [])[1] || ''
      if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(src)) return ''
      guardados.push(`src="${src.replace(/"/g, '&quot;')}"`)
      guardados.push('style="max-width:100%;height:auto"')
    }
    if (t === 'a') {
      const href = (atributos.match(/\shref\s*=\s*"([^"]*)"/i) || atributos.match(/\shref\s*=\s*'([^']*)'/i) || [])[1] || ''
      if (!HREF_OK.test(href)) return ''
      guardados.push(`href="${href.replace(/"/g, '&quot;')}"`, 'target="_blank"', 'rel="noopener"')
    }
    if (t === 'li' || t === 'div' || t === 'p' || t === 'span') {
      // A caixinha de tarefa do editor: só a marca, nada mais.
      if (/\bdata-tarefa\b/.test(atributos)) {
        const feita = /data-tarefa\s*=\s*"feita"/i.test(atributos)
        guardados.push(`data-tarefa="${feita ? 'feita' : 'aberta'}"`)
      }
    }
    const style = (atributos.match(/\sstyle\s*=\s*"([^"]*)"/i) || [])[1] || ''
    if (style && t !== 'img') {
      const ok = style.split(';').map(x => x.trim()).filter(x => ESTILOS.test(x))
      if (ok.length) guardados.push(`style="${ok.join(';')}"`)
    }
    return `<${t}${guardados.length ? ' ' + guardados.join(' ') : ''}>`
  })

  // Sobras que o Word deixa e que não são tag: entidades de espaço em fila.
  s = s.replace(/(&nbsp;){3,}/g, '&nbsp;&nbsp;')
  return s.length > TETO_NOTA ? s.slice(0, TETO_NOTA) : s
}

/** O título é opcional de propósito: obrigar título transformaria "anotar uma
 *  linha que acabei de descobrir" num formulário. Texto puro, é rótulo. */
export const limparTitulo = (t: string | null | undefined) =>
  String(t ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)

/** O texto de uma nota sem as tags, para a lista e para a busca. */
export const textoDaNota = (html: string) =>
  html.replace(/<img[^>]*>/gi, ' [imagem] ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

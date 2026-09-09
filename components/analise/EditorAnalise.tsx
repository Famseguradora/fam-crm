'use client'

// ============================================================================
//  EDITAR A ANÁLISE DENTRO DO CRM
//
//  Esta é a peça que faltava para a análise de crédito TERMINAR no CRM. Até
//  aqui o caminho era: o motor gera na máquina do Marco, ele edita no relatório
//  daquele sistema, a carga publica, e o CRM só LÊ. Duas casas para a mesma
//  análise, e a edição sempre acontecendo fora.
//
//  Agora ele confere e corrige aqui, e o que sai da mão dele já está no banco
//  do CRM. Ordem dele em 08/09/2026: "após edição é só salvar automaticamente,
//  pois já estou dentro do CRM e no banco de dados do CRM".
//
//  AS TRÊS DECISÕES QUE SUSTENTAM ISTO
//
//  1. SALVA SOZINHO, campo a campo, ao sair do campo. Não há botão "Salvar" no
//     rodapé: botão de salvar é onde o trabalho se perde (a pessoa fecha a aba,
//     o navegador recarrega, o filho puxa o notebook). Cada campo mostra o
//     próprio estado, então nunca há dúvida sobre o que já está gravado.
//
//  2. O VALOR ANTERIOR NUNCA SOME. Toda gravação escreve uma linha em
//     `analise_edicoes` com o que estava antes, quem mudou e quando. Sem isso, a
//     primeira correção apagaria para sempre o número que a máquina gerou, e não
//     haveria como responder "o que a análise dizia antes de eu mexer".
//
//  3. QUEM EDITA AQUI VIRA DONO DA LINHA. A gravação marca `editado_no_crm`, e
//     a carga do disco (`npm run publicar`) passa a NÃO sobrescrever esta
//     análise: a divergência vai para `analise_conflitos` em vez de apagar o
//     trabalho dele em silêncio. Sem essa trava, este editor seria uma armadilha.
//
//  A TRAVA DE VERDADE É A RLS (`fam_e_analista()`): um analista escreve, todo
//  mundo lê. O que esta tela faz é esconder o que o banco recusaria de qualquer
//  jeito, para ninguém digitar em vão.
// ============================================================================

import { useCallback, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda } from '@/lib/utils'
import type { FichaAnalise } from '@/lib/analise/ficha'

// ── o que se escreve, e como ────────────────────────────────────────────────

type Tipo = 'texto' | 'numero' | 'dinheiro' | 'percent' | 'longo' | 'lista' | 'escolha'

interface CampoDef {
  /** A coluna de `analises`, ou o caminho dentro de `tres_cs`. */
  k: string
  rotulo: string
  tipo: Tipo
  opcoes?: string[]
  dica?: string
  largo?: boolean
}

/** As decisões que a análise publica. É o mesmo vocabulário do relatório do
 *  sistema atual: mudar o nome de um campo aqui é mudar o que o CRM promete. */
const BLOCOS: { titulo: string; cor: string; nota?: string; campos: CampoDef[] }[] = [
  {
    titulo: 'A decisão', cor: '#1e4080',
    campos: [
      { k: 'score_final', rotulo: 'Score FAM', tipo: 'numero', dica: 'De 0 a 10, com duas casas' },
      { k: 'rating_cod', rotulo: 'Rating (código)', tipo: 'texto', dica: 'A3, D2, E6…' },
      { k: 'rating_txt', rotulo: 'Rating (por extenso)', tipo: 'texto' },
      { k: 'classe', rotulo: 'Classe', tipo: 'texto' },
      { k: 'porte', rotulo: 'Porte', tipo: 'texto' },
      { k: 'nivel_risco', rotulo: 'Nível de risco', tipo: 'texto' },
      {
        k: 'recomendacao', rotulo: 'Decisão', tipo: 'escolha',
        opcoes: ['Aprovar', 'Aprovar com ressalvas', 'Reprovar'],
        dica: 'É o que a lista e a ficha do tomador mostram',
      },
      {
        k: 'limite_recomendado_num', rotulo: 'Limite recomendado', tipo: 'dinheiro',
        dica: 'O número que vale. Gravar aqui apaga a anulação, se havia',
      },
      { k: 'limite_recomendado_txt', rotulo: 'O que a análise escreveu sobre o limite', tipo: 'longo', largo: true },
      { k: 'taxa_tradicional', rotulo: 'Taxa tradicional (%)', tipo: 'percent' },
      { k: 'taxa_judicial', rotulo: 'Taxa judicial (%)', tipo: 'percent' },
      { k: 'taxa_estruturada', rotulo: 'Taxa estruturada (%)', tipo: 'percent' },
    ],
  },
  {
    titulo: "Os 3 C's do crédito", cor: '#3070c8',
    nota: 'A classe é o julgamento, e não o Score. Cada C tem o fundamento escrito por quem analisou.',
    campos: [
      { k: 'tres_cs.carater.classe', rotulo: 'Caráter · classe', tipo: 'texto', dica: 'Forte, Médio, Fraco' },
      { k: 'tres_cs.carater.fundamento', rotulo: 'Caráter · fundamento', tipo: 'longo', largo: true },
      { k: 'tres_cs.capacidade.classe', rotulo: 'Capacidade · classe', tipo: 'texto' },
      { k: 'tres_cs.capacidade.fundamento', rotulo: 'Capacidade · fundamento', tipo: 'longo', largo: true },
      { k: 'tres_cs.capital.classe', rotulo: 'Capital · classe', tipo: 'texto' },
      { k: 'tres_cs.capital.fundamento', rotulo: 'Capital · fundamento', tipo: 'longo', largo: true },
    ],
  },
  {
    titulo: 'Pontos da análise', cor: '#e8b84b',
    nota: 'Um ponto por linha. Linha em branco não vira ponto.',
    campos: [
      { k: 'pontos_positivos', rotulo: 'Pontos positivos', tipo: 'lista', largo: true },
      { k: 'pontos_atencao', rotulo: 'Pontos de atenção', tipo: 'lista', largo: true },
    ],
  },
  {
    titulo: 'Conclusão e condições', cor: '#1e4080',
    campos: [
      { k: 'conclusao', rotulo: 'Conclusão', tipo: 'longo', largo: true },
      { k: 'condicoes', rotulo: 'Condições', tipo: 'longo', largo: true },
    ],
  },
]

// ── ler e escrever números como gente escreve ───────────────────────────────

/** "9,40" e "9.40" são o mesmo número. Campo vazio é NULO, e não zero: zero é
 *  uma afirmação (o limite é zero), vazio é a ausência dela. */
function paraNumero(txt: string): number | null {
  const t = txt.trim()
  if (!t) return null
  // Dinheiro brasileiro: o ponto é separador de milhar e a vírgula é decimal.
  const limpo = t.replace(/[R$\s%]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

const numeroParaTexto = (v: number | null, casas?: number): string =>
  v === null || v === undefined ? '' : (casas === undefined ? String(v) : v.toFixed(casas)).replace('.', ',')

/** O valor de um campo na ficha, já como texto para o formulário. */
function valorInicial(ficha: FichaAnalise, c: CampoDef): string {
  if (c.k.startsWith('tres_cs.')) {
    const [, qual, parte] = c.k.split('.')
    const t = (ficha.tres_cs ?? {}) as Record<string, { classe?: string; fundamento?: string }>
    return String(t?.[qual]?.[parte as 'classe' | 'fundamento'] ?? '')
  }
  switch (c.k) {
    case 'score_final': return numeroParaTexto(ficha.score_final, 2)
    case 'limite_recomendado_num': return ficha.limiteNum === null ? '' : numeroParaTexto(ficha.limiteNum, 2)
    case 'taxa_tradicional': return numeroParaTexto(ficha.taxa_tradicional)
    case 'taxa_judicial': return numeroParaTexto(ficha.taxa_judicial)
    case 'taxa_estruturada': return numeroParaTexto(ficha.taxa_estruturada)
    case 'pontos_positivos': return (ficha.pontos_positivos ?? []).join('\n')
    case 'pontos_atencao': return (ficha.pontos_atencao ?? []).join('\n')
    case 'rating_cod': return ficha.rating_cod ?? ''
    case 'rating_txt': return ficha.rating_txt ?? ''
    case 'classe': return ficha.classe ?? ''
    case 'porte': return ficha.porte ?? ''
    case 'nivel_risco': return ficha.nivel_risco ?? ''
    case 'recomendacao': return ficha.recomendacao ?? ''
    case 'limite_recomendado_txt': return ficha.limite_recomendado_txt ?? ''
    case 'conclusao': return ficha.conclusao ?? ''
    case 'condicoes': return ficha.condicoes ?? ''
    default: return ''
  }
}

type Estado = 'parado' | 'salvando' | 'salvo' | 'erro'

// ── a tela ──────────────────────────────────────────────────────────────────

export default function EditorAnalise({ ficha, aoSalvar }: {
  ficha: FichaAnalise
  /** Avisa a página que o banco mudou, para ela reler a ficha. */
  aoSalvar?: () => void
}) {
  const inicial = useMemo(() => {
    const m: Record<string, string> = {}
    for (const b of BLOCOS) for (const c of b.campos) m[c.k] = valorInicial(ficha, c)
    return m
  }, [ficha])

  const [valores, setValores] = useState<Record<string, string>>(inicial)
  const [gravado, setGravado] = useState<Record<string, string>>(inicial)
  const [estado, setEstado] = useState<Record<string, Estado>>({})
  const [erro, setErro] = useState<Record<string, string>>({})
  const [ultima, setUltima] = useState<string>('')

  /** Grava UM campo. Só é chamada quando o valor mudou de verdade. */
  const salvar = useCallback(async (c: CampoDef, texto: string) => {
    const antes = gravado[c.k] ?? ''
    if (texto === antes) return

    setEstado(e => ({ ...e, [c.k]: 'salvando' }))
    setErro(e => ({ ...e, [c.k]: '' }))

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setEstado(e => ({ ...e, [c.k]: 'erro' }))
      setErro(e => ({ ...e, [c.k]: 'Sua sessão expirou. Entre de novo e refaça esta alteração.' }))
      return
    }

    // ── o que vai para o banco, por tipo ────────────────────────────────
    const mudanca: Record<string, unknown> = {}
    if (c.k.startsWith('tres_cs.')) {
      const [, qual, parte] = c.k.split('.')
      // O jsonb inteiro é reescrito, então parte-se do que está lá para não
      // apagar o C vizinho.
      const base = JSON.parse(JSON.stringify(ficha.tres_cs ?? {})) as Record<string, Record<string, string>>
      base[qual] = { ...(base[qual] ?? {}) }
      base[qual][parte] = texto.trim()
      // Aplica o que já foi editado nesta sessão e ainda não foi relido.
      for (const outro of BLOCOS[1].campos) {
        if (outro.k === c.k) continue
        const [, q2, p2] = outro.k.split('.')
        const v = valores[outro.k] ?? ''
        if (!v) continue
        base[q2] = { ...(base[q2] ?? {}) }
        base[q2][p2] = v.trim()
      }
      mudanca.tres_cs = base
    } else if (c.tipo === 'lista') {
      mudanca[c.k] = texto.split('\n').map(l => l.trim()).filter(Boolean)
    } else if (c.tipo === 'numero' || c.tipo === 'dinheiro' || c.tipo === 'percent') {
      mudanca[c.k] = paraNumero(texto)
      /* A ANULAÇÃO SAI JUNTO COM O NÚMERO NOVO.
         `limite_recomendado_motivo` preenchido faz a ficha, a lista e o acervo
         ESCONDEREM o número (a trava que impediu um limite de R$ 727 milhões de
         virar valor). Se ele digita o limite aqui e o motivo fica, o número
         gravado não apareceria em lugar nenhum: ele teria trabalhado à toa. */
      if (c.k === 'limite_recomendado_num' && paraNumero(texto) !== null) {
        mudanca.limite_recomendado_motivo = null
      }
    } else {
      mudanca[c.k] = texto.trim() === '' ? null : texto.trim()
    }

    // Quem edita aqui vira dono da linha: a carga do disco não sobrescreve mais.
    // `revisada` passa a valer porque editar É a conferência dele.
    const agora = new Date().toISOString()
    const { error } = await supabase.from('analises').update({
      ...mudanca,
      editado_no_crm: agora,
      editado_por: user.id,
      revisada: true,
      revisado_em: agora,
    }).eq('id', ficha.id)

    if (error) {
      setEstado(e => ({ ...e, [c.k]: 'erro' }))
      setErro(e => ({
        ...e,
        [c.k]: /row-level|permission|denied/i.test(error.message)
          ? 'O banco recusou: só o analista de crédito grava a análise.'
          : error.message,
      }))
      return
    }

    /* A memória do que a máquina tinha escrito. Falhar aqui NÃO desfaz a
       gravação nem assusta: o valor novo já está salvo, e o que se perde é uma
       linha de histórico. Fica no console para não sumir de vez. */
    const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
    const { error: errEd } = await supabase.from('analise_edicoes').insert({
      analise_id: ficha.id,
      campo: c.rotulo,
      de: antes || null,
      para: texto.trim() || null,
      quem: user.id,
      quem_nome: quem?.nome ?? null,
    })
    if (errEd) console.warn('a edição foi salva, mas o histórico não: ' + errEd.message)

    setGravado(g => ({ ...g, [c.k]: texto }))
    setEstado(e => ({ ...e, [c.k]: 'salvo' }))
    setUltima(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    aoSalvar?.()
  }, [ficha, gravado, valores, aoSalvar])

  const mudou = (k: string) => (valores[k] ?? '') !== (gravado[k] ?? '')

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="mt-nota" style={{ marginTop: 0 }}>
        <b>Cada campo salva sozinho quando você sai dele.</b> O valor anterior fica guardado no
        histórico da análise, e a partir da primeira alteração a publicação vinda da sua máquina
        <b> não sobrescreve mais esta análise</b>: a diferença passa a aparecer como conflito, em
        vez de apagar o que você escreveu.
        {ultima && <> Última gravação às <b>{ultima}</b>.</>}
      </div>

      {BLOCOS.map(b => (
        <section key={b.titulo} className="mt-card mt-bloco">
          <header className="mt-bloco-cab">
            <span className="pt" style={{ background: b.cor }} />
            <span className="mt-bloco-tit">{b.titulo}</span>
          </header>
          <div className="mt-bloco-corpo">
            {b.nota && <div style={{ fontSize: 12, color: 'var(--soft)', marginBottom: 10 }}>{b.nota}</div>}
            <div style={{
              display: 'grid', gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}>
              {b.campos.map(c => {
                const st = estado[c.k] ?? 'parado'
                const msg = erro[c.k]
                return (
                  <label key={c.k} style={{ display: 'block', gridColumn: c.largo ? '1 / -1' : undefined }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4,
                      fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
                      textTransform: 'uppercase', color: 'var(--soft)',
                    }}>
                      {c.rotulo}
                      {st === 'salvando' && <span style={{ color: '#a07b1e', textTransform: 'none', letterSpacing: 0 }}>salvando…</span>}
                      {st === 'salvo' && <span style={{ color: '#1a7a50', textTransform: 'none', letterSpacing: 0 }}>✓ salvo</span>}
                      {st !== 'salvando' && st !== 'salvo' && mudou(c.k) && (
                        <span style={{ color: '#a07b1e', textTransform: 'none', letterSpacing: 0 }}>a salvar</span>
                      )}
                    </span>

                    {c.tipo === 'escolha' ? (
                      <input
                        list={`op-${c.k}`}
                        className="fam-input"
                        value={valores[c.k] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [c.k]: e.target.value }))}
                        onBlur={e => salvar(c, e.target.value)}
                      />
                    ) : c.tipo === 'longo' || c.tipo === 'lista' ? (
                      <textarea
                        className="fam-input"
                        rows={c.tipo === 'lista' ? 5 : 4}
                        style={{ resize: 'vertical', lineHeight: 1.5 }}
                        value={valores[c.k] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [c.k]: e.target.value }))}
                        onBlur={e => salvar(c, e.target.value)}
                      />
                    ) : (
                      <input
                        className="fam-input"
                        inputMode={c.tipo === 'texto' ? undefined : 'decimal'}
                        value={valores[c.k] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [c.k]: e.target.value }))}
                        onBlur={e => salvar(c, e.target.value)}
                      />
                    )}

                    {c.tipo === 'escolha' && (
                      <datalist id={`op-${c.k}`}>
                        {(c.opcoes ?? []).map(o => <option key={o} value={o} />)}
                      </datalist>
                    )}

                    {/* O dinheiro escrito por extenso embaixo do campo: digitar
                        um zero a mais é o erro mais caro desta tela. */}
                    {c.tipo === 'dinheiro' && paraNumero(valores[c.k] ?? '') !== null && (
                      <span style={{ fontSize: 12, color: '#1a7a50', display: 'block', marginTop: 3 }}>
                        {fmtMoeda(paraNumero(valores[c.k] ?? '') as number)}
                      </span>
                    )}
                    {c.dica && !msg && (
                      <span style={{ fontSize: 11.5, color: 'var(--soft)', display: 'block', marginTop: 3 }}>{c.dica}</span>
                    )}
                    {msg && (
                      <span style={{ fontSize: 12, color: '#a02020', display: 'block', marginTop: 3 }}>{msg}</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

'use client'

// ============================================================================
//  EDITAR O QUE A ANÁLISE TEM ALÉM DA DECISÃO  ·  28/09/2026
//
//  Ordem dele: "dentro de Análise de crédito e de Análise complementar precisa
//  ligar a opção de editar. Quando eu clicar em Editar a análise, tem que deixar
//  eu editar essa parte. Guarde o histórico como tudo é feito agora."
//
//  Duas partes que o EditorAnalise não alcançava:
//    · a DETERMINAÇÃO da Diretoria (a coluna "com a determinação" do parecer),
//      que mora em `analises.determinacao`;
//    · a ANÁLISE COMPLEMENTAR, a leitura dos documentos novos, que mora em
//      `analise_complementos.resultado`.
//  Mesmo jeito do resto: salva sozinho ao sair do campo, e o valor anterior vai
//  para `analise_edicoes` com quem mudou e quando.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FichaAnalise } from '@/lib/analise/ficha'
import type { Determinacao } from '@/lib/analise/parecer-complementar'
import { NOME_VEREDITO, NOME_ACAO, type Complemento, type ResultadoComplemento } from '@/lib/analise/complemento'

type Estado = 'parado' | 'salvando' | 'salvo' | 'erro'
type Tipo = 'texto' | 'longo' | 'lista' | 'escolha'

interface Campo {
  k: string
  rotulo: string
  tipo: Tipo
  opcoes?: [string, string][]
  largo?: boolean
  dica?: string
}

// ── ler e escrever num caminho "a.b.c" dentro de um objeto ─────────────────
function ler(o: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o)
}
function escrever<T>(o: T, caminho: string, valor: unknown): T {
  const copia = JSON.parse(JSON.stringify(o ?? {}))
  const partes = caminho.split('.')
  let alvo = copia as Record<string, unknown>
  for (const p of partes.slice(0, -1)) {
    if (!alvo[p] || typeof alvo[p] !== 'object') alvo[p] = {}
    alvo = alvo[p] as Record<string, unknown>
  }
  alvo[partes[partes.length - 1]] = valor
  return copia
}

/** A lista de "Tema: texto" da leitura quantitativa, como uma linha por item. */
const TEMA = 'leitura_quantitativa'

function comoTexto(o: unknown, c: Campo): string {
  const v = ler(o, c.k)
  if (c.k === TEMA) return ((v as { tema?: string; texto?: string }[]) ?? []).map(l => (l.tema ? `${l.tema}: ` : '') + (l.texto ?? '')).join('\n')
  if (c.tipo === 'lista') return ((v as string[]) ?? []).join('\n')
  return v === null || v === undefined ? '' : String(v)
}
function doTexto(texto: string, c: Campo): unknown {
  if (c.k === TEMA) {
    return texto.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const i = l.indexOf(':')
      return i > 0 && i < 60 ? { tema: l.slice(0, i).trim(), texto: l.slice(i + 1).trim() } : { tema: '', texto: l }
    })
  }
  if (c.tipo === 'lista') return texto.split('\n').map(l => l.trim()).filter(Boolean)
  return texto.trim()
}

// ── o que se edita ─────────────────────────────────────────────────────────
const CAMPOS_DETERMINACAO: Campo[] = [
  { k: 'pedido_por', rotulo: 'Quem pediu', tipo: 'texto', dica: 'Ex.: Ivan, Diretor de Subscrição' },
  { k: 'resumo', rotulo: 'O que foi pedido, em uma frase', tipo: 'longo', largo: true },
  { k: 'oficial.pl', rotulo: 'Oficial · patrimônio líquido', tipo: 'texto' },
  { k: 'com_determinacao.pl', rotulo: 'Com a determinação · patrimônio líquido', tipo: 'texto' },
  { k: 'com_determinacao.score', rotulo: 'Com a determinação · Score FAM', tipo: 'texto' },
  { k: 'com_determinacao.classe', rotulo: 'Com a determinação · classe', tipo: 'texto' },
  { k: 'com_determinacao.rating', rotulo: 'Com a determinação · rating', tipo: 'texto' },
  { k: 'com_determinacao.limite', rotulo: 'Com a determinação · limite', tipo: 'texto' },
  { k: 'com_determinacao.decisao', rotulo: 'Com a determinação · decisão', tipo: 'escolha',
    opcoes: [['Aprovar', 'Aprovar'], ['Aprovar com ressalvas', 'Aprovar com ressalvas'], ['Reprovar', 'Reprovar']] },
  { k: 'com_determinacao.risco', rotulo: 'Com a determinação · nível de risco', tipo: 'texto' },
  { k: 'premissas', rotulo: 'Premissas aplicadas (uma por linha)', tipo: 'lista', largo: true },
  { k: 'conclusao', rotulo: 'Leitura do analista', tipo: 'longo', largo: true },
  { k: 'para_virar_oficial', rotulo: 'Para a determinação virar a análise oficial', tipo: 'longo', largo: true },
]

const CAMPOS_COMPLEMENTO: Campo[] = [
  { k: 'veredito', rotulo: 'Veredito', tipo: 'escolha', opcoes: Object.entries(NOME_VEREDITO) },
  { k: 'titulo', rotulo: 'Título', tipo: 'texto', largo: true },
  { k: 'resumo', rotulo: 'Resumo', tipo: 'longo', largo: true },
  { k: 'recomendacao.acao', rotulo: 'Recomendação', tipo: 'escolha', opcoes: Object.entries(NOME_ACAO) },
  { k: 'recomendacao.texto', rotulo: 'Recomendação · texto', tipo: 'longo', largo: true },
  { k: TEMA, rotulo: 'Leitura dos números (uma por linha, "Tema: texto")', tipo: 'lista', largo: true },
  { k: 'confirma', rotulo: 'Confirma a análise (um por linha)', tipo: 'lista', largo: true },
  { k: 'contradiz', rotulo: 'Contradiz a análise (um por linha)', tipo: 'lista', largo: true },
  { k: 'novos_riscos', rotulo: 'Riscos novos (um por linha)', tipo: 'lista', largo: true },
  { k: 'pendencias', rotulo: 'Pedir ao tomador (um por linha)', tipo: 'lista', largo: true },
]

// ── o histórico, igual ao do EditorAnalise ─────────────────────────────────
async function gravarHistorico(analiseId: string, campo: string, de: string, para: string) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return
  const { data: quem } = await sb.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const { error } = await sb.from('analise_edicoes').insert({
    analise_id: analiseId, campo, de: de || null, para: para.trim() || null, quem: user.id, quem_nome: quem?.nome ?? null,
  })
  if (error) console.warn('a edição foi salva, mas o histórico não: ' + error.message)
}

const recusou = (msg: string) => /row-level|permission|denied/i.test(msg)
  ? 'O banco recusou: só o analista de crédito grava a análise.' : msg

// ── um bloco de campos que salva sozinho ───────────────────────────────────
function Bloco({ titulo, cor, nota, campos, objeto, gravar }: {
  titulo: string
  cor: string
  nota?: React.ReactNode
  campos: Campo[]
  objeto: unknown
  /** Grava o objeto inteiro com o campo mudado; devolve a mensagem de erro, se houver. */
  gravar: (novo: unknown, c: Campo, de: string, para: string) => Promise<string | null>
}) {
  const inicial = useCallback(() => Object.fromEntries(campos.map(c => [c.k, comoTexto(objeto, c)])), [campos, objeto])
  const [valores, setValores] = useState<Record<string, string>>(inicial)
  const [gravado, setGravado] = useState<Record<string, string>>(inicial)
  const [atual, setAtual] = useState<unknown>(objeto)
  const [estado, setEstado] = useState<Record<string, Estado>>({})
  const [erro, setErro] = useState<Record<string, string>>({})

  const salvar = async (c: Campo, texto: string) => {
    const antes = gravado[c.k] ?? ''
    if (texto === antes) return
    setEstado(e => ({ ...e, [c.k]: 'salvando' }))
    const novo = escrever(atual, c.k, doTexto(texto, c))
    const falha = await gravar(novo, c, antes, texto)
    if (falha) {
      setEstado(e => ({ ...e, [c.k]: 'erro' }))
      setErro(e => ({ ...e, [c.k]: falha }))
      return
    }
    setAtual(novo)
    setGravado(g => ({ ...g, [c.k]: texto }))
    setErro(e => ({ ...e, [c.k]: '' }))
    setEstado(e => ({ ...e, [c.k]: 'salvo' }))
  }

  return (
    <section className="mt-card mt-bloco">
      <header className="mt-bloco-cab">
        <span className="pt" style={{ background: cor }} />
        <span className="mt-bloco-tit">{titulo}</span>
      </header>
      <div className="mt-bloco-corpo">
        {nota && <div style={{ fontSize: 12, color: 'var(--soft)', marginBottom: 10 }}>{nota}</div>}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
          {campos.map(c => {
            const st = estado[c.k] ?? 'parado'
            const mudou = (valores[c.k] ?? '') !== (gravado[c.k] ?? '')
            const props = {
              className: 'fam-input',
              value: valores[c.k] ?? '',
              onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => salvar(c, e.target.value),
            }
            return (
              <label key={c.k} style={{ display: 'block', gridColumn: c.largo ? '1 / -1' : undefined }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--soft)' }}>
                  {c.rotulo}
                  {st === 'salvando' && <span style={{ color: '#a07b1e' }}>salvando…</span>}
                  {st === 'salvo' && <span style={{ color: '#1a7a50' }}>✓ salvo</span>}
                  {st !== 'salvando' && st !== 'salvo' && mudou && <span style={{ color: '#a07b1e' }}>a salvar</span>}
                </span>
                {c.tipo === 'escolha' ? (
                  <select className={props.className} value={props.value}
                    onChange={e => { setValores(v => ({ ...v, [c.k]: e.target.value })); salvar(c, e.target.value) }}>
                    <option value="">·</option>
                    {(c.opcoes ?? []).map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
                  </select>
                ) : c.tipo === 'longo' || c.tipo === 'lista' ? (
                  <textarea {...props} rows={c.tipo === 'lista' ? 5 : 3} style={{ resize: 'vertical', lineHeight: 1.5 }}
                    onChange={e => setValores(v => ({ ...v, [c.k]: e.target.value }))} />
                ) : (
                  <input {...props} onChange={e => setValores(v => ({ ...v, [c.k]: e.target.value }))} />
                )}
                {c.dica && !erro[c.k] && <span style={{ fontSize: 11.5, color: 'var(--soft)', display: 'block', marginTop: 3 }}>{c.dica}</span>}
                {erro[c.k] && <span style={{ fontSize: 12, color: '#a02020', display: 'block', marginTop: 3 }}>{erro[c.k]}</span>}
              </label>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── as duas partes ─────────────────────────────────────────────────────────
export default function EditorComplementares({ ficha, aoSalvar }: { ficha: FichaAnalise; aoSalvar?: () => void }) {
  const [det, setDet] = useState<{ d: Determinacao | null; editado: boolean } | null>(null)
  const [complementos, setComplementos] = useState<Complemento[]>([])
  const [qual, setQual] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const sb = createClient()
    Promise.all([
      sb.from('analises').select('determinacao, parecer_editado').eq('id', ficha.id).maybeSingle(),
      sb.from('analise_complementos').select('id, criado_em, estado, resultado').eq('analise_id', ficha.id)
        .eq('estado', 'pronta').order('criado_em', { ascending: false }),
    ]).then(([a, c]) => {
      if (!vivo) return
      setDet({ d: (a.data?.determinacao as Determinacao | null) ?? null, editado: !!a.data?.parecer_editado })
      const lista = ((c.data ?? []) as unknown as Complemento[]).filter(x => x.resultado)
      setComplementos(lista)
      setQual(lista[0]?.id ?? null)
    })
    return () => { vivo = false }
  }, [ficha.id])

  const gravarDeterminacao = async (novo: unknown, c: Campo, de: string, para: string) => {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return 'Sua sessão expirou. Entre de novo e refaça esta alteração.'
    const agora = new Date().toISOString()
    // Editar aqui também faz da linha dele: a carga do notebook não sobrescreve mais.
    const { error } = await sb.from('analises')
      .update({ determinacao: novo, editado_no_crm: agora, editado_por: user.id }).eq('id', ficha.id)
    if (error) return recusou(error.message)
    await gravarHistorico(ficha.id, `Determinação · ${c.rotulo}`, de, para)
    aoSalvar?.()
    return null
  }

  const comp = complementos.find(x => x.id === qual) ?? null
  const gravarComplemento = async (novo: unknown, c: Campo, de: string, para: string) => {
    if (!comp) return 'Complemento não encontrado.'
    const { error } = await createClient().from('analise_complementos')
      .update({ resultado: novo as ResultadoComplemento }).eq('id', comp.id)
    if (error) return recusou(error.message)
    await gravarHistorico(ficha.id, `Análise complementar de ${new Date(comp.criado_em).toLocaleDateString('pt-BR')} · ${c.rotulo}`, de, para)
    return null
  }

  if (!det) return null

  return (
    <>
      {det.d && (
        <Bloco
          titulo="Determinação da Diretoria (parecer complementar)"
          cor="#c0392b"
          nota={<>
            A coluna &quot;com a determinação&quot; do parecer que vai à Subscrição. A oficial acima continua pela metodologia.
            {det.editado && <> <b>Este parecer já foi editado à mão</b>: o que você mudar aqui fica gravado e no histórico,
              mas o texto do parecer só muda se você editar o parecer também ou clicar em &quot;Voltar ao gerado&quot; nele.</>}
          </>}
          campos={CAMPOS_DETERMINACAO}
          objeto={det.d}
          gravar={gravarDeterminacao}
        />
      )}

      {complementos.length > 0 && comp && (
        <>
          {complementos.length > 1 && (
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--soft)' }}>Qual análise complementar editar</span>
              <select className="fam-input" value={qual ?? ''} onChange={e => setQual(e.target.value)}>
                {complementos.map(x => <option key={x.id} value={x.id}>{new Date(x.criado_em).toLocaleString('pt-BR')}</option>)}
              </select>
            </label>
          )}
          <Bloco
            key={comp.id}
            titulo={`Análise complementar de ${new Date(comp.criado_em).toLocaleDateString('pt-BR')}`}
            cor="#e8b84b"
            nota='A leitura dos documentos novos. Os números da tabela vêm das demonstrações e não se editam aqui; "Ler de novo" na seção Análise complementar refaz a leitura por cima destas edições (o histórico guarda as suas).'
            campos={CAMPOS_COMPLEMENTO}
            objeto={comp.resultado}
            gravar={gravarComplemento}
          />
        </>
      )}
    </>
  )
}

'use client'

// ============================================================================
//  ANÁLISE COMPLEMENTAR  ·  a seção do relatório da análise
//
//  Pedido do Marco em 17/09/2026: "as análises na grande maioria das vezes têm
//  que ter complemento". O tomador manda documento novo, ele sobe aqui, e o
//  notebook lê os documentos contra a análise anterior. Não é outro relatório:
//  é uma leitura em tela, limpa, qualitativa e quantitativa no tempo, dizendo
//  se a empresa manteve ou mudou de rumo.
//
//  Mora dentro de RelatorioCompleto, e por isso aparece nas duas portas: o
//  Acervo (/analises/<id>) e a aba Relatório do card da Mesa.
//
//  As contas (variação, anualização, índices) vêm de lib/analise/complemento.ts;
//  a IA só leu os números e escreveu a leitura.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { fmtData } from '@/lib/utils'
import type { FichaAnalise } from '@/lib/analise/ficha'
import {
  CONTAS, NOME_CONTA, FLUXO, NOME_VEREDITO, NOME_ACAO,
  linhaDoTempo, comparavel, variacao, indices, comparacaoPrincipal,
  type Complemento, type ColunaTempo, type Veredito, type Indices,
} from '@/lib/analise/complemento'
import { Bloco } from '@/components/analise/Relatorio'
import { GradeCartoes, CartaoNumero, Moldura, Aviso } from '@/components/painel/Painel'
import { cor, raio, texto, botaoCheio, botaoVazado } from '@/lib/ui/painel'

const COLUNAS = 'id, analise_id, tomador_id, cnpj, estado, instrucoes, arquivos, resultado, mensagem, erro, segundos, criado_por_nome, criado_em, pego_em, concluido_em'

// ── formatação ──────────────────────────────────────────────────────────────

function reais(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  const f = (n: number, s: string) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${s}`
  if (a >= 1e9) return f(v / 1e9, 'bi')
  if (a >= 1e6) return f(v / 1e6, 'mi')
  if (a >= 1e3) return f(v / 1e3, 'mil')
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
const pct = (v: number | null) => v === null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const vezes = (v: number | null) => v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** A cor do veredito. Vermelho só onde há decisão a tomar (regra 3 do design). */
const COR_VEREDITO: Record<Veredito, string> = {
  mantem: cor.acaoClara,
  melhora: cor.areaOperacao,
  piora: cor.alerta,
  mudou_de_rumo: cor.alerta,
  inconclusivo: cor.ouro,
}

const INDICES: { k: keyof Indices; nome: string; fmt: (v: number | null) => string; bomSobe: boolean }[] = [
  { k: 'liquidez_corrente', nome: 'Liquidez corrente', fmt: vezes, bomSobe: true },
  { k: 'endividamento', nome: 'Endividamento (exigível ÷ PL)', fmt: vezes, bomSobe: false },
  { k: 'margem_ebitda', nome: 'Margem EBITDA', fmt: (v) => v === null ? '—' : pct(v).replace('+', ''), bomSobe: true },
  { k: 'margem_liquida', nome: 'Margem líquida', fmt: (v) => v === null ? '—' : pct(v).replace('+', ''), bomSobe: true },
]

// ── a seção ─────────────────────────────────────────────────────────────────

export default function Complementos({ ficha }: { ficha: FichaAnalise }) {
  const { editaAnalise } = usePermissoes()
  const [lista, setLista] = useState<Complemento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [abrirForm, setAbrirForm] = useState(false)

  const carregar = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('analise_complementos').select(COLUNAS)
      .eq('analise_id', ficha.id).order('criado_em', { ascending: false })
    setLista((data ?? []) as unknown as Complemento[])
    setCarregando(false)
  }, [ficha.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    const sb = createClient()
    const canal = sb.channel(`complementos-${ficha.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_complementos', filter: `analise_id=eq.${ficha.id}` }, () => carregar())
      .subscribe()
    // O Realtime pode perder um aviso; enquanto houver leitura andando, o relógio cobre.
    const t = setInterval(() => carregar(), 15000)
    return () => { clearInterval(t); sb.removeChannel(canal) }
  }, [carregar, ficha.id])

  const atual = lista.find(c => c.id === escolhido) ?? lista[0] ?? null

  return (
    <Bloco titulo="Análise complementar" cor={cor.ouro}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ ...texto.corpo, color: cor.textoSub, flex: '1 1 320px' }}>
          Chegou documento novo deste tomador (balancete, balanço, Serasa)? Suba aqui. Os documentos são lidos
          contra esta análise de {fmtData(ficha.data_analise)} e contra os complementos anteriores, e a leitura
          mostra se a empresa manteve ou mudou de rumo.
        </div>
        {editaAnalise && (
          <button type="button" style={abrirForm ? botaoVazado : botaoCheio} onClick={() => setAbrirForm(v => !v)}>
            {abrirForm ? 'Fechar' : 'Subir documentos novos'}
          </button>
        )}
      </div>

      {abrirForm && editaAnalise && (
        <FormComplemento analiseId={ficha.id} aoEnviar={(id) => { setAbrirForm(false); setEscolhido(id); carregar() }} />
      )}

      {carregando ? (
        <div style={texto.nota}>Carregando os complementos…</div>
      ) : lista.length === 0 ? (
        <Aviso>Nenhuma análise complementar foi feita para esta análise ainda.</Aviso>
      ) : (
        <>
          {lista.length > 1 && (
            <div role="tablist" aria-label="Complementos" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {lista.map(c => {
                const on = c.id === atual?.id
                const v = c.resultado?.veredito
                return (
                  <button key={c.id} type="button" role="tab" aria-selected={on} onClick={() => setEscolhido(c.id)}
                    style={{
                      ...botaoVazado, padding: '6px 11px', fontSize: 12,
                      borderColor: on ? cor.bordaAtiva : cor.borda, background: on ? cor.destaque : cor.papel,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: v ? COR_VEREDITO[v] : cor.textoFraco }} />
                    {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                    <span style={{ color: cor.textoFraco, fontWeight: 400 }}>
                      {c.estado === 'pronta' && v ? NOME_VEREDITO[v] : c.estado === 'erro' ? 'erro' : 'lendo'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {atual && <UmComplemento c={atual} ficha={ficha} podeMexer={editaAnalise} aoMudar={carregar} />}
        </>
      )}
    </Bloco>
  )
}

// ── o formulário ────────────────────────────────────────────────────────────

function FormComplemento({ analiseId, aoEnviar }: { analiseId: string; aoEnviar: (id: string) => void }) {
  const [arquivos, setArquivos] = useState<File[]>([])
  const [instrucoes, setInstrucoes] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const somar = (novos: FileList | null) => {
    if (!novos) return
    setArquivos(a => {
      const nomes = new Set(a.map(x => x.name + x.size))
      return [...a, ...Array.from(novos).filter(f => !nomes.has(f.name + f.size))]
    })
  }
  const total = arquivos.reduce((s, f) => s + f.size, 0)

  const enviar = async () => {
    if (!arquivos.length || enviando) return
    if (total > 48 * 1024 * 1024) { setErro('Os arquivos juntos passam de 48 MB. Mande em duas vezes.'); return }
    setEnviando(true); setErro('')
    const fd = new FormData()
    for (const f of arquivos) fd.append('arquivo', f)
    if (instrucoes.trim()) fd.append('instrucoes', instrucoes.trim())
    try {
      const r = await fetch(`/api/analise/${analiseId}/complemento`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.erro || `O envio falhou (HTTP ${r.status}).`)
      if (j.aviso) alert(j.aviso)
      aoEnviar(j.id)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ background: cor.fundo, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: 12, marginBottom: 14 }}>
      <div
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => { e.preventDefault(); setArrastando(false); somar(e.dataTransfer.files) }}
        onClick={() => entrada.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') entrada.current?.click() }}
        style={{
          border: `1.5px dashed ${arrastando ? cor.bordaAtiva : cor.borda}`, borderRadius: raio.cartao,
          background: arrastando ? cor.destaque : cor.papel, padding: '18px 12px', textAlign: 'center', cursor: 'pointer',
        }}>
        <div style={texto.titulo}>Solte os documentos aqui, ou clique para escolher</div>
        <div style={{ ...texto.apoio, marginTop: 3 }}>PDF, planilha ou imagem · até 50 MB cada, 48 MB juntos</div>
        <input ref={entrada} type="file" multiple hidden
          accept=".pdf,.xlsx,.xls,.xlsm,.ods,.csv,.png,.jpg,.jpeg,.txt,.docx"
          onChange={e => { somar(e.target.files); e.target.value = '' }} />
      </div>

      {arquivos.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
          {arquivos.map((f, i) => (
            <li key={f.name + f.size} style={{ ...texto.corpo, display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={texto.nota}>{(f.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</span>
              <button type="button" onClick={() => setArquivos(a => a.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: cor.textoFraco, cursor: 'pointer', fontSize: 12 }}>tirar</button>
            </li>
          ))}
        </ul>
      )}

      <label style={{ display: 'block', marginTop: 10 }}>
        <span style={texto.rotulo}>O que conferir em especial (opcional)</span>
        <textarea value={instrucoes} onChange={e => setInstrucoes(e.target.value)} rows={2}
          placeholder="Ex.: o endividamento de curto prazo subiu? a receita de 2026 sustenta o limite?"
          style={{ width: '100%', marginTop: 4, border: `1px solid ${cor.borda}`, borderRadius: raio.controle, padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
      </label>

      {erro && <div style={{ marginTop: 10 }}><Aviso tom="erro">{erro}</Aviso></div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" style={{ ...botaoCheio, opacity: !arquivos.length || enviando ? 0.55 : 1 }}
          disabled={!arquivos.length || enviando} onClick={enviar}>
          {enviando ? 'Enviando…' : 'Enviar e fazer a análise complementar'}
        </button>
        <span style={texto.nota}>
          A leitura roda no notebook (a esteira precisa estar ligada) e leva alguns minutos. Os arquivos também ficam na ficha do tomador.
        </span>
      </div>
    </div>
  )
}

// ── um complemento ──────────────────────────────────────────────────────────

function UmComplemento({ c, ficha, podeMexer, aoMudar }: {
  c: Complemento; ficha: FichaAnalise; podeMexer: boolean; aoMudar: () => void
}) {
  const [aberto, setAberto] = useState<string | null>('tempo')

  const refazer = async () => {
    const sb = createClient()
    await sb.from('analise_complementos').update({ estado: 'pendente', erro: null, mensagem: 'Na fila do notebook.', concluido_em: null }).eq('id', c.id)
    aoMudar()
  }
  const apagar = async () => {
    if (!confirm('Apagar este complemento? Os arquivos continuam na ficha do tomador.')) return
    const sb = createClient()
    await sb.from('analise_complementos').delete().eq('id', c.id)
    aoMudar()
  }
  const baixar = async (caminho: string) => {
    const sb = createClient()
    const { data } = await sb.storage.from('fam-anexos').createSignedUrl(caminho, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  const acoes = podeMexer && (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {c.estado !== 'lendo' && (
        <button type="button" style={{ ...botaoVazado, padding: '5px 10px', fontSize: 12 }} onClick={refazer}>Ler de novo</button>
      )}
      <button type="button" style={{ ...botaoVazado, padding: '5px 10px', fontSize: 12 }} onClick={apagar}>Apagar</button>
    </span>
  )

  const cabecalho = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
      <span style={texto.nota}>
        Pedido em {quando(c.criado_em)}{c.criado_por_nome ? ` por ${c.criado_por_nome}` : ''} ·{' '}
        {c.arquivos.map((a, i) => (
          <span key={a.storage_path}>
            {i > 0 && ', '}
            <button type="button" onClick={() => baixar(a.storage_path)}
              style={{ background: 'none', border: 'none', padding: 0, color: cor.acao, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}>
              {a.nome}
            </button>
          </span>
        ))}
        {c.instrucoes ? ` · pediu: "${c.instrucoes}"` : ''}
      </span>
      <span style={{ flex: 1 }} />
      {acoes}
    </div>
  )

  if (c.estado === 'pendente' || c.estado === 'lendo') {
    return (
      <>
        {cabecalho}
        <Aviso>
          <b>{c.estado === 'pendente' ? 'Na fila do notebook.' : 'Lendo agora.'}</b>{' '}
          {c.mensagem ?? ''}{' '}
          {c.estado === 'pendente' && 'Se ficar parado aqui, confira se a esteira está ligada (botão Agente Esteira).'}
        </Aviso>
      </>
    )
  }

  if (c.estado === 'erro' || !c.resultado) {
    return (
      <>
        {cabecalho}
        <Aviso tom="erro"><b>A leitura não terminou.</b> {c.erro ?? 'Sem detalhe.'}</Aviso>
      </>
    )
  }

  return (
    <>
      {cabecalho}
      <Leitura c={c} ficha={ficha} aberto={aberto} setAberto={setAberto} />
    </>
  )
}

function Leitura({ c, ficha, aberto, setAberto }: {
  c: Complemento; ficha: FichaAnalise; aberto: string | null; setAberto: (s: string | null) => void
}) {
  const r = c.resultado!
  const colunas = useMemo(() => linhaDoTempo(ficha.exercicios, r.periodos), [ficha.exercicios, r.periodos])
  const { base, novo } = comparacaoPrincipal(colunas)
  const corV = COR_VEREDITO[r.veredito]
  const alterna = (k: string) => setAberto(aberto === k ? null : k)

  const varDe = (k: typeof CONTAS[number]) => base && novo ? variacao(comparavel(base, k), comparavel(novo, k)) : null
  const iBase = base ? indices(base) : null
  const iNovo = novo ? indices(novo) : null
  const rotNovo = novo ? `${novo.rotulo}${novo.parcial ? ` (${novo.meses} meses)` : ''}` : ''

  const varReceita = varDe('receita_operacional')
  const varPL = varDe('patrimonio_liquido')

  return (
    <>
      {/* ── o recibo: veredito, resumo e o que fazer ── */}
      <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderLeft: `4px solid ${corV}`, borderRadius: raio.cartao, padding: '12px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: r.veredito === 'inconclusivo' ? cor.ouroTexto : corV }}>{NOME_VEREDITO[r.veredito]}</span>
          {r.titulo && <span style={{ ...texto.titulo, fontSize: 14 }}>{r.titulo}</span>}
        </div>
        <p style={{ ...texto.corpo, margin: 0 }}>{r.resumo}</p>
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${cor.bordaSuave}`, ...texto.corpo }}>
          <b style={{ color: cor.tinta }}>Recomendação: {NOME_ACAO[r.recomendacao.acao]}.</b> {r.recomendacao.texto}
        </div>
      </div>

      {/* ── os números que abrem a tela ── */}
      <div style={{ marginTop: 12 }}>
        {!novo ? (
          <Aviso>Os documentos novos não trouxeram demonstração com números. A leitura abaixo é só qualitativa.</Aviso>
        ) : (
          <GradeCartoes minimo={190}>
            <CartaoNumero rotulo={`Receita ${novo.parcial ? 'anualizada' : ''} ${rotNovo}`} numero={reais(comparavel(novo, 'receita_operacional'))}
              sub={base ? `${pct(varReceita)} contra ${base.rotulo} (${reais(comparavel(base, 'receita_operacional'))})` : 'sem exercício anterior'}
              alerta={varReceita !== null && varReceita <= -0.2} />
            <CartaoNumero rotulo={`Patrimônio líquido ${novo.rotulo}`} numero={reais(novo.valores.patrimonio_liquido ?? null)}
              sub={base ? `${pct(varPL)} contra ${base.rotulo} (${reais(base.valores.patrimonio_liquido ?? null)})` : 'sem exercício anterior'}
              alerta={(novo.valores.patrimonio_liquido ?? 0) < 0 || (varPL !== null && varPL <= -0.15)} />
            <CartaoNumero rotulo="Liquidez corrente" numero={vezes(iNovo?.liquidez_corrente ?? null)}
              sub={base ? `era ${vezes(iBase?.liquidez_corrente ?? null)} em ${base.rotulo}` : undefined}
              alerta={iNovo?.liquidez_corrente != null && iNovo.liquidez_corrente < 1 && (iBase?.liquidez_corrente ?? 0) >= 1} />
            <CartaoNumero rotulo="Endividamento (exigível ÷ PL)" numero={vezes(iNovo?.endividamento ?? null)}
              sub={base ? `era ${vezes(iBase?.endividamento ?? null)} em ${base.rotulo}` : undefined} />
          </GradeCartoes>
        )}
      </div>

      {/* ── o tempo, em tabela ── */}
      {novo && (
        <Moldura titulo="Os números no tempo"
          acao={<button type="button" onClick={() => alterna('tempo')} style={{ background: 'none', border: 'none', color: cor.acao, cursor: 'pointer', fontSize: 12 }}>{aberto === 'tempo' ? 'esconder' : 'mostrar'}</button>}
          origem={`exercícios da análise de ${fmtData(ficha.data_analise)} (analise_exercicios); períodos novos lidos pela IA nos documentos enviados; variação e índices calculados pelo CRM. Resultado de período parcial anualizado de forma linear (valor ÷ meses × 12), sem ajuste de sazonalidade.`}>
          {aberto === 'tempo' && <TabelaTempo colunas={colunas} base={base} novo={novo} />}
        </Moldura>
      )}

      {/* ── a leitura quantitativa ── */}
      {r.leitura_quantitativa.length > 0 && (
        <Moldura titulo="Leitura dos números">
          <div style={{ display: 'grid', gap: 8 }}>
            {r.leitura_quantitativa.map((l, i) => (
              <div key={i} style={texto.corpo}>
                {l.tema && <b style={{ color: cor.tinta }}>{l.tema}. </b>}{l.texto}
              </div>
            ))}
          </div>
        </Moldura>
      )}

      {/* ── o qualitativo: contra a análise anterior ── */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', marginTop: 10 }}>
        <Lista titulo="Confirma a análise" itens={r.confirma} pontoCor={cor.areaOperacao} vazio="Nada destacado." />
        <Lista titulo="Contradiz a análise" itens={r.contradiz} pontoCor={cor.alerta} vazio="Nada contradiz." />
        <Lista titulo="Riscos novos" itens={r.novos_riscos} pontoCor={cor.ouro} vazio="Nenhum risco novo." />
      </div>

      {/* ── a qualidade dos documentos ── */}
      {r.documentos.length > 0 && (
        <Moldura titulo="Qualidade dos documentos">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: cor.textoFraco, textAlign: 'left' }}>
                  <th style={th}>Documento</th><th style={th}>Período</th><th style={th}>Assinado</th><th style={th}>Situação</th><th style={th}>Observação</th>
                </tr>
              </thead>
              <tbody>
                {r.documentos.map((d, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${cor.bordaSuave}` }}>
                    <td style={td}><b style={{ color: cor.tinta }}>{d.tipo || '—'}</b><div style={texto.nota}>{d.arquivo}</div></td>
                    <td style={td}>{d.periodo ?? '—'}</td>
                    <td style={td}>{d.assinado === null ? 'não dá para ver' : d.assinado ? 'sim' : 'não'}</td>
                    <td style={{ ...td, fontWeight: 700, color: d.consistencia === 'ok' ? cor.areaOperacao : d.consistencia === 'problema' ? cor.alerta : cor.ouroTexto }}>
                      {d.consistencia === 'ok' ? 'consistente' : d.consistencia === 'problema' ? 'problema' : 'atenção'}
                    </td>
                    <td style={{ ...td, color: cor.textoSub }}>{d.observacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Moldura>
      )}

      {r.pendencias.length > 0 && (
        <Moldura titulo="Pedir ao tomador">
          <ul style={{ margin: 0, paddingLeft: 18, ...texto.corpo }}>
            {r.pendencias.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Moldura>
      )}

      <div style={{ ...texto.nota, marginTop: 10 }}>
        Leitura feita pela IA no notebook{c.segundos ? ` em ${Math.max(1, Math.round(c.segundos / 60))} min` : ''}
        {c.concluido_em ? `, ${quando(c.concluido_em)}` : ''}. Ela não altera a análise: se a recomendação for mudar
        limite ou status, use Editar a análise.
      </div>
    </>
  )
}

const th: React.CSSProperties = { fontWeight: 600, fontSize: 11.5, padding: '6px 8px', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 8px', verticalAlign: 'top', color: cor.texto }

function Lista({ titulo, itens, pontoCor, vazio }: { titulo: string; itens: string[]; pontoCor: string; vazio: string }) {
  return (
    <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: '10px 12px' }}>
      <div style={{ ...texto.titulo, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: pontoCor }} />{titulo}
      </div>
      {itens.length === 0 ? <div style={texto.nota}>{vazio}</div> : (
        <ul style={{ margin: 0, paddingLeft: 16, ...texto.corpo, display: 'grid', gap: 4 }}>
          {itens.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </div>
  )
}

function TabelaTempo({ colunas, base, novo }: { colunas: ColunaTempo[]; base: ColunaTempo | null; novo: ColunaTempo }) {
  const contas = CONTAS.filter(k => colunas.some(col => col.valores[k] !== null && col.valores[k] !== undefined))
  const idx = colunas.map(indices)
  const iBase = base ? indices(base) : null
  const iNovo = indices(novo)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ color: cor.textoFraco }}>
            <th style={{ ...th, textAlign: 'left' }}>Conta</th>
            {colunas.map(col => (
              <th key={col.rotulo + col.origem} style={{ ...th, textAlign: 'right', background: col.origem === 'complemento' ? cor.destaque : undefined }}>
                {col.rotulo}
                <div style={{ fontWeight: 400, fontSize: 10.5 }}>{col.origem === 'analise' ? 'análise' : col.parcial ? `novo · ${col.meses} meses` : 'novo'}</div>
              </th>
            ))}
            <th style={{ ...th, textAlign: 'right' }}>
              Variação
              <div style={{ fontWeight: 400, fontSize: 10.5 }}>{base ? `${novo.rotulo} × ${base.rotulo}` : ''}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {contas.map(k => {
            const v = base ? variacao(comparavel(base, k), comparavel(novo, k)) : null
            // Resultado ou PL que passa de positivo a negativo: percentual ali só confunde.
            const deB = base ? comparavel(base, k) : null
            const paraN = comparavel(novo, k)
            const virou = deB !== null && paraN !== null && deB > 0 && paraN < 0
            const ruim = v !== null && (k === 'exigivel_total' || k === 'passivo_circulante' ? v > 0.15 : v < -0.15)
            return (
              <tr key={k} style={{ borderTop: `1px solid ${cor.bordaSuave}` }}>
                <td style={td}>{NOME_CONTA[k]}{FLUXO.includes(k) && novo.parcial && <span style={texto.nota}> (anualizada na variação)</span>}</td>
                {colunas.map(col => (
                  <td key={col.rotulo + col.origem} style={{ ...td, textAlign: 'right', background: col.origem === 'complemento' ? cor.destaque : undefined }}>
                    {reais(col.valores[k] ?? null)}
                  </td>
                ))}
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: ruim || virou ? cor.alerta : cor.tinta }}>{virou ? 'virou negativo' : pct(v)}</td>
              </tr>
            )
          })}
          {INDICES.map(ind => {
            const a = iBase?.[ind.k] ?? null
            const b = iNovo[ind.k]
            const piorou = a !== null && b !== null && (ind.bomSobe ? b < a * 0.85 : b > a * 1.15)
            return (
              <tr key={ind.k} style={{ borderTop: `1px solid ${cor.bordaSuave}` }}>
                <td style={{ ...td, color: cor.textoSub }}>{ind.nome}</td>
                {idx.map((ii, j) => (
                  <td key={j} style={{ ...td, textAlign: 'right', color: cor.textoSub, background: colunas[j].origem === 'complemento' ? cor.destaque : undefined }}>
                    {ind.fmt(ii[ind.k])}
                  </td>
                ))}
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: piorou ? cor.alerta : cor.textoSub }}>
                  {a !== null && b !== null ? (b > a ? 'subiu' : b < a ? 'caiu' : 'igual') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

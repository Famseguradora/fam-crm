'use client'

/* MESA DE TRIAGEM — a segunda estação da esteira.

   Aqui o par (pessoa + agente) confere o que chegou e faz o cadastro único do
   tomador. Tudo acontece nesta tela: não há botão fora do sistema, e o caso só
   anda quando alguém conclui.

   Três regras que estão desenhadas na tela, e não escondidas no código:

   1. O CNPJ é a chave. Sem ele o botão de concluir não liga, porque é o CNPJ que
      junta caso, cadastro e análise — e é a falta dele que hoje deixa 213
      tomadores fora da conferência.
   2. Pendência de documento NÃO trava a esteira. Ela fica escrita, viaja no aviso
      e o analista decide. Travar aqui só empurraria o trabalho para fora do
      sistema, que é exatamente o que estamos desfazendo.
   3. O que a pessoa decide vence o que o robô achou: item marcado à mão fica
      marcado como `humano` e a releitura não o desfaz. */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { use as usePromise } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { maskCNPJ, validarCNPJ, fmtData } from '@/lib/utils'
import { consultarCNPJ } from '@/lib/cnpj'

const CLASSES: { valor: string; rotulo: string }[] = [
  { valor: 'contabil', rotulo: 'Demonstração contábil' },
  { valor: 'serasa_pj', rotulo: 'Serasa PJ (tomador)' },
  { valor: 'serasa_pf', rotulo: 'Serasa PF (sócio)' },
  { valor: 'contrato_social', rotulo: 'Contrato social' },
  { valor: 'acordo_socios', rotulo: 'Acordo de sócios' },
  { valor: 'cartao_cnpj', rotulo: 'Cartão CNPJ' },
  { valor: 'outro', rotulo: 'Outro documento' },
]

const SITUACOES: { valor: string; rotulo: string; badge: string }[] = [
  { valor: 'ok', rotulo: 'Recebido', badge: 'badge-green' },
  { valor: 'a_caminho', rotulo: 'A caminho', badge: 'badge-blue' },
  { valor: 'duvida', rotulo: 'Em dúvida', badge: 'badge-yellow' },
  { valor: 'dispensado', rotulo: 'Dispensado', badge: 'badge-gray' },
  { valor: 'faltando', rotulo: 'Faltando', badge: 'badge-red' },
]

interface Caso {
  id: string; numero: number; assunto: string
  remetente_nome: string | null; remetente_email: string | null
  recebido_em: string | null; corpo: string | null
  cnpj: string | null; razao_social: string | null
  corretora_texto: string | null; produto: string | null
  etapa: string; tomador_id: string | null; criado_em: string
  criado_por_nome: string | null
  analise_fila_id: string | null
}

interface Documento {
  id: string; nome: string; classe: string; certeza: string
  nao_lido: boolean; bytes: number | null; anexo_id: string | null
  anexos: { storage_path: string } | null
}

interface Item {
  id: string; item: string; situacao: string; por: string
  detalhe: string | null
  caso_item_catalogo: { nome: string; exigencia: string; frase_falta: string | null; ordem: number }
}

const fmtBytes = (b: number | null) =>
  !b ? '' : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

export default function TriagemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params)
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [caso, setCaso] = useState<Caso | null>(null)
  const [docs, setDocs] = useState<Documento[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [verCorpo, setVerCorpo] = useState(false)
  const [buscandoReceita, setBuscandoReceita] = useState(false)

  // rascunho da identificação
  const [cnpj, setCnpj] = useState('')
  const [razao, setRazao] = useState('')
  const [corretora, setCorretora] = useState('')
  const [produto, setProduto] = useState('')

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data: c } = await supabase.from('casos').select('*').eq('id', id).maybeSingle()
    if (!c) { setErro('Caso não encontrado.'); setCarregando(false); return }
    setCaso(c as Caso)
    setCnpj((c as Caso).cnpj ?? '')
    setRazao((c as Caso).razao_social ?? '')
    setCorretora((c as Caso).corretora_texto ?? '')
    setProduto((c as Caso).produto ?? '')

    const { data: d } = await supabase
      .from('caso_documentos')
      .select('id, nome, classe, certeza, nao_lido, bytes, anexo_id, anexos(storage_path)')
      .eq('caso_id', id)
      .order('criado_em')
    setDocs((d ?? []) as unknown as Documento[])

    const { data: i } = await supabase
      .from('caso_itens')
      .select('id, item, situacao, por, detalhe, caso_item_catalogo!inner(nome, exigencia, frase_falta, ordem)')
      .eq('caso_id', id)
    const lista = ((i ?? []) as unknown as Item[]).sort(
      (a, b) => a.caso_item_catalogo.ordem - b.caso_item_catalogo.ordem,
    )
    setItens(lista)
    setCarregando(false)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  async function salvarIdentificacao() {
    setSalvando(true); setErro(''); setRecado('')
    const supabase = createClient()
    const digitos = cnpj.replace(/\D/g, '')
    if (digitos && !validarCNPJ(digitos)) {
      setErro('CNPJ inválido: confira os dígitos.'); setSalvando(false); return
    }
    const { data, error } = await supabase
      .from('casos')
      .update({
        cnpj: digitos || null,
        razao_social: razao.trim() || null,
        corretora_texto: corretora.trim() || null,
        produto: produto.trim() || null,
        identificado_por: 'humano',
      })
      .eq('id', id)
      .select('id')
    setSalvando(false)
    // Escrita barrada por RLS volta zero linha e nenhum erro: por isso o teste é
    // pelo que voltou, e não pela ausência de erro.
    if (error || !data?.length) { setErro(error?.message ?? 'Você não tem permissão para editar este caso.'); return }
    setRecado('Identificação salva.')
    await carregar()
  }

  // Usa a MESMA consulta do botão Receita do Cadastro e da tela de Operações
  // (`lib/cnpj.ts`). Escrever um fetch próprio aqui traria dois defeitos de
  // graça: a razão social viria em CAIXA ALTA (o `tituloReceita` é que a põe em
  // Título) e "CNPJ inexistente" ficaria com a mesma mensagem de "a Receita caiu".
  async function buscarNaReceita() {
    const digitos = cnpj.replace(/\D/g, '')
    if (digitos.length !== 14) { setErro('Digite o CNPJ completo para buscar.'); return }
    setBuscandoReceita(true); setErro('')
    try {
      const cartao = await consultarCNPJ(digitos)
      setRazao(cartao.razao_social)
      setRecado(`Receita: ${cartao.razao_social}${cartao.situacao ? ' · ' + cartao.situacao : ''}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui consultar a Receita agora.')
    }
    setBuscandoReceita(false)
  }

  // As duas funções abaixo pintam a tela antes de a gravação voltar (a espera
  // por clique tornaria o checklist arrastado). Mas se a gravação falhar, a tela
  // VOLTA ao que era e diz o motivo: senão o item ficaria "Recebido" aqui e
  // reapareceria como pendência na hora de concluir, sem explicação nenhuma.
  async function trocarClasse(docId: string, classe: string) {
    const supabase = createClient()
    const antes = docs
    setDocs((ds) => ds.map((d) => (d.id === docId ? { ...d, classe, certeza: 'alta' } : d)))
    const { data, error } = await supabase
      .from('caso_documentos')
      .update({ classe, certeza: 'alta', classificado_por: 'humano' })
      .eq('id', docId)
      .select('id')
    if (error || !data?.length) {
      setDocs(antes)
      setErro(error?.message ?? 'Não consegui gravar o tipo do documento (sem permissão de escrita).')
    }
  }

  async function marcarItem(itemId: string, situacao: string) {
    const supabase = createClient()
    const antes = itens
    setItens((is) => is.map((i) => (i.id === itemId ? { ...i, situacao, por: 'humano' } : i)))
    const { data: sessao } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('caso_itens')
      .update({
        situacao,
        por: 'humano',
        decidido_em: new Date().toISOString(),
        decidido_por: sessao.user?.email ?? null,
      })
      .eq('id', itemId)
      .select('id')
    if (error || !data?.length) {
      setItens(antes)
      setErro(error?.message ?? 'Não consegui gravar esta decisão (sem permissão de escrita).')
    }
  }

  async function abrirDocumento(doc: Documento) {
    if (!doc.anexos?.storage_path) { setErro('Este documento não tem arquivo guardado.'); return }
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('fam-anexos')
      .createSignedUrl(doc.anexos.storage_path, 300)
    if (error || !data) { setErro('Não consegui abrir o arquivo: ' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  /* MANDAR PARA A ANÁLISE À MÃO. O caminho normal é o `concluir` aqui embaixo,
     que já põe o caso na esteira. Este botão é a saída para os casos concluídos
     ANTES de a esteira existir (07/09/2026), e para quando a criação da linha
     falhou no meio do concluir e o cadastro ficou feito sem a análise entrar.
     A regra é a mesma dos dois lados (`lib/analise/abrir-fila.ts`). */
  async function mandarParaAnalise() {
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/analisar`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui mandar para a análise.'); setSalvando(false); return }
      setRecado(j.ja_existia
        ? 'Este caso já estava na esteira da análise.'
        : `Entrou na esteira da análise, na pasta "${j.fila.pasta}".`)
      await carregar()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  async function concluir() {
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/concluir`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui concluir.'); setSalvando(false); return }
      const falta = j.bloqueios?.length ? ` Falta ainda: ${j.bloqueios.join(' · ')}.` : ''
      setRecado(
        (j.criado ? 'Tomador cadastrado' : 'Tomador já existia e foi vinculado') +
        `: ${j.tomador.razao_social}. ${j.documentos_movidos} documento(s) foram para a ficha dele.` +
        ` O caso entrou na fila de análise.${falta}`,
      )
      // O cadastro deu certo, mas se os documentos não migraram isso NÃO pode
      // sair calado: a ficha do tomador ficaria vazia sem ninguém saber por quê.
      if (j.aviso_documentos) setErro(j.aviso_documentos)
      await carregar()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  if (carregando) return <div style={{ padding: 24, color: 'var(--soft)' }}>Carregando…</div>
  if (!caso) return <div style={{ padding: 24 }} className="alert-error">{erro || 'Caso não encontrado.'}</div>

  const podeEditar = !somenteLeitura && !caso.tomador_id
  const cnpjOk = cnpj.replace(/\D/g, '').length === 14
  const pendentes = itens.filter((i) => !['ok', 'dispensado'].includes(i.situacao))
  const bloqueando = pendentes.filter((i) => i.caso_item_catalogo.exigencia === 'bloqueia')

  return (
    <div style={{ padding: '20px 0' }}>
      {/* ── cabeçalho ── */}
      <button onClick={() => router.push('/comercial')} className="btn-clear" style={{ marginBottom: 12 }}>
        ← Voltar para a entrada
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: '#0a1628', margin: 0 }}>
          Caso #{caso.numero}
        </h1>
        {caso.tomador_id && <span className="badge badge-green">na fila de análise</span>}
      </div>
      <p style={{ color: 'var(--soft)', fontSize: 14, margin: '4px 0 18px' }}>
        {caso.assunto} · de {caso.remetente_nome ?? 'remetente desconhecido'}
        {caso.remetente_email ? ` (${caso.remetente_email})` : ''} · entrou em {fmtData(caso.criado_em)}
        {caso.criado_por_nome ? ` por ${caso.criado_por_nome}` : ''}
      </p>

      {erro && <div className="alert-error" style={{ marginBottom: 14 }}>{erro}</div>}
      {recado && <div className="alert-success" style={{ marginBottom: 14 }}>{recado}</div>}

      {/* `auto-fit` em vez de duas colunas fixas: no celular as duas viram uma
          sozinhas, sem media query e sem classe nova no globals.css. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 16, alignItems: 'start' }}>
        {/* ── coluna esquerda: documentos ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="card-panel">
            <div className="section-title"><span className="dot" />Documentos que vieram no e-mail</div>
            {docs.length === 0 ? (
              <p style={{ color: 'var(--soft)', fontSize: 14 }}>
                Nenhum documento neste caso. O e-mail veio sem anexo útil.
              </p>
            ) : (
              <div className="fam-table-wrap">
                <table className="fam-table">
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th style={{ width: 200 }}>É o quê</th>
                      <th style={{ width: 78 }}>Tamanho</th>
                      <th style={{ width: 74 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{d.nome}</div>
                          {d.certeza === 'nula' && (
                            <div style={{ fontSize: 12, color: '#a02020' }}>não consegui abrir</div>
                          )}
                        </td>
                        <td>
                          <select
                            className="fam-input" value={d.classe} disabled={!podeEditar}
                            onChange={(e) => trocarClasse(d.id, e.target.value)}
                            style={{ fontSize: 13, padding: '5px 8px' }}
                          >
                            {CLASSES.map((c) => (
                              <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ color: 'var(--soft)' }}>{fmtBytes(d.bytes)}</td>
                        <td>
                          <button className="btn-clear" onClick={() => abrirDocumento(d)}>abrir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* corpo do e-mail: é onde moram corretora, produto e condições */}
          {caso.corpo && (
            <div className="card-panel">
              <div
                className="section-title"
                style={{ cursor: 'pointer', marginBottom: verCorpo ? 14 : 0 }}
                onClick={() => setVerCorpo((v) => !v)}
              >
                <span className="dot" />O que o e-mail dizia {verCorpo ? '▾' : '▸'}
              </div>
              {verCorpo && (
                <pre style={{
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                  fontSize: 13.5, color: '#26374a', margin: 0, maxHeight: 340, overflowY: 'auto',
                }}>{caso.corpo}</pre>
              )}
            </div>
          )}
        </div>

        {/* ── coluna direita: identificação + checklist + concluir ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="card-panel">
            <div className="section-title"><span className="dot" />Quem é o tomador</div>

            <div className="form-field" style={{ marginBottom: 12 }}>
              <label className="form-label">CNPJ</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="fam-input" value={maskCNPJ(cnpj)} disabled={!podeEditar}
                  onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  placeholder="00.000.000/0000-00" inputMode="numeric"
                />
                <button
                  className="btn-secondary" onClick={buscarNaReceita}
                  disabled={!podeEditar || !cnpjOk || buscandoReceita}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {buscandoReceita ? '…' : 'Receita'}
                </button>
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: 12 }}>
              <label className="form-label">Razão social</label>
              <input className="fam-input" value={razao} disabled={!podeEditar}
                onChange={(e) => setRazao(e.target.value)} />
            </div>

            <div className="form-field" style={{ marginBottom: 12 }}>
              <label className="form-label">Corretora (como veio no e-mail)</label>
              <input className="fam-input" value={corretora} disabled={!podeEditar}
                onChange={(e) => setCorretora(e.target.value)} />
            </div>

            <div className="form-field" style={{ marginBottom: 14 }}>
              <label className="form-label">Produto</label>
              <input className="fam-input" value={produto} disabled={!podeEditar}
                onChange={(e) => setProduto(e.target.value)}
                placeholder="Garantia Executante, Judicial…" />
            </div>

            {podeEditar && (
              <button className="btn-secondary" onClick={salvarIdentificacao} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar identificação'}
              </button>
            )}
          </div>

          <div className="card-panel">
            <div className="section-title"><span className="dot" />O que a política exige</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {itens.map((i) => {
                const s = SITUACOES.find((x) => x.valor === i.situacao) ?? SITUACOES[4]
                return (
                  <div key={i.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0a1628' }}>
                        {i.caso_item_catalogo.nome}
                      </span>
                      <span className={`badge ${s.badge}`}>{s.rotulo}</span>
                      {i.caso_item_catalogo.exigencia === 'bloqueia' && !['ok', 'dispensado'].includes(i.situacao) && (
                        <span style={{ fontSize: 11.5, color: '#a02020' }}>
                          {i.caso_item_catalogo.frase_falta}
                        </span>
                      )}
                      {i.por === 'humano' && (
                        <span style={{ fontSize: 11, color: 'var(--soft)' }}>decidido por pessoa</span>
                      )}
                    </div>
                    {podeEditar && (
                      <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                        {SITUACOES.map((op) => (
                          <button
                            key={op.valor} onClick={() => marcarItem(i.id, op.valor)}
                            className="btn-clear"
                            style={{
                              fontSize: 11.5, padding: '4px 9px',
                              background: i.situacao === op.valor ? '#1e4080' : undefined,
                              color: i.situacao === op.valor ? '#fff' : undefined,
                              borderColor: i.situacao === op.valor ? '#1e4080' : undefined,
                            }}
                          >
                            {op.rotulo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── concluir ── */}
          {!caso.tomador_id ? (
            <div className="card-panel" style={{ borderColor: cnpjOk ? '#e8b84b' : 'var(--border)' }}>
              <div className="section-title"><span className="dot" />Concluir a triagem</div>
              <p style={{ fontSize: 13, color: 'var(--soft)', margin: '0 0 12px' }}>
                {cnpjOk
                  ? 'Cria o cadastro do tomador (ou reaproveita, se o CNPJ já existir), leva os documentos para a ficha dele e avisa a equipe que entrou na fila de análise.'
                  : 'Preencha e salve o CNPJ primeiro: é ele que liga o caso ao cadastro e à análise.'}
              </p>
              {bloqueando.length > 0 && cnpjOk && (
                <p style={{ fontSize: 12.5, color: '#8a6410', background: '#fdf4dd', border: '1px solid #e8b84b', borderRadius: 8, padding: '8px 10px', margin: '0 0 12px' }}>
                  Falta {bloqueando.map((i) => i.caso_item_catalogo.nome).join(' · ')}. Dá para concluir assim
                  mesmo: a pendência viaja junto e quem decide se a análise começa é o analista.
                </p>
              )}
              <button
                className="btn-primary" onClick={concluir}
                disabled={!podeEditar || !cnpjOk || salvando || caso.cnpj !== cnpj.replace(/\D/g, '')}
              >
                {salvando ? 'Concluindo…' : 'Concluir e enviar para análise'}
              </button>
              {cnpjOk && caso.cnpj !== cnpj.replace(/\D/g, '') && (
                <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 6 }}>
                  Salve a identificação antes de concluir.
                </div>
              )}
            </div>
          ) : (
            <div className="card-panel">
              <div className="section-title"><span className="dot" />Cadastro feito</div>
              <p style={{ fontSize: 13, color: 'var(--soft)', margin: '0 0 12px' }}>
                {caso.analise_fila_id
                  ? 'Este caso já virou cadastro de tomador e está na esteira da análise de crédito.'
                  : 'Este caso já virou cadastro de tomador, mas não está na esteira da análise.'}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {caso.analise_fila_id ? (
                  <button className="btn-secondary" onClick={() => router.push('/analises')}>
                    Ver na esteira da análise →
                  </button>
                ) : (
                  <button className="btn-primary" onClick={mandarParaAnalise} disabled={!podeEditar || salvando}>
                    {salvando ? 'Mandando…' : 'Mandar para a análise'}
                  </button>
                )}
              </div>
              <button className="btn-secondary" onClick={() => router.push(`/tomadores/${caso.tomador_id}`)}>
                Abrir a ficha do tomador →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

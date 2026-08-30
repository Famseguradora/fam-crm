'use client'

/* A TELA DE CONFERÊNCIA — passo 4 do tomador único.

   Esta é a única porta pela qual a análise de crédito pode alterar o cadastro
   do tomador. A carga das 131 análises não escreve em `tomadores`: ela mede,
   compara e deixa aqui tudo que não casou, com os dois valores lado a lado e o
   motivo escrito. Quem decide é o Marco, em lote.

   As três travas, que são o ponto da tela:

   1. Só é aplicável a linha que TEM sugestão. Onde a carga não teve certeza,
      não há botão: ele lê e resolve à mão. Um palpite aprovado em lote é
      exatamente o acidente que esta tela existe para evitar.
   2. Antes de gravar, a tela mostra a lista do que vai mudar, campo a campo.
      Aprovar em lote não pode ser aprovar às cegas.
   3. Toda alteração em `tomadores` já é gravada em `fam_historico` por trigger,
      com o antes e o depois. A rede existe e é mencionada na tela de propósito,
      para ele decidir sabendo que dá para voltar. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'

// ─────────────────────────────────────────────────────────────
// Os grupos, na ordem em que ele pediu
// ─────────────────────────────────────────────────────────────
type Tipo = 'sem_chave' | 'razao_divergente' | 'limite_divergente'
  | 'limite_incerto' | 'status_contraditorio' | 'dado_fora_do_padrao'

const GRUPOS: { tipo: Tipo; titulo: string; explica: string; badge: string }[] = [
  { tipo: 'sem_chave', titulo: 'Sem chave', badge: 'badge-red',
    explica: 'Análise e tomador que não dá para casar por CNPJ. É o que trava tudo o resto.' },
  { tipo: 'razao_divergente', titulo: 'Razão social divergente', badge: 'badge-orange',
    explica: 'A análise apurou o nome no contrato social; a triagem só chutou. Trocar só com a sua aprovação.' },
  { tipo: 'limite_divergente', titulo: 'Limite divergente', badge: 'badge-yellow',
    explica: 'Limite aprovado no CRM contra limite recomendado pela análise. Os dois coexistem: a análise recomenda, o comitê aprova.' },
  { tipo: 'limite_incerto', titulo: 'Limite sem número confiável', badge: 'badge-purple',
    explica: 'O texto da análise não dá um número que se possa usar, ou dá um número que ele mesmo desmente (teórico, teto da FAM, bloqueado, condicionado). O campo ficou nulo em vez de chutado, e por isso nada aqui é aplicável em lote: leia o texto e resolva à mão.' },
  { tipo: 'status_contraditorio', titulo: 'Status que se contradizem', badge: 'badge-blue',
    explica: 'Status do tomador e decisão da análise são eixos diferentes. Nada é copiado de um para o outro.' },
  { tipo: 'dado_fora_do_padrao', titulo: 'Dado fora do padrão', badge: 'badge-gray',
    explica: 'Não impede nada; é para você olhar. Score acima de 10, rating sem código, taxa em branco.' },
]

/** Onde cada tipo escreve, quando ele aprova. O que não está aqui NÃO é aplicável. */
const CAMPO_DESTINO: Record<string, { coluna: 'razao_social' | 'cnpj' | 'limite_aprovado'; rotulo: string }> = {
  razao_social: { coluna: 'razao_social', rotulo: 'Razão social' },
  cnpj_tomador: { coluna: 'cnpj', rotulo: 'CNPJ' },
  limite_aprovado: { coluna: 'limite_aprovado', rotulo: 'Limite aprovado' },
}

interface Conflito {
  id: string
  tipo: Tipo
  campo: string
  valor_crm: string | null
  valor_analise: string | null
  sugestao: string | null
  candidatos: string[] | null
  motivo: string
  situacao: 'aberto' | 'aplicado' | 'ignorado'
  decidido_por: string | null
  decidido_em: string | null
  tomador_id: string | null
  analise_id: string | null
  analises: { razao_social: string; chave_local: string } | null
  tomadores: { razao_social: string } | null
}

/** Aplicável = tem sugestão, tem tomador, e o campo tem destino conhecido. */
const aplicavel = (c: Conflito) =>
  !!c.sugestao && !!c.tomador_id && !!CAMPO_DESTINO[c.campo] && c.situacao === 'aberto'

export default function ConferenciaPage() {
  const supabase = useMemo(() => createClient(), [])
  const [conflitos, setConflitos] = useState<Conflito[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [grupo, setGrupo] = useState<Tipo>('sem_chave')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [verResolvidos, setVerResolvidos] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [recado, setRecado] = useState<string | null>(null)
  const [quem, setQuem] = useState<string>('')
  /** Canal do "ao vivo" conectado, e quando chegou a última decisão. */
  const [ligado, setLigado] = useState(false)
  const [aoVivo, setAoVivo] = useState<number | null>(null)

  /* Um analista só. Quem não é continua entrando e lendo tudo — é de
     propósito, ele quer a equipe acompanhando — mas sem nenhum botão de
     decidir. A trava de verdade é a RLS `fam_e_analista()`: sem ela isto
     seria só um `if` de desenho, e o dado já teria ido para o navegador. */
  const { editaAnalise } = usePermissoes()

  // ── carregar ──────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('analise_conflitos')
      .select('id, tipo, campo, valor_crm, valor_analise, sugestao, candidatos, motivo, situacao, decidido_por, decidido_em, tomador_id, analise_id, analises(razao_social, chave_local), tomadores(razao_social)')
      .order('tipo')
      .limit(2000)
    if (error) setErro(error.message)
    else { setConflitos((data ?? []) as unknown as Conflito[]); setErro(null) }
    setCarregando(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setQuem(user?.email ?? 'desconhecido'))
  }, [supabase])

  /* ── AO VIVO ────────────────────────────────────────────────
     Pedido dele: que a equipe o veja trabalhando. Quem está só acompanhando
     vê o contador cair sozinho, na hora em que o analista decide, sem F5.

     Por que isto é seguro: o Realtime do Supabase obedece à mesma RLS da
     consulta. LER conflito é liberado para todo autenticado, então todos
     recebem o aviso; ESCREVER é só do analista, então só o trabalho dele
     gera evento. Assistir sem poder tocar.

     Quem edita fica de fora do canal de propósito: a própria tela dele já
     recarrega ao gravar, e receber de volta o próprio eco recarregaria a
     lista no meio de uma seleção em lote, perdendo o que ele marcou. */
  useEffect(() => {
    if (editaAnalise) return

    const canal = supabase
      .channel('conferencia-ao-vivo')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'analise_conflitos' },
        () => { setAoVivo(Date.now()); carregar() })
      .subscribe(estado => setLigado(estado === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(canal) }
  }, [supabase, editaAnalise, carregar])

  // ── recorte da tela ───────────────────────────────────────
  const doGrupo = useMemo(
    () => conflitos.filter(c => c.tipo === grupo && (verResolvidos || c.situacao === 'aberto')),
    [conflitos, grupo, verResolvidos])

  const contaAberto = useCallback(
    (t: Tipo) => conflitos.filter(c => c.tipo === t && c.situacao === 'aberto').length,
    [conflitos])

  const marcadosAplicaveis = useMemo(
    () => doGrupo.filter(c => marcados.has(c.id) && aplicavel(c)),
    [doGrupo, marcados])
  const marcadosTodos = useMemo(
    () => doGrupo.filter(c => marcados.has(c.id) && c.situacao === 'aberto'),
    [doGrupo, marcados])

  const alternar = (id: string) => setMarcados(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const marcarTodosAplicaveis = () =>
    setMarcados(new Set(doGrupo.filter(aplicavel).map(c => c.id)))

  // ── aplicar: o único ponto que escreve em `tomadores` ─────
  async function aplicar() {
    setGravando(true)
    setRecado(null)
    const agora = new Date().toISOString()
    let ok = 0
    const falhas: string[] = []

    for (const c of marcadosAplicaveis) {
      const destino = CAMPO_DESTINO[c.campo]
      // limite vem como texto no relatório; vira número aqui, e só se for número.
      let valor: string | number | null = c.sugestao
      if (destino.coluna === 'limite_aprovado') {
        const n = Number(c.sugestao)
        if (!Number.isFinite(n)) { falhas.push(`${c.tomadores?.razao_social ?? c.id}: sugestão não é número`); continue }
        valor = n
      }

      // O `.select()` NÃO é enfeite. Quando a permissão de escrita do CRM
      // (`fam_pode_escrever`) barra o usuário, o Supabase devolve ZERO linhas e
      // NENHUM erro. Sem conferir o que voltou, a tela diria "3 aplicados" com
      // o cadastro intacto, que é a pior mentira que ela poderia contar.
      const { data: mexeu, error: e1 } = await supabase.from('tomadores')
        .update({ [destino.coluna]: valor }).eq('id', c.tomador_id!).select('id')
      if (e1) { falhas.push(`${c.tomadores?.razao_social ?? c.id}: ${e1.message}`); continue }
      if (!mexeu?.length) {
        falhas.push(`${c.tomadores?.razao_social ?? c.id}: seu usuário não tem permissão de escrita em tomadores`)
        continue
      }

      const { error: e2 } = await supabase.from('analise_conflitos')
        .update({ situacao: 'aplicado', decidido_por: quem, decidido_em: agora }).eq('id', c.id)
      if (e2) { falhas.push(`${c.tomadores?.razao_social ?? c.id}: gravou no tomador mas não marcou o conflito (${e2.message})`); continue }
      ok++
    }

    setGravando(false)
    setConfirmando(false)
    setMarcados(new Set())
    setRecado(falhas.length
      ? `${ok} aplicados. ${falhas.length} não deram certo: ${falhas.slice(0, 3).join(' · ')}`
      : `${ok} aplicados no cadastro do tomador. O antes e o depois ficaram gravados no histórico.`)
    await carregar()
  }

  async function ignorar() {
    setGravando(true)
    const agora = new Date().toISOString()
    const ids = marcadosTodos.map(c => c.id)
    const { error } = await supabase.from('analise_conflitos')
      .update({ situacao: 'ignorado', decidido_por: quem, decidido_em: agora }).in('id', ids)
    setGravando(false)
    setMarcados(new Set())
    setRecado(error ? `Não consegui marcar como resolvido: ${error.message}`
      : `${ids.length} marcados como resolvidos sem alterar o cadastro.`)
    await carregar()
  }

  const g = GRUPOS.find(x => x.tipo === grupo)!
  const totalAberto = conflitos.filter(c => c.situacao === 'aberto').length

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 0' }}>
      {/* cabeçalho */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a1628', margin: 0 }}>
            Conferência da análise de crédito
          </h1>
          {/* Só para quem acompanha: o selo prova que a tela está viva, e não
              que o trabalho parou. Sem ele, uma fila que não anda e uma tela
              desconectada são a mesma imagem. */}
          {!editaAnalise && (
            <span title={ligado
              ? 'Esta tela se atualiza sozinha quando o analista decide algo.'
              : 'Sem conexão ao vivo — recarregue para ver as decisões novas.'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 11, fontWeight: 700, letterSpacing: .3, padding: '3px 9px',
                borderRadius: 999, textTransform: 'uppercase',
                background: ligado ? '#e6f9f0' : '#f2f4f7',
                border: `1px solid ${ligado ? '#b8e6cf' : '#dde2e8'}`,
                color: ligado ? '#1a7a50' : '#8a94a2',
              }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: ligado ? '#22a06b' : '#b0b8c2',
                boxShadow: ligado ? '0 0 0 3px rgba(34,160,107,.18)' : 'none',
              }} />
              {ligado ? 'ao vivo' : 'sem conexão'}
            </span>
          )}
          {aoVivo && (
            <span style={{ fontSize: 12, color: 'var(--soft)' }}>
              o analista acabou de decidir algo
            </span>
          )}
        </div>
        <p style={{ color: 'var(--soft)', fontSize: 14, margin: '6px 0 0' }}>
          Tudo que a carga das análises não conseguiu casar com o cadastro, com os dois valores lado a lado.
          Nada aqui alterou o cadastro sozinho: <strong>{editaAnalise
            ? 'quem decide é você'
            : 'quem decide é o analista de crédito'}</strong>.
          {' '}<strong>{totalAberto}</strong> em aberto de {conflitos.length}.
        </p>
      </div>

      {/* os grupos */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 18,
      }}>
        {GRUPOS.map(x => {
          const n = contaAberto(x.tipo)
          const ativo = x.tipo === grupo
          return (
            <button key={x.tipo} onClick={() => { setGrupo(x.tipo); setMarcados(new Set()) }}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 10,
                border: ativo ? '2px solid var(--blue-600)' : '1px solid var(--border)',
                background: ativo ? '#e8f0fa' : 'white',
                boxShadow: ativo ? '0 2px 10px rgba(30,64,128,.12)' : 'none',
              }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: n ? '#102040' : '#9ab' }}>{n}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a3560', marginTop: 2 }}>{x.titulo}</div>
            </button>
          )
        })}
      </div>

      <div className="card-panel">
        <div className="section-title"><span className="dot" />{g.titulo}</div>
        <p style={{ color: 'var(--soft)', fontSize: 13, marginTop: -6, marginBottom: 14 }}>{g.explica}</p>

        {/* barra de ações */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {editaAnalise && <>
          <button className="btn-secondary" onClick={marcarTodosAplicaveis}
            disabled={!doGrupo.some(aplicavel)}>
            Marcar os aplicáveis ({doGrupo.filter(aplicavel).length})
          </button>
          <button className="btn-clear" onClick={() => setMarcados(new Set())} disabled={!marcados.size}>
            Limpar seleção
          </button>
          <div style={{ flex: 1 }} />
          <label style={{ fontSize: 12, color: 'var(--soft)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={verResolvidos} onChange={e => setVerResolvidos(e.target.checked)} />
            mostrar os já resolvidos
          </label>
          <button className="btn-secondary" onClick={ignorar}
            disabled={!marcadosTodos.length || gravando}>
            Resolver sem alterar ({marcadosTodos.length})
          </button>
          <button className="btn-primary" onClick={() => setConfirmando(true)}
            disabled={!marcadosAplicaveis.length || gravando}>
            Aplicar ao cadastro ({marcadosAplicaveis.length})
          </button>
          </>}

          {!editaAnalise && (
            <>
              <span style={{ fontSize: 13, color: 'var(--soft)' }}>
                Você está <strong>acompanhando</strong>. Quem decide o que entra no
                cadastro é o analista de crédito.
              </span>
              <div style={{ flex: 1 }} />
              <label style={{ fontSize: 12, color: 'var(--soft)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={verResolvidos} onChange={e => setVerResolvidos(e.target.checked)} />
                mostrar os já resolvidos
              </label>
            </>
          )}
        </div>

        {recado && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
            background: '#e6f9f0', border: '1px solid #b8e6cf', color: '#1a7a50',
          }}>{recado}</div>
        )}
        {erro && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
            background: '#fbeaea', border: '1px solid #f0c0c0', color: '#a02020',
          }}>Não consegui ler os conflitos: {erro}</div>
        )}

        {/* a tabela */}
        {carregando ? (
          <p style={{ color: 'var(--soft)', fontSize: 14 }}>lendo…</p>
        ) : !doGrupo.length ? (
          <p style={{ color: 'var(--soft)', fontSize: 14 }}>
            Nada em aberto neste grupo.
          </p>
        ) : (
          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th>Empresa</th>
                  <th>No CRM</th>
                  <th>Na análise</th>
                  <th>O que a carga propõe</th>
                  <th>Por quê</th>
                </tr>
              </thead>
              <tbody>
                {doGrupo.map(c => {
                  const pode = aplicavel(c)
                  const resolvido = c.situacao !== 'aberto'
                  return (
                    <tr key={c.id} style={resolvido ? { opacity: 0.5 } : undefined}>
                      <td>
                        {editaAnalise && (
                          <input type="checkbox" checked={marcados.has(c.id)}
                            disabled={resolvido}
                            onChange={() => alternar(c.id)} />
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: '#102040', maxWidth: 260 }}>
                        {c.tomadores?.razao_social ?? c.analises?.razao_social ?? '(sem nome)'}
                        {resolvido && (
                          <span className={c.situacao === 'aplicado' ? 'badge badge-green' : 'badge badge-gray'}
                            style={{ marginLeft: 8 }}>
                            {c.situacao}
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: 240, color: '#405a75' }}>{c.valor_crm ?? '—'}</td>
                      <td style={{ maxWidth: 300 }}>{c.valor_analise ?? '—'}</td>
                      <td style={{ maxWidth: 220 }}>
                        {pode ? (
                          <span className="badge badge-green">
                            {CAMPO_DESTINO[c.campo].rotulo} → {c.sugestao}
                          </span>
                        ) : c.candidatos?.length ? (
                          <span style={{ fontSize: 12, color: '#a05010' }}>
                            {c.candidatos.length} CNPJs candidatos: {c.candidatos.join(' · ')}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--soft)', fontStyle: 'italic' }}>
                            sem proposta — resolver à mão
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--soft)', maxWidth: 380 }}>{c.motivo}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* confirmação: aprovar em lote não pode ser aprovar às cegas */}
      {confirmando && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,22,40,.55)', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => !gravando && setConfirmando(false)}>
          <div className="card-panel" style={{ maxWidth: 700, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="section-title"><span className="dot" />
              Vai alterar {marcadosAplicaveis.length} tomador(es)
            </div>
            <p style={{ fontSize: 13, color: 'var(--soft)', marginTop: -6 }}>
              Isto escreve no cadastro. O antes e o depois ficam gravados no histórico do CRM,
              então dá para voltar, mas confira antes.
            </p>
            <div className="fam-table-wrap" style={{ margin: '12px 0' }}>
              <table className="fam-table">
                <thead><tr><th>Empresa</th><th>Campo</th><th>De</th><th>Para</th></tr></thead>
                <tbody>
                  {marcadosAplicaveis.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.tomadores?.razao_social ?? '(sem nome)'}</td>
                      <td>{CAMPO_DESTINO[c.campo].rotulo}</td>
                      <td style={{ color: '#a02020' }}>{c.valor_crm ?? '(vazio)'}</td>
                      <td style={{ color: '#1a7a50', fontWeight: 600 }}>{c.sugestao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-clear" onClick={() => setConfirmando(false)} disabled={gravando}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={aplicar} disabled={gravando}>
                {gravando ? 'gravando…' : 'Confirmar e aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

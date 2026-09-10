'use client'


// ============================================================================
//  O ACERVO DAS ANÁLISES DE CRÉDITO — /analises/acervo
//
//  A porta que faltava. Até 07/09/2026 as 146 análises publicadas no banco só
//  eram alcançáveis por dentro de um tomador — e as que nenhum tomador do CRM
//  alcança (20 com CNPJ que não existe no cadastro, 5 sem CNPJ apurado) não
//  tinham porta nenhuma: a única lista de análises que existia era a do
//  Sistema de Análise, em `127.0.0.1:7311`, na máquina do Marco.
//
//  Esta tela lê o Supabase. Funciona no CRM publicado, em outro computador e
//  no celular, que é a diferença entre o sistema estar DENTRO do CRM ou apenas
//  aparecer dentro dele por um iframe.
//
//  DECISÕES QUE VALEM A PENA SABER
//
//   • As 146 vêm de uma vez. É pouco dado (uma linha por análise, sem o corpo
//     do relatório) e paginar aqui esconderia justamente o que ele procura
//     quando abre esta tela: uma empresa pelo nome.
//   • "Vigentes" nasce LIGADO. Uma reanálise rebaixa a anterior para histórica,
//     e o normal é querer a que vale hoje. Desligar mostra as versões antigas,
//     que continuam no banco e continuam valendo como registro.
//   • A coluna "No CRM" não é enfeite: análise sem tomador ligado é análise que
//     não chega na ficha de ninguém, e é assim que se enxerga o buraco.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtData, maskCNPJ, semEntidadesHtml } from '@/lib/utils'
import { fmtScore } from '@/components/analise/Relatorio'
import { semMarcador } from '@/lib/analise/ficha'
import { PortaDoRelatorio, SemSistemaLocal } from '@/components/analise/PortaDoRelatorio'

interface LinhaAcervo {
  id: string
  /** CNPJ + data. É como o Sistema de Análise conhece esta análise, e o que
   *  abre o relatório de verdade em 127.0.0.1:7311. */
  chave_local: string | null
  cnpj: string | null
  razao_social: string
  nome_curto: string | null
  corretora: string | null
  grupo: string | null
  data_analise: string
  versao: number
  vigente: boolean
  revisada: boolean
  score_final: number | string | null
  classe: string | null
  porte: string | null
  rating_cod: string | null
  rating_txt: string | null
  nivel_risco: string | null
  recomendacao: string | null
  limite_recomendado_num: number | string | null
  limite_recomendado_motivo: string | null
  tomador_id: string | null
  serasa_score: number | null
}

const COLUNAS = `
  id, chave_local, cnpj, razao_social, nome_curto, corretora, grupo, data_analise, versao,
  vigente, revisada, score_final, classe, porte, rating_cod, rating_txt,
  nivel_risco, recomendacao, limite_recomendado_num, limite_recomendado_motivo,
  tomador_id, serasa_score
`

const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A mesma trava da ficha: motivo de anulação manda, e número anulado não vira
 *  valor na tela. Repetida aqui de propósito — afrouxar isto já pintou de verde
 *  um limite de R$ 727 milhões que na verdade era R$ 54,5 milhões. */
const limiteConfiavel = (l: LinhaAcervo): number | null =>
  l.limite_recomendado_motivo ? null : num(l.limite_recomendado_num)

/* O vocabulário do acervo, conferido no banco em 07/09/2026: "Aprovar",
   "Reprovar", "Aprovar com ressalvas". "Reprovar" é a palavra que ele usa —
   procurar só por "recusar" pintava a recusa de CINZA, como se fosse um estado
   desconhecido. A ressalva vem ANTES do aprovar de propósito: "Aprovar com
   ressalvas" contém "aprovar", e sem essa ordem sairia verde limpo. */
const corDaDecisao = (d: string | null): string => {
  const t = (d ?? '').toLowerCase()
  if (/condicion|ressalva|restri/.test(t)) return 'badge-orange'
  if (/reprov|recus|negar|indefer/.test(t)) return 'badge-red'
  if (/aprovar|aprovad|defer/.test(t)) return 'badge-green'
  return 'badge-gray'
}

/** Sem acento e em minúscula, para a busca achar "São" digitando "sao". */
const chave = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

type Ordem = 'data' | 'nome' | 'score' | 'limite'
type Foco = 'todas' | 'precisam' | 'analisadas'

/* A SITUAÇÃO, para agrupar. Sai da mesma leitura da decisão que pinta a
   etiqueta: uma regra só, para o grupo nunca discordar da cor da linha. */
const SITUACOES = ['Aprovar', 'Aprovar com ressalvas', 'Reprovar', 'Bloqueio', 'Sem decisão'] as const
const situacaoDe = (d: string | null): string => {
  const t = (d ?? '').toLowerCase()
  if (!t.trim()) return 'Sem decisão'
  if (/bloqueio|bloquear/.test(t)) return 'Bloqueio'
  if (/condicion|ressalva|restri/.test(t)) return 'Aprovar com ressalvas'
  if (/reprov|recus|negar|indefer/.test(t)) return 'Reprovar'
  if (/aprovar|aprovad|defer/.test(t)) return 'Aprovar'
  return 'Sem decisão'
}

/** Há quantos dias a análise está no acervo. Vira a coluna "Espera": enquanto
 *  ninguém revisou, o relógio continua correndo. */
const diasDe = (iso: string): number =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000))

export default function Acervo() {
  const router = useRouter()
  const [linhas, setLinhas] = useState<LinhaAcervo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [busca, setBusca] = useState('')
  const [soVigentes, setSoVigentes] = useState(true)
  const [soRevisadas, setSoRevisadas] = useState(false)
  const [soSemTomador, setSoSemTomador] = useState(false)
  const [ordem, setOrdem] = useState<Ordem>('data')
  /* AS TRÊS ABAS DA TELA DELE (print de 08/09/2026): Todas · Precisam de você ·
     Já analisadas. "Precisam de você" é a análise vigente que ele ainda não
     revisou — e as três contas fecham: 17 + 120 = 137 no sistema dele. */
  const [foco, setFoco] = useState<Foco>('todas')
  const [agrupar, setAgrupar] = useState(false)

  const carregar = useCallback(async (vivo = { atual: true }) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('analises').select(COLUNAS)
      .order('data_analise', { ascending: false })
      .limit(1000)
    if (!vivo.atual) return
    if (error) setErro(error.message)
    setLinhas((data ?? []) as unknown as LinhaAcervo[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    const vivo = { atual: true }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar(vivo)
    return () => { vivo.atual = false }
  }, [carregar])

  const contagem = useMemo(() => ({
    total: linhas.length,
    vigentes: linhas.filter(l => l.vigente).length,
    revisadas: linhas.filter(l => l.vigente && l.revisada).length,
    semTomador: linhas.filter(l => l.vigente && !l.tomador_id).length,
  }), [linhas])

  /* AS ABAS CONTAM SOBRE A MESMA BASE QUE A LISTA MOSTRA (a regra do kpis.mjs
     dele: "todo número é contado sobre as MESMAS linhas que a tabela desenha").
     Por isso a base respeita "só as vigentes", e não o acervo inteiro. */
  const base = useMemo(
    () => (soVigentes ? linhas.filter(l => l.vigente) : linhas),
    [linhas, soVigentes])

  const abas = useMemo(() => ({
    todas: base.length,
    precisam: base.filter(l => !l.revisada).length,
    analisadas: base.filter(l => l.revisada).length,
  }), [base])

  const vistas = useMemo(() => {
    const q = chave(busca.trim())
    const soDigitos = q.replace(/\D/g, '')

    let r = linhas
    if (soVigentes) r = r.filter(l => l.vigente)
    if (foco === 'precisam') r = r.filter(l => !l.revisada)
    if (foco === 'analisadas') r = r.filter(l => l.revisada)
    if (soRevisadas) r = r.filter(l => l.revisada)
    if (soSemTomador) r = r.filter(l => !l.tomador_id)
    if (q) {
      r = r.filter(l => {
        const texto = chave(semEntidadesHtml([l.razao_social, l.nome_curto, semMarcador(l.corretora), semMarcador(l.grupo)].filter(Boolean).join(' ')))
        const achouTexto = texto.includes(q)
        // CNPJ casa por dígito, para funcionar com ou sem máscara digitada.
        const achouCnpj = soDigitos.length >= 3 && !!l.cnpj?.includes(soDigitos)
        return achouTexto || achouCnpj
      })
    }

    const porNome = (a: LinhaAcervo, b: LinhaAcervo) => a.razao_social.localeCompare(b.razao_social, 'pt-BR')
    return [...r].sort((a, b) => {
      if (ordem === 'nome') return porNome(a, b)
      if (ordem === 'score') return (num(b.score_final) ?? -1) - (num(a.score_final) ?? -1) || porNome(a, b)
      if (ordem === 'limite') return (limiteConfiavel(b) ?? -1) - (limiteConfiavel(a) ?? -1) || porNome(a, b)
      return b.data_analise.localeCompare(a.data_analise) || porNome(a, b)
    })
  }, [linhas, busca, soVigentes, soRevisadas, soSemTomador, ordem, foco])

  /* OS CINCO NÚMEROS DA TELA DELE. A conta é sobre `vistas` (o que está na
     lista agora), e não sobre o acervo inteiro: um KPI dizendo 151 em cima de
     uma lista de 137 linhas é a tela discordando dela mesma. */
  const kpis = useMemo(() => {
    const conta = (nome: string) => vistas.filter(l => situacaoDe(l.recomendacao) === nome).length
    return [
      { rot: 'Empresas', num: vistas.length, pe: 'uma linha por análise', cor: '#0a1628' },
      { rot: 'Aprovadas', num: conta('Aprovar'), pe: 'sem ressalva', cor: '#1a7a50' },
      { rot: 'Reprovadas', num: conta('Reprovar'), pe: 'crédito negado', cor: '#a02020' },
      { rot: 'Bloqueios', num: conta('Bloqueio'), pe: 'parada por documento ou risco', cor: '#a07b1e' },
      {
        rot: 'Revisadas por você', num: vistas.filter(l => l.revisada).length,
        pe: vistas.length ? `${Math.round((vistas.filter(l => l.revisada).length / vistas.length) * 100)}% do que está na lista` : '—',
        cor: '#1e4080',
      },
    ]
  }, [vistas])


  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a1628', margin: 0 }}>Acervo de análises</h1>
        <p style={{ color: 'var(--soft)', fontSize: 14, margin: '6px 0 0', maxWidth: '80ch' }}>
          Todas as análises de crédito publicadas no banco do CRM. Clique numa para abrir o
          relatório inteiro, sem depender do Sistema de Análise estar ligado.
        </p>
      </div>

      {/* ── OS KPIs, como na tela dele: o número grande com a explicação
             embaixo, contado sobre as MESMAS linhas que a lista desenha. ── */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
      }}>
        {kpis.map(k => (
          <div key={k.rot} className="card-panel" style={{ padding: '13px 16px' }}>
            {/* Sem caixa alta espaçada: era o rótulo que abria a tela com
                EMPRESAS · APROVADAS · REPROVADAS e dava a cara de máquina. */}
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--soft)' }}>
              {k.rot}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: k.cor, fontVariantNumeric: 'tabular-nums' }}>
              {k.num}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 2 }}>{k.pe}</div>
          </div>
        ))}
      </div>

      {/* ── o resumo ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <span className="badge badge-blue">{contagem.vigentes} vigentes</span>
        {contagem.semTomador > 0 && (
          <button type="button" className={`badge ${soSemTomador ? 'badge-red' : 'badge-orange'}`}
            style={{ border: 'none', cursor: 'pointer' }}
            title="Análises vigentes que não estão ligadas a nenhum tomador do CRM: elas não aparecem em ficha nenhuma."
            onClick={() => setSoSemTomador(v => !v)}>
            {contagem.semTomador} sem tomador no CRM
          </button>
        )}
        <span className="badge badge-gray">{contagem.total - contagem.vigentes} históricas</span>
      </div>

      {erro && <div className="alert-error" style={{ marginBottom: 14 }}>{erro}</div>}

      {/* ── AS TRÊS ABAS DO PRINT + AGRUPAR POR SITUAÇÃO ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {([
          { id: 'todas' as Foco, rot: 'Todas', n: abas.todas },
          { id: 'precisam' as Foco, rot: 'Precisam de você', n: abas.precisam },
          { id: 'analisadas' as Foco, rot: 'Já analisadas', n: abas.analisadas },
        ]).map(a => (
          <button key={a.id} type="button" onClick={() => setFoco(a.id)}
            aria-pressed={foco === a.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit',
              background: foco === a.id ? '#fff' : 'transparent',
              border: `1px solid ${foco === a.id ? 'var(--border)' : 'transparent'}`,
              color: foco === a.id ? '#1e4080' : 'var(--soft)',
            }}>
            {a.rot}
            <span style={{
              background: foco === a.id ? '#e8f0fa' : '#eef3f9', color: '#26374a',
              borderRadius: 10, padding: '1px 8px', fontSize: 11.5,
            }}>{a.n}</span>
          </button>
        ))}
        <button type="button" onClick={() => setAgrupar(v => !v)}
          aria-pressed={agrupar}
          style={{
            marginLeft: 4, padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            background: agrupar ? '#e8f0fa' : '#fff',
            border: '1px solid var(--border)', color: agrupar ? '#1e4080' : 'var(--soft)',
          }}>
          ☰ Agrupar por situação
        </button>
      </div>

      {/* ── busca e filtros ── */}
      <div className="card-panel" style={{ padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Empresa, CNPJ, corretora ou grupo"
            aria-label="Procurar no acervo"
            style={{
              flex: '1 1 260px', minWidth: 0, padding: '8px 11px', fontSize: 13.5,
              border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
            }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#26374a' }}>
            <input type="checkbox" checked={soVigentes} onChange={e => setSoVigentes(e.target.checked)} />
            Só as vigentes
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#26374a' }}>
            <input type="checkbox" checked={soRevisadas} onChange={e => setSoRevisadas(e.target.checked)} />
            Só as revisadas
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#26374a' }}>
            Ordenar por
            <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}
              style={{ padding: '6px 9px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: '#fff' }}>
              <option value="data">Data da análise</option>
              <option value="nome">Nome da empresa</option>
              <option value="score">Score FAM</option>
              <option value="limite">Limite recomendado</option>
            </select>
          </label>
        </div>
      </div>

      {carregando ? (
        <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Carregando o acervo…</p></div>
      ) : vistas.length === 0 ? (
        <div className="card-panel">
          <p style={{ color: 'var(--soft)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            {linhas.length === 0
              ? 'Nenhuma análise publicada no banco. Quem publica é a carga, na máquina onde as análises rodam: npm run publicar:ensaio para conferir e depois npm run publicar.'
              : 'Nenhuma análise com esses filtros. Tente limpar a busca ou desligar "Só as vigentes".'}
          </p>
        </div>
      ) : (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="mt-tab-wrap">
            <table className="mt-tab">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Corretora</th>
                  <th style={{ textAlign: 'right' }}>Data</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                  <th>Rating</th>
                  <th>Decisão</th>
                  <th style={{ textAlign: 'right' }}>Limite recomendado</th>
                  <th>No CRM</th>
                  {/* ESPERA: há quanto tempo esta análise está sem revisão. É a
                      minha leitura da coluna "Espera" da tela dele; se o
                      significado lá for outro, é uma linha para mudar. */}
                  <th style={{ textAlign: 'center' }}>Espera</th>
                  {/* A PORTA PARA O RELATÓRIO. Análise de dias anteriores não
                      aparece na Mesa, então o Acervo é por onde ele chega nela
                      — e daqui tem que dar para ir direto editar, sem abrir o
                      sistema antigo na mão. Ordem dele em 09/09/2026. */}
                  <th style={{ textAlign: 'right' }}>Editar</th>
                </tr>
              </thead>
              <tbody>
                {(agrupar ? [] : vistas).map(l => {
                  const lim = limiteConfiavel(l)
                  const score = num(l.score_final)
                  return (
                    /* CLICAR NA LINHA ABRE O CARD DE SETE ABAS (09/09/2026).
                       Ordem dele: "acessando tanto pela opção Mesa quanto pela
                       opção do Acervo, as duas devem abrir nessa tela, onde tem
                       visão geral, arquivos, análise, Relatório e mais".

                       Duas portas para a mesma empresa, cada uma com uma cara,
                       obrigava ele a lembrar por onde tinha entrado. O card
                       aceita o id da análise desde hoje, então é o mesmo
                       endereço da Mesa. */
                    <tr key={l.id} style={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/analises/mesa/${l.id}`)}
                      title="Abrir o card desta empresa: visão geral, arquivos, análise e relatório">
                      <td>
                        <div style={{ fontWeight: 700, color: '#0a1628' }}>
                          {semEntidadesHtml(l.razao_social)}
                          {!l.vigente && (
                            <span className="badge badge-gray" style={{ marginLeft: 7, fontSize: 10 }}>histórica</span>
                          )}
                          {!l.revisada && l.vigente && (
                            <span className="badge badge-yellow" style={{ marginLeft: 7, fontSize: 10 }}>a revisar</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--soft)', fontVariantNumeric: 'tabular-nums' }}>
                          {l.cnpj ? maskCNPJ(l.cnpj) : 'sem CNPJ'}
                          {l.grupo && ` · ${semEntidadesHtml(l.grupo)}`}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 190 }}>{semMarcador(l.corretora) ?? '—'}</td>
                      <td className="dim">{fmtData(l.data_analise)}</td>
                      <td className="n">{fmtScore(score)}</td>
                      <td>{l.rating_cod ?? l.rating_txt ?? '—'}</td>
                      <td>
                        {l.recomendacao
                          ? <span className={`badge ${corDaDecisao(l.recomendacao)}`}>{l.recomendacao}</span>
                          : '—'}
                      </td>
                      {/* Sem número confiável a célula fica com o traço e o
                          motivo no title. O texto inteiro está na análise; um
                          número inventado aqui viraria decisão errada. */}
                      <td className="n" title={lim === null ? (l.limite_recomendado_motivo ?? 'a análise não deu um número; abra para ler') : undefined}>
                        {lim === null
                          ? <span style={{ color: '#a07b1e' }}>ver</span>
                          : fmtMoeda(lim)}
                      </td>
                      <td>
                        {l.tomador_id
                          /* O CARD DO TOMADOR continua a um clique daqui: a
                             linha inteira passou a abrir a análise, então este
                             é o caminho para quem quer a empresa e não o
                             relatório. Para o clique não abrir as duas coisas. */
                          ? <button type="button" className="badge badge-green" style={{ fontSize: 10, border: 'none', cursor: 'pointer', font: 'inherit' }}
                              title="Abrir o card deste tomador no CRM"
                              onClick={e => { e.stopPropagation(); router.push(`/tomadores/${l.tomador_id}`) }}>ligada</button>
                          : <span className="badge badge-orange" style={{ fontSize: 10 }}>sem tomador</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}
                        title={l.revisada ? 'Revisada por você' : `Esperando revisão há ${diasDe(l.data_analise)} dias`}>
                        <span style={{
                          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                          background: l.revisada ? '#27a96c' : diasDe(l.data_analise) > 30 ? '#d64545' : '#e8b84b',
                        }} />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <PortaDoRelatorio chave={l.chave_local} compacto />
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* AGRUPADO POR SITUAÇÃO: um corpo de tabela por decisão, com o
                  título e a contagem na primeira linha. Grupo vazio não aparece
                  — cabeçalho de grupo sem linha embaixo é ruído. */}
              {agrupar && SITUACOES.map(sit => {
                const doGrupo = vistas.filter(l => situacaoDe(l.recomendacao) === sit)
                if (!doGrupo.length) return null
                return (
                  <tbody key={sit}>
                    <tr>
                      <td colSpan={10} style={{
                        background: '#eef3f9', fontWeight: 700, fontSize: 12,
                        color: '#26374a', textTransform: 'uppercase', letterSpacing: '.6px',
                      }}>
                        {sit} · {doGrupo.length}
                      </td>
                    </tr>
                    {doGrupo.map(l => {
                      const lim = limiteConfiavel(l)
                      const score = num(l.score_final)
                      return (
                        <tr key={l.id} style={{ cursor: 'pointer' }}
                          onClick={() => router.push(`/analises/mesa/${l.id}`)}
                          title="Abrir o card desta empresa: visão geral, arquivos, análise e relatório">
                          <td>
                            <div style={{ fontWeight: 700, color: '#0a1628' }}>{semEntidadesHtml(l.razao_social)}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--soft)', fontVariantNumeric: 'tabular-nums' }}>
                              {l.cnpj ? maskCNPJ(l.cnpj) : 'sem CNPJ'}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'normal', maxWidth: 190 }}>{semMarcador(l.corretora) ?? '—'}</td>
                          <td className="dim">{fmtData(l.data_analise)}</td>
                          <td className="n">{fmtScore(score)}</td>
                          <td>{l.rating_cod ?? l.rating_txt ?? '—'}</td>
                          <td>
                            {l.recomendacao
                              ? <span className={`badge ${corDaDecisao(l.recomendacao)}`}>{l.recomendacao}</span>
                              : '—'}
                          </td>
                          <td className="n" title={lim === null ? (l.limite_recomendado_motivo ?? undefined) : undefined}>
                            {lim === null ? <span style={{ color: '#a07b1e' }}>ver</span> : fmtMoeda(lim)}
                          </td>
                          <td>
                            {l.tomador_id
                              /* O CARD DO TOMADOR continua a um clique daqui: a
                             linha inteira passou a abrir a análise, então este
                             é o caminho para quem quer a empresa e não o
                             relatório. Para o clique não abrir as duas coisas. */
                          ? <button type="button" className="badge badge-green" style={{ fontSize: 10, border: 'none', cursor: 'pointer', font: 'inherit' }}
                              title="Abrir o card deste tomador no CRM"
                              onClick={e => { e.stopPropagation(); router.push(`/tomadores/${l.tomador_id}`) }}>ligada</button>
                              : <span className="badge badge-orange" style={{ fontSize: 10 }}>sem tomador</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}
                            title={l.revisada ? 'Revisada por você' : `Esperando revisão há ${diasDe(l.data_analise)} dias`}>
                            <span style={{
                              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                              background: l.revisada ? '#27a96c' : diasDe(l.data_analise) > 30 ? '#d64545' : '#e8b84b',
                            }} />
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <PortaDoRelatorio chave={l.chave_local} compacto />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 12, lineHeight: 1.5, maxWidth: '92ch' }}>
        <SemSistemaLocal chave={vistas[0]?.chave_local ?? null} />{' '}
        Mostrando {vistas.length} de {contagem.total}. O acervo é o que a carga publicou no banco
        (<b>npm run publicar</b>) — <b>nada roda essa carga por horário</b>, então uma análise
        editada hoje aparece aqui depois que alguém publicar.
      </div>
    </div>
  )
}

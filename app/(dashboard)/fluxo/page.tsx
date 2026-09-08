'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  O FUNIL DA FAM, EM CARDS  ·  /fluxo
//
//  Esta tela é o Funil do protótipo (`prototipo/prototipo-crm-fam.html`, tela
//  "funil"), PORTADO para dentro do CRM com o dado de verdade. Ordem dele em
//  08/09/2026: "preciso do workflow, para que outras áreas também tenham
//  acesso; preciso que seja em cards".
//
//  REPRODUZIR, E NÃO RECRIAR. O desenho é o do protótipo, linha por linha: a
//  faixa que explica a regra, a fileira de KPIs, as colunas cinza-azuladas com
//  o contador no título e o cartão branco com a tarja colorida à esquerda.
//  O que mudou foi só a origem: em vez do estado de mentira do protótipo, cada
//  cartão é uma operação do banco.
//
//  A REGRA QUE A TELA ENSINA, e que é a frase do protótipo:
//  UMA EMPRESA, UM CARD. Cada operação é um ID secundário. O mesmo tomador pode
//  ter operação viva e operação recusada ao mesmo tempo, e clicar em qualquer
//  uma leva ao card dele.
//
//  AS COLUNAS NÃO ESTÃO ESCRITAS AQUI. Vêm de `status_fluxo_operacao` (nome,
//  cor e ordem), que é a régua que o CRM já usa em Operações. Criar uma etapa
//  nova é uma linha naquela tabela, sem deploy: era isso que ele pediu quando
//  disse que campo e política têm que ser configuráveis, não fixos em código.
//
//  QUEM VÊ: todo mundo que entra no CRM. É de propósito, e é o pedido: o funil
//  é o lugar onde Comercial, Cadastro, Crédito e Subscrição olham para a mesma
//  fila. Escrever continua sendo de quem tem perfil para isso, pela RLS.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda } from '@/lib/utils'

// ── as peças de dado ────────────────────────────────────────────────────────

interface Etapa { nome: string; cor: string | null; ordem: number | null }

interface Operacao {
  id: string
  tomador_id: string | null
  corretora_id: string | null
  modalidade: string | null
  lmg: number | string | null
  taxa: number | string | null
  premio_previsto: number | string | null
  status: string | null
  prioridade: string | null
  temperatura: string | null
  data_entrada: string | null
}

interface Tomador { id: string; razao_social: string; cnpj: string | null }
interface Corretora { id: string; razao_social: string; nome_fantasia: string | null }

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** O dinheiro curto do protótipo: "R$ 12,5 mi", "R$ 850 mil". Num cartão de
 *  quatro linhas não cabe R$ 12.500.000,00, e o que interessa ali é a ordem de
 *  grandeza. O valor exato está na operação. */
function brlCurto(n: number): string {
  if (!n) return 'R$ 0'
  if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi'
  if (n >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'
  return fmtMoeda(n)
}

const pct = (n: number): string =>
  n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : 'sem taxa'

/** Sem acento e em minúscula, para a busca achar "São" digitando "sao". */
const chave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** As etapas em que a operação já morreu. O tomador continua vivo: é a regra
 *  que o protótipo escreve na tela, e ela vale para a conta dos KPIs. */
const MORTAS = new Set(['Perdido', 'Recusado'])

// ── a tela ──────────────────────────────────────────────────────────────────

export default function FluxoPage() {
  const router = useRouter()

  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [ops, setOps] = useState<Operacao[]>([])
  const [tomadores, setTomadores] = useState<Map<string, Tomador>>(new Map())
  const [corretoras, setCorretoras] = useState<Map<string, Corretora>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [soVivas, setSoVivas] = useState(false)

  const carregar = useCallback(async (vivo: { atual: boolean }) => {
    const supabase = createClient()
    const [e, o, t, c] = await Promise.all([
      supabase.from('status_fluxo_operacao').select('nome, cor, ordem').eq('ativo', true).order('ordem'),
      supabase.from('operacoes')
        .select('id, tomador_id, corretora_id, modalidade, lmg, taxa, premio_previsto, status, prioridade, temperatura, data_entrada')
        .limit(3000),
      supabase.from('tomadores').select('id, razao_social, cnpj').limit(3000),
      supabase.from('corretoras').select('id, razao_social, nome_fantasia').limit(3000),
    ])
    if (!vivo.atual) return
    const falhou = e.error || o.error || t.error || c.error
    if (falhou) setErro(falhou.message)
    setEtapas((e.data ?? []) as Etapa[])
    setOps((o.data ?? []) as unknown as Operacao[])
    setTomadores(new Map(((t.data ?? []) as Tomador[]).map(x => [x.id, x])))
    setCorretoras(new Map(((c.data ?? []) as Corretora[]).map(x => [x.id, x])))
    setCarregando(false)
  }, [])

  useEffect(() => {
    const vivo = { atual: true }
    carregar(vivo)
    return () => { vivo.atual = false }
  }, [carregar])

  const nomeDoTomador = useCallback(
    (id: string | null) => (id && tomadores.get(id)?.razao_social) || 'tomador não cadastrado',
    [tomadores])

  const nomeDaCorretora = useCallback((id: string | null) => {
    if (!id) return ''
    const c = corretoras.get(id)
    return c ? (c.nome_fantasia || c.razao_social) : ''
  }, [corretoras])

  // ── o que a busca deixou passar ───────────────────────────────────────────
  const vistas = useMemo(() => {
    const q = chave(busca.trim())
    const digitos = q.replace(/\D/g, '')
    let r = ops
    if (soVivas) r = r.filter(o => !MORTAS.has(o.status ?? ''))
    if (q) {
      r = r.filter(o => {
        const t = o.tomador_id ? tomadores.get(o.tomador_id) : null
        const texto = chave([nomeDoTomador(o.tomador_id), nomeDaCorretora(o.corretora_id), o.modalidade ?? ''].join(' '))
        return texto.includes(q) || (digitos.length >= 3 && !!t?.cnpj?.includes(digitos))
      })
    }
    return r
  }, [ops, busca, soVivas, tomadores, nomeDoTomador, nomeDaCorretora])

  // ── os números do topo, na conta do protótipo ─────────────────────────────
  const kpis = useMemo(() => {
    const vivas = vistas.filter(o => !MORTAS.has(o.status ?? ''))
    const emitidas = vistas.filter(o => o.status === 'Emitido')
    // "Cards vivos" é EMPRESA, e não operação: é a regra da tela.
    const empresasVivas = new Set(vivas.map(o => o.tomador_id).filter(Boolean))
    return {
      empresas: empresasVivas.size,
      vivas: vivas.length,
      mortas: vistas.length - vivas.length,
      lmg: emitidas.reduce((s, o) => s + num(o.lmg), 0),
      premio: emitidas.reduce((s, o) => s + num(o.premio_previsto), 0),
      apolices: emitidas.length,
    }
  }, [vistas])

  const porEtapa = useCallback(
    (nome: string) => vistas.filter(o => (o.status ?? '') === nome),
    [vistas])

  /* As operações cuja etapa não existe (ou não está mais ativa) na régua. Elas
     não podem sumir da tela: some da tela = some do trabalho de alguém. */
  const orfas = useMemo(() => {
    const conhecidas = new Set(etapas.map(e => e.nome))
    return vistas.filter(o => !conhecidas.has(o.status ?? ''))
  }, [vistas, etapas])

  return (
    <div style={{ padding: '4px 0 26px' }}>
      {/* ── a faixa que ensina a regra, igual à do protótipo ── */}
      <div style={{
        background: '#fdf8e6', border: '1px solid #eddda8', borderRadius: 9,
        padding: '9px 13px', fontSize: 12.5, color: '#7a5e10', display: 'flex',
        alignItems: 'center', gap: 9, marginBottom: 14, lineHeight: 1.45, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 15 }}>📋</span>
        <div>
          <b style={{ color: '#5c460a' }}>Uma empresa, um card. Cada operação é um ID secundário.</b>{' '}
          O mesmo tomador pode ter operação viva e operação recusada ao mesmo tempo. Clique numa
          operação para abrir o card dela.
        </div>
      </div>

      {erro && <div className="alert-error" style={{ marginBottom: 14 }}>{erro}</div>}

      {/* ── KPIs ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <Kpi rotulo="Empresas no funil" numero={String(kpis.empresas)} pe="com pelo menos uma operação viva" />
        <Kpi rotulo="Operações" numero={String(kpis.vivas)} pe={`${kpis.mortas} recusadas ou perdidas`} />
        <Kpi rotulo="LMG emitido" numero={brlCurto(kpis.lmg)} pe={`${kpis.apolices} apólices`} cor="#27a96c" />
        <Kpi rotulo="Prêmio previsto" numero={brlCurto(kpis.premio)} pe="nas apólices emitidas" destaque />
      </div>

      {/* ── busca ── */}
      <div className="card-panel" style={{ padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Empresa, CNPJ, corretora ou produto"
            aria-label="Procurar no funil"
            style={{
              flex: '1 1 260px', minWidth: 0, padding: '8px 11px', fontSize: 13.5,
              border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
            }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#22344d' }}>
            <input type="checkbox" checked={soVivas} onChange={e => setSoVivas(e.target.checked)} />
            Esconder recusadas e perdidas
          </label>
          <span className="badge badge-blue">{vistas.length} operações</span>
        </div>
      </div>

      {/* ── O FUNIL ── */}
      <section className="card-panel" style={{ padding: 18 }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: '#1a3560', marginBottom: 13, paddingBottom: 8,
          borderBottom: '2px solid #d0e4f5', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3070c8' }} />
          Funil de operações
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--soft)' }}>
            {carregando ? 'carregando…' : `${kpis.vivas} vivas · ${kpis.mortas} recusadas ou perdidas`}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, etapas.length)}, minmax(178px, 1fr))`,
          gap: 10, overflowX: 'auto', paddingBottom: 6,
        }}>
          {etapas.map(et => {
            const doCol = porEtapa(et.nome)
            return (
              <div key={et.nome} style={{
                background: '#eef3f9', border: '1px solid var(--border)', borderRadius: 10,
                padding: 9, minHeight: 120,
              }}>
                <h4 style={{
                  fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.7px',
                  color: '#1a3560', fontWeight: 700, display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px', gap: 6,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: et.cor ?? '#3070c8',
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{et.nome}</span>
                  </span>
                  <span style={{
                    background: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11,
                    border: '1px solid var(--border)', flexShrink: 0,
                  }}>{doCol.length}</span>
                </h4>

                {doCol.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: '#8fa3b8', padding: '6px 2px' }}>vazio</div>
                ) : (
                  doCol.map(o => (
                    <Cartao
                      key={o.id}
                      empresa={nomeDoTomador(o.tomador_id)}
                      corretora={nomeDaCorretora(o.corretora_id)}
                      modalidade={o.modalidade}
                      lmg={num(o.lmg)}
                      taxa={num(o.taxa)}
                      cor={et.cor ?? '#3070c8'}
                      morta={MORTAS.has(o.status ?? '')}
                      podeAbrir={!!o.tomador_id}
                      onAbrir={() => o.tomador_id && router.push(`/tomadores/${o.tomador_id}`)}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>

        {orfas.length > 0 && (
          <div className="mt-nota at" style={{ marginTop: 14 }}>
            <b>{orfas.length} operações estão numa etapa que não está na régua</b> (
            {[...new Set(orfas.map(o => o.status ?? 'sem etapa'))].join(', ')}). Elas não aparecem
            em coluna nenhuma acima. A etapa some da régua, o trabalho não some junto: ou a etapa
            volta a ser ativa em Operações, ou essas operações precisam ser movidas.
          </div>
        )}
      </section>

      <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 12, lineHeight: 1.6, maxWidth: '92ch' }}>
        As colunas são as etapas de <b>status_fluxo_operacao</b>, a mesma régua da tela de Operações:
        etapa nova é uma linha naquela tabela, sem mexer nesta tela. Todo mundo no CRM enxerga este
        funil; quem escreve continua sendo quem tem perfil para isso.
      </div>
    </div>
  )
}

// ── as peças da tela ────────────────────────────────────────────────────────

function Kpi({ rotulo, numero, pe, cor, destaque }: {
  rotulo: string; numero: string; pe: string; cor?: string; destaque?: boolean
}) {
  return (
    <div style={{
      flex: '1 1 165px', background: destaque ? 'linear-gradient(135deg,#102040,#1e4080)' : '#fff',
      borderRadius: 12, padding: '15px 17px 13px',
      boxShadow: '0 2px 12px rgba(30,64,128,.08)',
      border: destaque ? 'none' : '1px solid var(--border)',
      position: 'relative', overflow: 'hidden',
    }}>
      {!destaque && (
        <span style={{
          content: '', position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: cor ?? '#3070c8', display: 'block',
        }} />
      )}
      <div style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1,
        color: destaque ? '#a0c0e8' : 'var(--soft)', fontWeight: 700, marginBottom: 5,
      }}>{rotulo}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
        color: destaque ? '#e8b84b' : '#102040',
      }}>{numero}</div>
      <div style={{ fontSize: 11.5, color: destaque ? '#8fb3d9' : 'var(--soft)', marginTop: 3 }}>{pe}</div>
    </div>
  )
}

function Cartao({ empresa, corretora, modalidade, lmg, taxa, cor, morta, podeAbrir, onAbrir }: {
  empresa: string
  corretora: string
  modalidade: string | null
  lmg: number
  taxa: number
  cor: string
  morta: boolean
  podeAbrir: boolean
  onAbrir: () => void
}) {
  return (
    <div
      role={podeAbrir ? 'button' : undefined}
      tabIndex={podeAbrir ? 0 : undefined}
      onClick={podeAbrir ? onAbrir : undefined}
      onKeyDown={podeAbrir ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } }) : undefined}
      title={podeAbrir
        ? 'Abrir o card desta empresa'
        : 'Esta operação não está ligada a um tomador cadastrado, então não há card para abrir'}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderLeft: `4px solid ${cor}`,
        borderRadius: 8, padding: '9px 11px', marginBottom: 8,
        cursor: podeAbrir ? 'pointer' : 'default', opacity: morta ? 0.78 : 1,
        transition: 'transform .12s, box-shadow .12s',
      }}
      onMouseEnter={e => {
        if (!podeAbrir) return
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 18px rgba(30,64,128,.14)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', lineHeight: 1.3 }}>{empresa}</div>
      {modalidade && (
        <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 3 }}>{modalidade}</div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 3 }}>
        <b style={{ color: '#1a2a3a' }}>{brlCurto(lmg)}</b> · {pct(taxa)}
      </div>
      {corretora && (
        <div style={{ fontSize: 11, color: '#8fa3b8', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {corretora}
        </div>
      )}
    </div>
  )
}

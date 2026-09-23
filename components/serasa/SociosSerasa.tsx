'use client'

// ============================================================================
//  OS SÓCIOS DO SERASA: O ROBÔ PERGUNTA  (14/09/2026, regra refeita em 15/09)
//
//  Regra do Marco, 14/09: "sempre traz a primeira camada, quando tiver sócios,
//  aí tem que pedir aprovação".
//
//  Regra do Marco, 15/09: "o robô identifica os sócios e me pergunta se pode
//  buscar os novos Serasas para compor a análise de cadastro e crédito, o robô
//  identifica o percentual de cada sócio e informa; quando estiver zerado o
//  percentual, ele pede autorização para todos".
//
//  Então a pergunta vem em duas partes:
//
//    com participação ...... cada sócio com o seu percentual, e a decisão é
//                            sócio a sócio (ou todos de uma vez)
//    percentual zerado ..... sem o tamanho da parte não há como escolher: uma
//                            autorização só, para todos juntos
//
//  "Novos": sócio consultado nos últimos 30 dias nem vira pergunta (a rota
//  `/api/esteira/serasa` filtra). O Serasa aprovado cai na pasta da análise,
//  em "Sócios - Serasa", e entra na triagem, no cadastro e na análise.
//
//  Só o analista de crédito decide, pela função `serasa_decidir_socios`. Cada
//  consulta aprovada é cobrada. A mesma peça mora no cadastro do tomador e no
//  card da análise. Sem sócio nenhum, não desenha nada.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, maskCPF } from '@/lib/utils'
import { cor } from '@/lib/ui/painel'
import { percentualDoSocio } from '@/lib/serasa/pedido'

interface Socio {
  id: string
  nome: string | null
  documento: string
  tipo_pessoa: string
  participacao: string | null
  anotacoes: string | null
  estado: string
  resultado: string | null
  decidido_por: string | null
  feito_em: string | null
  criado_em: string
}

const ABERTOS = ['aguardando_aprovacao', 'pendente', 'consultando']
const ROTULO: Record<string, string> = {
  aguardando_aprovacao: 'aguardando aprovação',
  pendente: 'aprovado, na fila do notebook',
  consultando: 'consultando no Serasa…',
  pronto: 'consultado',
  reaproveitado: 'reaproveitado, sem cobrança',
  falhou: 'o robô parou',
  recusado: 'dispensado',
}
const MOSTRA = 8

export default function SociosSerasa({ tomadorId, pasta, analista, classeBotao = 'mt-btn', aoChegarPdf }: {
  tomadorId?: string | null
  pasta?: string | null
  analista: boolean
  classeBotao?: string
  /** Um sócio saiu de aberto para consultado: o PDF acabou de virar anexo. */
  aoChegarPdf?: () => void
}) {
  const [socios, setSocios] = useState<Socio[]>([])
  const abertosAntes = useRef<Set<string>>(new Set())
  // Em ref, para a função da tela de fora não recriar a leitura a cada render.
  const avisar = useRef(aoChegarPdf)
  useEffect(() => { avisar.current = aoChegarPdf }, [aoChegarPdf])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [verZerados, setVerZerados] = useState(false)
  const [verDecididos, setVerDecididos] = useState(false)

  const carregar = useCallback(async () => {
    if (!tomadorId && !pasta) return
    let q = createClient().from('serasa_pedidos')
      .select('id, nome, documento, tipo_pessoa, participacao, anotacoes, estado, resultado, decidido_por, feito_em, criado_em')
      .eq('camada', 'socio')
      .order('criado_em', { ascending: false })
      .limit(40)
    q = tomadorId && pasta ? q.or(`tomador_id.eq.${tomadorId},pasta.eq.${JSON.stringify(pasta)}`)
      : tomadorId ? q.eq('tomador_id', tomadorId) : q.eq('pasta', pasta as string)
    const { data } = await q
    // Decisão velha sai da tela depois de uma semana: aberto fica sempre.
    const semana = Date.now() - 7 * 86400000
    const lista = ((data ?? []) as Socio[])
      .filter((s) => ABERTOS.includes(s.estado) || Date.parse(s.feito_em ?? s.criado_em) > semana)
      .sort((a, b) => percentualDoSocio(b.participacao) - percentualDoSocio(a.participacao))
    if (lista.some((s) => abertosAntes.current.has(s.id) && ['pronto', 'reaproveitado'].includes(s.estado))) avisar.current?.()
    abertosAntes.current = new Set(lista.filter((s) => ABERTOS.includes(s.estado)).map((s) => s.id))
    setSocios(lista)
  }, [tomadorId, pasta])

  useEffect(() => { carregar() }, [carregar])
  const temAberto = socios.some((s) => ABERTOS.includes(s.estado))
  useEffect(() => {
    if (!temAberto) return
    const t = setInterval(carregar, 8000)
    return () => clearInterval(t)
  }, [temAberto, carregar])

  async function decidir(ids: string[], aprovar: boolean, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return
    setOcupado(true); setErro('')
    const { error } = await createClient().rpc('serasa_decidir_socios', { p_ids: ids, p_aprovar: aprovar })
    if (error) setErro(error.message)
    await carregar()
    setOcupado(false)
  }

  if (!socios.length) return null
  const esperando = socios.filter((s) => s.estado === 'aguardando_aprovacao')
  const comParte = esperando.filter((s) => percentualDoSocio(s.participacao) > 0)
  const zerados = esperando.filter((s) => percentualDoSocio(s.participacao) === 0)
  const decididos = socios.filter((s) => s.estado !== 'aguardando_aprovacao')
  const documento = (s: Socio) => (s.tipo_pessoa === 'PF' ? `CPF ${maskCPF(s.documento)}` : `CNPJ ${maskCNPJ(s.documento)}`)
  const consultas = (n: number) => `${n} consulta${n === 1 ? '' : 's'} cobrada${n === 1 ? '' : 's'} da FAM`

  const linha = (s: Socio, direita: ReactNode, mostrarParte = true) => (
    <div key={s.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', padding: '8px 0', borderTop: `1px solid ${cor.bordaSuave}` }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{s.nome || 'Sem nome no Serasa'}</div>
        <div style={{ fontSize: 12, color: cor.textoSub }}>
          {documento(s)}
          {mostrarParte && <> · <b style={{ color: cor.tinta }}>{percentualDoSocio(s.participacao) > 0 ? `${s.participacao} do capital` : 'sem percentual'}</b></>}
          {s.anotacoes === 'Sim' && <span style={{ color: cor.alerta, fontWeight: 600 }}> · tem anotação negativa</span>}
        </div>
      </div>
      {direita}
    </div>
  )
  const subtitulo = (t: string) => (
    <div style={{ fontSize: 12.5, fontWeight: 700, color: cor.tinta, margin: '10px 0 2px' }}>{t}</div>
  )
  const mais = (aberto: boolean, trocar: () => void, resto: number) => (
    <button type="button" onClick={trocar}
      style={{ background: 'none', border: 'none', padding: '8px 0', color: cor.acao, fontSize: 12.5, cursor: 'pointer' }}>
      {aberto ? `Mostrar só os ${MOSTRA} primeiros` : `Ver os outros ${resto}`}
    </button>
  )

  return (
    <div style={{ border: `1px solid ${cor.borda}`, borderLeft: `3px solid ${cor.ouro}`, background: cor.papel, borderRadius: 8, padding: '12px 14px', marginBottom: 14, color: cor.texto, fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: cor.tinta }}>
        {esperando.length ? 'Posso buscar o Serasa dos sócios?' : 'Serasa dos sócios'}
      </div>
      <div style={{ color: cor.textoSub, fontSize: 12.5, margin: '2px 0 4px', lineHeight: 1.5 }}>
        {esperando.length
          ? `O Serasa da empresa trouxe ${esperando.length} sócio(s) que ainda não foram consultados. O Serasa de cada um vai para a pasta e compõe a análise de cadastro e de crédito. Cada consulta é cobrada da FAM.`
          : 'Consultas de sócios pedidas a partir do quadro societário do Serasa. O PDF vai para a pasta da análise, em "Sócios - Serasa".'}
      </div>

      {/* ── com participação: o percentual de cada um, decisão sócio a sócio ── */}
      {comParte.length > 0 && (
        <>
          {subtitulo(`Com participação no capital (${comParte.length})`)}
          {comParte.map((s) => linha(s, analista ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className={classeBotao} disabled={ocupado} onClick={() => decidir([s.id], true)}>Buscar</button>
              <button type="button" className={classeBotao} disabled={ocupado} onClick={() => decidir([s.id], false)}>Dispensar</button>
            </div>
          ) : null))}
          {comParte.length > 1 && analista && (
            <div style={{ marginTop: 6 }}>
              <button type="button" className={classeBotao} disabled={ocupado}
                onClick={() => decidir(comParte.map((s) => s.id), true, `Buscar o Serasa dos ${comParte.length} sócios com participação?\n\nSão ${consultas(comParte.length)}.`)}>
                Buscar os {comParte.length}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── percentual zerado: uma autorização só, para todos ── */}
      {zerados.length > 0 && (
        <>
          {subtitulo(`Sem percentual no Serasa (${zerados.length})`)}
          <div style={{ color: cor.textoSub, fontSize: 12.5, lineHeight: 1.5, marginBottom: 2 }}>
            {zerados.length === 1 ? 'Este sócio veio' : `Estes ${zerados.length} sócios vieram`} com participação zerada, o que costuma ser
            diretor ou administrador listado no quadro. Sem o percentual não dá para escolher pelo tamanho da parte, então
            a autorização é para {zerados.length === 1 ? 'ele' : 'todos juntos'}: {consultas(zerados.length)}.
          </div>
          {(verZerados ? zerados : zerados.slice(0, MOSTRA)).map((s) => linha(s, null, false))}
          {zerados.length > MOSTRA && mais(verZerados, () => setVerZerados(!verZerados), zerados.length - MOSTRA)}
          {analista && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <button type="button" className={classeBotao} disabled={ocupado}
                onClick={() => decidir(zerados.map((s) => s.id), true, `Buscar o Serasa ${zerados.length === 1 ? 'deste sócio sem percentual' : `dos ${zerados.length} sócios sem percentual`}?\n\nSão ${consultas(zerados.length)}.`)}>
                {zerados.length === 1 ? 'Autorizar' : `Autorizar os ${zerados.length}`}
              </button>
              <button type="button" className={classeBotao} disabled={ocupado} onClick={() => decidir(zerados.map((s) => s.id), false)}>
                {zerados.length === 1 ? 'Dispensar' : `Dispensar os ${zerados.length}`}
              </button>
            </div>
          )}
        </>
      )}

      {esperando.length > 0 && !analista && (
        <div style={{ fontSize: 12, color: cor.textoSub, marginTop: 6 }}>A decisão é do analista de crédito.</div>
      )}

      {/* ── o que já foi decidido ── */}
      {decididos.length > 0 && (
        <>
          {esperando.length > 0 && subtitulo('Já decididos')}
          {(verDecididos ? decididos : decididos.slice(0, MOSTRA)).map((s) => linha(s, (
            <span style={{ fontSize: 12, color: s.estado === 'falhou' ? cor.alerta : cor.textoSub, flex: s.estado === 'falhou' ? '1 1 100%' : undefined }}>
              {ROTULO[s.estado] ?? s.estado}
              {(s.estado === 'falhou' || s.estado === 'pendente') && s.resultado ? `: ${s.resultado}` : ''}
              {s.decidido_por && s.estado !== 'falhou' ? ` · ${s.decidido_por}` : ''}
            </span>
          )))}
          {decididos.length > MOSTRA && mais(verDecididos, () => setVerDecididos(!verDecididos), decididos.length - MOSTRA)}
        </>
      )}
      {erro && <div style={{ fontSize: 12, color: cor.alerta, marginTop: 6 }}>{erro}</div>}
    </div>
  )
}

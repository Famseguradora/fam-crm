'use client'

// ============================================================================
//  O BOTÃO "SERASA" NO CARD DA ANÁLISE  (15/09/2026)
//
//  Pedido do Marco: o Serasa também dentro da Análise de Crédito, e não só no
//  cadastro do tomador. É o mesmo pedido em `serasa_pedidos`, com a PASTA
//  junto: a esteira consulta pelo robô, o PDF cai na pasta, a triagem refaz
//  sozinha e os sócios aparecem logo abaixo para a decisão dele.
//
//  O card pode ainda não ter tomador: aí o pedido nasce só com a pasta, e a
//  rota confere o CNPJ contra a própria análise antes de consultar.
//
//  Quando o Serasa é a ÚNICA falta da triagem, a esteira já busca sozinha; o
//  botão é para quando ele quer antes disso, ou de novo.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ } from '@/lib/utils'
import type { FilaRica } from '@/lib/analise/mesa'
import type { Quem } from '@/components/analise/card/comum'
import { type PedidoSerasa, SERASA_ABERTO, situacaoSerasa } from '@/lib/serasa/pedido'

const digitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '')

export default function SerasaDaAnalise({ f, quem, aoChegarPdf }: { f: FilaRica; quem: Quem; aoChegarPdf?: () => void }) {
  const [pedido, setPedido] = useState<PedidoSerasa | null>(null)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState('')
  const antes = useRef<PedidoSerasa | null>(null)
  const avisar = useRef(aoChegarPdf)
  useEffect(() => { avisar.current = aoChegarPdf }, [aoChegarPdf])

  const cnpj = [f.cnpj, f.cadastro_agente?.cnpj].map(digitos).find((c) => c.length === 14) ?? ''
  const itemSerasa = f.cadastro?.itens?.find((i) => i.id === 'serasa_pj')
  const temSerasa = itemSerasa?.situacao === 'ok'

  const carregar = useCallback(async () => {
    let q = createClient().from('serasa_pedidos')
      .select('id, estado, criado_em, feito_em, resultado, pedido_por')
      .eq('camada', 'empresa').order('criado_em', { ascending: false }).limit(1)
    q = f.tomador_id ? q.or(`tomador_id.eq.${f.tomador_id},pasta.eq.${JSON.stringify(f.pasta)}`) : q.eq('pasta', f.pasta)
    const { data } = await q.maybeSingle()
    const novo = (data as PedidoSerasa | null) ?? null
    const velho = antes.current
    if (velho && novo && velho.id === novo.id && SERASA_ABERTO.includes(velho.estado) && !SERASA_ABERTO.includes(novo.estado)) avisar.current?.()
    antes.current = novo
    setPedido(novo)
  }, [f.tomador_id, f.pasta])

  useEffect(() => { carregar() }, [carregar])
  const aberto = !!pedido && SERASA_ABERTO.includes(pedido.estado)
  useEffect(() => {
    if (!aberto) return
    const t = setInterval(carregar, 5000)
    return () => clearInterval(t)
  }, [aberto, carregar])

  // Análise sem pasta (aberta pelo Acervo): o botão do Serasa é o do cadastro do tomador.
  if (f.semEsteira || f.arquivada) return null

  async function pedir() {
    setErro('')
    const nome = f.razao_social || f.nome || f.pasta
    if (!window.confirm(`Buscar o Serasa de ${nome} (CNPJ ${maskCNPJ(cnpj)})?\n\n${temSerasa
      ? 'A pasta já tem Serasa. Se este CNPJ foi consultado nos últimos 30 dias, o robô reaproveita sem cobrar; senão é uma consulta nova, cobrada.'
      : 'É uma consulta cobrada da FAM (Relatório Avançado, sem nenhum extra).'}\n\nO PDF cai na pasta, a triagem refaz sozinha, e os sócios aparecem aqui para você decidir.`)) return
    setPedindo(true)
    try {
      const { error } = await createClient().from('serasa_pedidos').insert({
        tomador_id: f.tomador_id ?? null,
        pasta: f.pasta,
        cnpj,
        documento: cnpj,
        pedido_por: quem.nome,
      })
      if (error) setErro(error.code === '23505' ? 'Já há um pedido de Serasa em andamento para esta empresa.' : error.message)
      await carregar()
    } finally {
      setPedindo(false)
    }
  }

  const aviso = pedido ? situacaoSerasa(pedido, 'na pasta da análise') : null
  const semCnpj = cnpj.length !== 14

  return (
    <div className="an-bloco">
      <h4>Serasa da empresa</h4>
      {aviso ? (
        <div className={`an-aviso ${aviso.erro ? 'erro' : aberto ? '' : 'bom'}`}><span>{aviso.erro ? '⛔' : aberto ? '…' : '✓'}</span><span>{aviso.texto}</span></div>
      ) : (
        <div className="an-explica">
          {temSerasa ? 'A pasta já tem o Serasa da empresa.'
            : itemSerasa ? 'Falta o Serasa da empresa. Quando ele for a única falta da triagem, a esteira busca sozinha.'
              : 'O Serasa da empresa é consultado pelo robô do notebook e cai na pasta.'}
        </div>
      )}
      {quem.podeEscrever && (
        <div className="an-bt-linha" style={{ marginTop: 8 }}>
          <button type="button" className="an-bt" disabled={aberto || pedindo || semCnpj} onClick={pedir}
            title={semCnpj ? 'Esta análise ainda não tem CNPJ' : 'Consulta o Serasa pelo robô do notebook e põe o PDF na pasta'}>
            {aberto ? 'Serasa em andamento…' : pedindo ? 'Pedindo…' : temSerasa ? 'Buscar o Serasa de novo' : 'Buscar o Serasa'}
          </button>
          <span className="an-bt-nota">
            {semCnpj ? 'Sem CNPJ na análise ainda: a triagem ou o cadastro precisam achar primeiro.' : `CNPJ ${maskCNPJ(cnpj)} · cada consulta nova é cobrada, sem extras.`}
          </span>
        </div>
      )}
      {erro && <div className="an-aviso erro" style={{ marginTop: 8 }}><span>⛔</span><span>{erro}</span></div>}
    </div>
  )
}

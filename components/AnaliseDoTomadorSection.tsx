'use client'

/* O bloco da ANÁLISE DE CRÉDITO dentro da ficha do tomador.

   É a primeira vez que os dois sistemas se encontram: o CRM mostra o que a
   análise apurou (Score FAM, Rating, Decisão, limite recomendado) sem que o
   dado precise ser copiado para lugar nenhum. Só leitura.

   Se não houver análise para o CNPJ, ou se o sistema não estiver no ar nesta
   máquina, o bloco simplesmente não aparece: a ficha fica como sempre foi. */

import { useEffect, useState } from 'react'
import {
  analiseDoTomador, enderecoDaAnalise,
  type AnaliseDoTomador,
} from '@/lib/analise/local'
import { analiseDoBanco } from '@/lib/analise/banco'

/* Cores dos valores que merecem destaque, na paleta do CRM.

   `alerta` não é enfeite: é o campo cujo número a carga RECUSOU por não ser
   confiável. Pintar isso do mesmo verde de um valor confirmado foi um furo real
   (a Conasa aparecia aqui com "R$ 727.192.500,00" em verde, sendo que o valor
   de verdade é R$ 54,5 milhões). Cor diferente e fonte menor, porque o que vem
   ali é uma frase para ler, e não um número para confiar. */
const COR: Record<string, string> = {
  decisao: '#1e4080',
  limite: '#27a96c',
  alerta: '#a05010',
}

export default function AnaliseDoTomadorSection({ cnpj }: { cnpj: string | null | undefined }) {
  const [analise, setAnalise] = useState<AnaliseDoTomador | null>(null)
  // De onde o dado veio. Não é detalhe técnico: muda o que o rodapé pode
  // prometer, e se o botão "Abrir a análise" leva a algum lugar. O sistema é
  // 127.0.0.1, então esse link só existe na máquina onde ele roda.
  const [origem, setOrigem] = useState<'banco' | 'local'>('banco')

  // O BANCO PRIMEIRO, e a máquina depois. Essa ordem é o resultado da carga:
  // até ela, o bloco só existia no computador onde o sistema local roda, porque
  // é 127.0.0.1 e o navegador bloqueia endereço local em página segura. Agora o
  // dado está no Supabase e a ficha funciona de qualquer lugar, inclusive no
  // celular. O sistema local fica como reserva: se o CNPJ ainda não subiu (uma
  // análise feita hoje, antes da próxima carga), ele responde na hora.
  useEffect(() => {
    let vivo = true
    setAnalise(null)
    ;(async () => {
      try {
        const doBanco = await analiseDoBanco(cnpj)
        if (!vivo) return
        if (doBanco) { setAnalise(doBanco); setOrigem('banco'); return }
        const local = await analiseDoTomador(cnpj)
        if (!vivo) return
        setAnalise(local); setOrigem('local')
      } catch {
        if (vivo) setAnalise(null)
      }
    })()
    return () => { vivo = false }
  }, [cnpj])

  if (!analise) return null

  return (
    <div style={{ marginTop: 4 }}>
      <div
        className="section-title"
        style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        <span className="dot" />
        Análise de Crédito

        {/* Diz se estes ainda são os números da máquina ou se já passaram
            pela mão dele. É a diferença entre consultar e confiar. */}
        {analise.rotuloSituacao && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
            border: `1px solid ${analise.revisada ? '#27a96c' : '#e8b84b'}`,
            color: analise.revisada ? '#1d7d51' : '#a07818',
            background: analise.revisada ? 'rgba(39,169,108,.08)' : 'rgba(232,184,75,.12)',
          }}>
            {analise.rotuloSituacao}
          </span>
        )}
      </div>

      <div style={{
        border: '1px solid #c5d5e8', borderRadius: 10, background: '#f7fafd',
        padding: '14px 16px',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14,
        }}>
          {analise.dados.map(([rotulo, valor, tipo]) => (
            <div key={rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: '#6080a0',
                letterSpacing: '.06em', textTransform: 'uppercase',
              }}>
                {rotulo}
              </span>
              <span style={{
                // O alerta é frase, não número: menor e sem negrito de valor,
                // para não competir com os campos que são de fato confiáveis.
                fontSize: tipo === 'alerta' ? 12.5 : 16,
                fontWeight: tipo === 'alerta' ? 600 : 700,
                lineHeight: tipo === 'alerta' ? 1.4 : 1.25,
                color: (tipo && COR[tipo]) || '#0a1628',
                fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere',
              }}>
                {valor || '—'}
              </span>
            </div>
          ))}
        </div>

        {analise.analiseAtual && (
          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid #e0ecf8',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, color: '#6080a0' }}>
              {origem === 'banco'
                ? 'Vem do banco do CRM, publicado pela análise de crédito. O limite aprovado acima é decisão do comitê e não muda por aqui.'
                : 'Vem do Sistema de Análises, nesta máquina, e ainda não foi publicado no banco. O limite aprovado acima é decisão do comitê e não muda por aqui.'}
            </span>
            {/* O botão só aparece na máquina onde o sistema roda: o endereço é
                127.0.0.1, e em outro computador (ou no celular) ele seria um
                link morto. Melhor não oferecer do que oferecer quebrado. */}
            {origem === 'local' && (
              <a
                href={enderecoDaAnalise(analise.analiseAtual)}
                target="_blank"
                rel="noreferrer"
                className="btn-export"
                style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                🔎 Abrir a análise
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

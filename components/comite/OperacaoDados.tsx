'use client'

// ============================================================================
//  OperacaoDados — aba "Dados" do Comitê (dossiê da operação + do tomador).
//  Inspirado no padrão visual da tela Contábil (card-panel, section-title,
//  Campo) com seções colapsáveis (Ver / Ocultar) e o Organograma Societário
//  reaproveitado (OrganogramaView, somente leitura). Busca o tomador completo
//  e os sócios sob demanda — os dados embutidos em `op` são parciais.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Operacao, Tomador, Socio } from '@/types'
import { fmtMoeda, fmtPercent, maskCNPJ, maskCEP, maskTelefone, fmtData, badgeClassTomador, badgeClassOperacao } from '@/lib/utils'
import { montarArvore, extrairDiretores, contarSocios } from '@/lib/relatorio-socios'
import { vigenciaTxt } from '@/lib/comite/calculo'
import OrganogramaView from '@/components/OrganogramaView'

interface Props {
  op: Operacao
}

// Campo rótulo/valor (mesmo padrão da tela Contábil).
function Campo({ label, valor, full }: { label: string; valor: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0', borderBottom: '1px solid #eef3f9', gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: '#0a1628', fontWeight: 500, wordBreak: 'break-word' }}>{valor || '—'}</span>
    </div>
  )
}

const gridCampos = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0 18px' } as const

// Seção colapsável com cabeçalho clicável (Ver ▼ / Ocultar ▲).
function Secao({ titulo, cor, extra, aberta, onToggle, children }: {
  titulo: string; cor: string; extra?: React.ReactNode; aberta: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 16px', background: aberta ? '#f6f9fd' : '#fff', border: 'none', borderBottom: aberta ? '1px solid #eef3f9' : 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <div className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="dot" style={{ background: cor }} />{titulo}{extra}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3070c8', whiteSpace: 'nowrap' }}>{aberta ? 'Ocultar ▲' : 'Ver ▼'}</span>
      </button>
      {aberta && <div style={{ padding: '12px 16px 16px' }}>{children}</div>}
    </div>
  )
}

export default function OperacaoDados({ op }: Props) {
  const [tomador, setTomador] = useState<Tomador | null>(null)
  const [socios, setSocios] = useState<Socio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abreOp, setAbreOp] = useState(true)
  const [abreTom, setAbreTom] = useState(true)
  const [abreOrg, setAbreOrg] = useState(false)

  const carregar = useCallback(async () => {
    if (!op.tomador_id) { setCarregando(false); return }
    setCarregando(true)
    const supabase = createClient()
    const [{ data: tom }, { data: socs }] = await Promise.all([
      supabase.from('tomadores').select('*, corretora:corretoras(id,razao_social,nome_fantasia)').eq('id', op.tomador_id).maybeSingle(),
      supabase.from('socios').select('*').eq('tomador_id', op.tomador_id).eq('ativo', true).order('ordem'),
    ])
    setTomador((tom as Tomador) ?? null)
    setSocios((socs as Socio[]) ?? [])
    setCarregando(false)
  }, [op.tomador_id])

  useEffect(() => { carregar() }, [carregar])

  const arvore = montarArvore(socios)
  const diretores = extrairDiretores(socios)
  const nSocios = contarSocios(arvore)

  const tomNome = tomador?.razao_social ?? op.tomador?.razao_social ?? '—'
  const tomCnpj = tomador?.cnpj ?? op.tomador?.cnpj ?? null
  const corretoraNome = op.corretora?.nome_fantasia ?? op.corretora?.razao_social ?? tomador?.corretora?.nome_fantasia ?? tomador?.corretora?.razao_social ?? '—'

  const endereco = tomador ? [
    tomador.endereco,
    tomador.numero ? `nº ${tomador.numero}` : null,
    tomador.complemento,
    tomador.bairro,
  ].filter(Boolean).join(', ') : ''
  const cidadeUf = tomador ? [tomador.cidade, tomador.estado].filter(Boolean).join('/') : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabeçalho — identificação única (não repetida nas seções abaixo) */}
      <div className="card-panel" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#3070c8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 }}>📑 Dossiê da Operação</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#0a1628', lineHeight: 1.2 }}>{tomNome}</div>
            <div style={{ fontSize: 12.5, color: '#6080a0', marginTop: 4 }}>{tomCnpj ? maskCNPJ(tomCnpj) : '—'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span className={`badge ${badgeClassOperacao(op.status)}`}>Operação: {op.status}</span>
              {tomador?.status && <span className={`badge ${badgeClassTomador(tomador.status)}`}>Tomador: {tomador.status}</span>}
              {op.temperatura && <span className="dossie-chip">🌡️ {op.temperatura}</span>}
              {(op.tomador?.porte || tomador?.porte) && <span className="dossie-chip">🏢 {op.tomador?.porte ?? tomador?.porte}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ background: '#f3f8fd', border: '1px solid #d8e6f5', borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
              <div className="dossie-mini-label">LMG (Limite FAM)</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#16407a' }}>{op.lmg ? fmtMoeda(op.lmg) : '—'}</div>
            </div>
            <div style={{ background: 'linear-gradient(180deg,#fffdf3,#fbf4dd)', border: '1px solid #ecdfb4', borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
              <div className="dossie-mini-label" style={{ color: '#a07b1e' }}>Prêmio Previsto</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#1a6a40' }}>{op.premio_previsto ? fmtMoeda(op.premio_previsto) : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Dados da Operação */}
      <Secao titulo="Dados da Operação" cor="#3070c8" aberta={abreOp} onToggle={() => setAbreOp(v => !v)}>
        <div style={gridCampos}>
          <Campo label="Produto" valor={op.produto?.nome} />
          <Campo label="Modalidade" valor={op.modalidade} />
          <Campo label="Código da Cobertura" valor={op.codigo_cobertura} />
          <Campo label="Estado (risco)" valor={op.estado} />
          <Campo label="LMG (Limite Máximo de Garantia)" valor={op.lmg ? fmtMoeda(op.lmg) : null} />
          <Campo label="Taxa" valor={op.taxa ? fmtPercent(op.taxa / 100) : null} />
          <Campo label="Vigência" valor={vigenciaTxt(op)} />
          <Campo label="Prêmio Previsto" valor={op.premio_previsto ? fmtMoeda(op.premio_previsto) : null} />
          <Campo label="Temperatura" valor={op.temperatura} />
          <Campo label="Prioridade da Operação" valor={op.prioridade} />
          <Campo label="Data de Entrada" valor={op.data_entrada ? fmtData(op.data_entrada) : null} />
          <Campo label="Data de Emissão" valor={op.data_emissao ? fmtData(op.data_emissao) : null} />
        </div>
        {op.observacao && (
          <div style={{ marginTop: 6 }}><Campo label="Observação da Operação" valor={op.observacao} full /></div>
        )}
      </Secao>

      {/* Dados do Tomador */}
      <Secao titulo="Dados do Tomador" cor="#27a96c"
        extra={carregando ? <span style={{ fontSize: 11, color: '#9ab0c8', fontWeight: 500 }}>carregando…</span> : undefined}
        aberta={abreTom} onToggle={() => setAbreTom(v => !v)}>
        {carregando ? (
          <div style={{ fontSize: 13, color: '#6080a0', padding: '6px 0' }}>Carregando dados do tomador…</div>
        ) : !tomador ? (
          <div style={{ fontSize: 13, color: '#6080a0', padding: '6px 0' }}>Operação sem tomador vinculado.</div>
        ) : (
          <>
            <div style={gridCampos}>
              <Campo label="Nome Fantasia" valor={tomador.nome_fantasia} />
              <Campo label="Corretora (vínculo)" valor={corretoraNome} />
              <Campo label="Porte" valor={tomador.porte} />
              <Campo label="Limite Aprovado" valor={tomador.limite_aprovado != null ? fmtMoeda(tomador.limite_aprovado) : null} />
              <Campo label="Prioridade do Tomador" valor={tomador.prioridade} />
              <Campo label="Data de Entrada (cadastro)" valor={tomador.data_entrada ? fmtData(tomador.data_entrada) : null} />
            </div>

            <div className="section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}><span className="dot" style={{ background: '#3070c8' }} />Contato</div>
            <div style={gridCampos}>
              <Campo label="Responsável" valor={tomador.responsavel} />
              <Campo label="E-mail" valor={tomador.email} />
              <Campo label="Telefone" valor={tomador.telefone ? maskTelefone(tomador.telefone) : null} />
              <Campo label="Celular" valor={tomador.celular ? maskTelefone(tomador.celular) : null} />
            </div>

            <div className="section-title" style={{ fontSize: 12, margin: '16px 0 6px' }}><span className="dot" style={{ background: '#e8b84b' }} />Endereço</div>
            <div style={gridCampos}>
              <Campo label="Logradouro" valor={endereco} full />
              <Campo label="Cidade/UF" valor={cidadeUf} />
              <Campo label="CEP" valor={tomador.cep ? maskCEP(tomador.cep) : null} />
            </div>

            {tomador.observacao && (
              <div style={{ marginTop: 6 }}><Campo label="Observação do Tomador" valor={tomador.observacao} full /></div>
            )}
          </>
        )}
      </Secao>

      {/* Organograma Societário — somente leitura, colapsável (fechado por padrão) */}
      <Secao titulo="Organograma Societário" cor="#e8b84b"
        extra={!carregando && (nSocios > 0 || diretores.length > 0)
          ? <span className="dossie-chip">👥 {nSocios} sócio(s){diretores.length > 0 ? ` · 👔 ${diretores.length} diretor(es)` : ''}</span>
          : undefined}
        aberta={abreOrg} onToggle={() => setAbreOrg(v => !v)}>
        {carregando ? (
          <div style={{ fontSize: 13, color: '#6080a0' }}>Carregando organograma…</div>
        ) : (nSocios === 0 && diretores.length === 0) ? (
          <div style={{ fontSize: 13, color: '#6080a0' }}>Nenhum sócio cadastrado. Monte o organograma na tela do Tomador.</div>
        ) : (
          <div className="fam-table-wrap" style={{ overflow: 'auto', background: '#fff', padding: 16, borderRadius: 8 }}>
            <OrganogramaView tomadorNome={tomNome} tomadorDoc={tomCnpj} arvore={arvore} diretores={diretores} readOnly />
          </div>
        )}
      </Secao>
    </div>
  )
}

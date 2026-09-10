'use client'

// ============================================================================
//  GESTÃO  ·  o retrato do acervo
//
//  Porte da aba Gestão do cockpit, no desenho da versão executiva que ele
//  aprovou em 30/08/2026: 4 tiles finos em cima, 3 cartões por linha embaixo
//  (Produção por mês, Decisão, Nível de risco, Setores, Corretoras, Revisão).
//
//  As contas saem de `lib/analise/retrato.ts`, sobre as análises VIGENTES do
//  banco, e são as mesmas que a Sala de Comando usa. As abas "Sua performance"
//  e "Análise prévia" do cockpit comparam a versão gerada com a revisada e
//  leem documento avulso: as duas dependem de material que só existe no disco
//  dele, e por isso continuam no Sistema local até o dado subir.
// ============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { retratoDoAcervo, reaisMi, COLUNAS_RETRATO, type LinhaRetrato, type Retrato } from '@/lib/analise/retrato'
import { Barras, Colunas, Tile } from './Graficos'

const fmt1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function Gestao({ aoAbrirSistema }: { aoAbrirSistema?: () => void }) {
  const [g, setG] = useState<Retrato | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    supabase.from('analises').select(COLUNAS_RETRATO).limit(2000).then(({ data, error }) => {
      if (!vivo) return
      if (error) { setErro(error.message); return }
      setG(retratoDoAcervo((data ?? []) as unknown as LinhaRetrato[]))
    })
    return () => { vivo = false }
  }, [])

  if (erro) return <div className="alert-error">{erro}</div>
  if (!g) return <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>medindo o acervo…</p></div>

  const ultimo = g.porMes[g.porMes.length - 1]

  return (
    <div>
      <div className="an-tiles">
        <Tile r="Análises no acervo" v={g.total} n={g.versoesAnteriores ? `${g.empresas} empresas, ${g.versoesAnteriores} são versões anteriores` : `${g.empresas} empresas, o acervo inteiro`} />
        <Tile r="Revisadas por você" v={g.total ? Math.round((g.revisadas / g.total) * 100) : 0} u="%" n={`${g.revisadas} de ${g.total}, ${g.naFila} na fila`} />
        <Tile r="Aprovação, e quanto dela é limpa" v={fmt1(g.aprovacao.totalPct)} u="%" cor="ouro"
          n={<><b>{fmt1(g.aprovacao.limpoPct)}%</b> sem ressalva, {g.aprovacao.comRessalva} condicionadas</>} />
        <Tile r="Limite efetivo mediano" v={reaisMi(g.limite.mediana)} n={`${g.limite.efetivos} entram, ${g.total - g.limite.efetivos} fora (teto, teórico ou sem número)`} />
      </div>

      <div className="an-grade">
        <div className="an-cartao">
          <h2>Produção por mês</h2>
          <div className="nota">Pela data da análise, últimos 12 meses.</div>
          <Colunas meses={g.porMes} />
          {ultimo?.emCurso && <div className="rodape">O mês atual está <b>em curso</b>, então a coluna baixa não é queda de produção.</div>}
        </div>

        <div className="an-cartao">
          <h2>Decisão</h2>
          <div className="nota">Conjunto fechado de 5. A ressalva fica separada da aprovação limpa, sempre.</div>
          <Barras itens={g.decisao} />
          <div className="rodape">A soma “aprovado” de {g.aprovacao.limpo + g.aprovacao.comRessalva} esconde que <b>{g.aprovacao.comRessalva} saíram condicionadas</b>.</div>
        </div>

        <div className="an-cartao">
          <h2>Nível de risco</h2>
          <div className="nota">Como a análise classificou, na vigente de cada empresa.</div>
          <Barras itens={g.nivel} cor="#3070c8" />
        </div>

        <div className="an-cartao">
          <h2>Setores</h2>
          <div className="nota">Os oito setores com mais análises.</div>
          <Barras itens={g.setor} cor="#3fae82" />
        </div>

        <div className="an-cartao">
          <h2>Corretoras que mais trazem caso</h2>
          <div className="nota">{g.corretoras.quantas} corretoras ativas · as 5 maiores concentram {fmt1(g.corretoras.top5Pct)}%.</div>
          <Barras itens={g.corretoras.top.map(c => ({ rot: c.nome, n: c.n }))} cor="#e8b84b" />
        </div>

        <div className="an-cartao">
          <h2>Sua performance e a Análise prévia</h2>
          <div className="nota">As duas outras telas da Gestão do cockpit.</div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#26374a', margin: 0 }}>
            <b>Sua performance</b> compara o que eu entreguei com o que você reescreveu, análise a análise. <b>Análise prévia</b> lê um documento avulso antes de gastar a esteira. As duas dependem de material que só existe no disco do notebook (a versão gerada e o documento solto), e por isso continuam no Sistema local até esse dado subir para o banco.
          </p>
          {aoAbrirSistema && <div className="an-bt-linha" style={{ marginTop: 10 }}><button type="button" className="an-bt" onClick={aoAbrirSistema}>Abrir no Sistema local</button></div>}
        </div>
      </div>
    </div>
  )
}

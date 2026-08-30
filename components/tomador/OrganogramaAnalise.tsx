'use client'

// ============================================================================
//  O ORGANOGRAMA QUE A ANÁLISE MAPEOU, dentro da Mesa do Tomador.
//
//  É o desenho que o Marco aprovou no artefato de 30/08: cartões aninhados, em
//  texto, que abrem e fecham, com o percentual na ponta direita e os irmãos
//  demais dobrados num "+ N". Tem tela cheia, como o organograma da análise.
//
//  A fonte é `analises.estrutura_societaria` ({entidades, participacoes}), o
//  mesmo JSON que a skill organograma-fam entrega. Não é a tabela `socios` do
//  CRM: aquela é digitada, esta vem da análise, sem retrabalho.
//
//  Regras de leitura, para não inventar vínculo:
//   • raiz é quem não recebe participação de ninguém (os controladores PF);
//   • um nó só aparece UMA vez (o primeiro caminho ganha; o resto vira "também
//     em"), porque o grafo tem sócio PF que participa direto numa SPE;
//   • percentual é o texto da análise, e "Não comprovado" fica escrito assim.
// ============================================================================

import { useMemo, useState } from 'react'

export interface EntidadeOrg {
  id: string
  nome: string
  cnpj: string | null
  tipo: 'pf' | 'emp'
  papel: string | null
  selos: string[]
  capital_social: string | null
  diretores: { nome: string | null; cargo: string | null }[]
  sem_vinculo: boolean
}
export interface ParticipacaoOrg { de: string; para: string; percentual: string | null; fonte: string | null }
export interface EstruturaSocietaria { entidades: EntidadeOrg[]; participacoes: ParticipacaoOrg[] }

interface No { ent: EntidadeOrg; rotulo: string; filhos: No[] }

const MAX_VISIVEIS = 3

/** O que vai na ponta direita do cartão: "98%", "controlada", "coligada"… */
function rotuloDe(p: string | null): string {
  if (!p) return ''
  const m = p.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/)
  if (m && !/n[ãa]o comprovad/i.test(p)) return m[1].replace('.', ',') + '%'
  if (/coligad/i.test(p)) return 'coligada'
  if (/controlad/i.test(p)) return 'controlada'
  if (/n[ãa]o comprovad/i.test(p)) return 'a comprovar'
  return p.length > 22 ? p.slice(0, 21) + '…' : p
}

function montar(e: EstruturaSocietaria): { raizes: No[]; total: number } {
  const porId = new Map(e.entidades.map(x => [x.id, x]))
  const recebe = new Set(e.participacoes.map(p => p.para))
  const filhosDe = new Map<string, ParticipacaoOrg[]>()
  for (const p of e.participacoes) {
    if (!filhosDe.has(p.de)) filhosDe.set(p.de, [])
    filhosDe.get(p.de)!.push(p)
  }
  const visto = new Set<string>()
  const cresce = (id: string, rotulo: string): No | null => {
    const ent = porId.get(id)
    if (!ent || visto.has(id)) return null
    visto.add(id)
    const filhos = (filhosDe.get(id) ?? [])
      .map(p => cresce(p.para, rotuloDe(p.percentual)))
      .filter(Boolean) as No[]
    // O tomador primeiro; depois quem tem percentual; depois o resto, por nome.
    filhos.sort((a, b) =>
      Number(b.ent.selos.includes('tomador')) - Number(a.ent.selos.includes('tomador'))
      || Number(/%$/.test(b.rotulo)) - Number(/%$/.test(a.rotulo))
      || a.ent.nome.localeCompare(b.ent.nome, 'pt-BR'))
    return { ent, rotulo, filhos }
  }
  // Raízes: quem não recebe participação. PF primeiro, e o tomador, se ele
  // mesmo for raiz, vai na frente. Órfãos (ciclo) entram no fim.
  const raizIds = e.entidades.filter(x => !recebe.has(x.id) && !x.sem_vinculo).map(x => x.id)
  const raizes = raizIds.map(id => cresce(id, '')).filter(Boolean) as No[]
  for (const x of e.entidades) if (!visto.has(x.id)) { const n = cresce(x.id, x.sem_vinculo ? 'sem vínculo' : ''); if (n) raizes.push(n) }
  raizes.sort((a, b) => Number(a.ent.tipo === 'emp') - Number(b.ent.tipo === 'emp'))
  return { raizes, total: e.entidades.length }
}

function Cartao({ no, nivel, abertos, alternar }: {
  no: No; nivel: number; abertos: Set<string>; alternar: (id: string) => void
}) {
  const [maisIrmaos, setMaisIrmaos] = useState(false)
  const aberto = abertos.has(no.ent.id)
  const tomador = no.ent.selos.includes('tomador')
  const temFilhos = no.filhos.length > 0
  const visiveis = maisIrmaos ? no.filhos : no.filhos.slice(0, MAX_VISIVEIS)
  const escondidos = no.filhos.length - visiveis.length

  return (
    <div className="mt-org-no">
      <button type="button" className={`mt-org-cartao${tomador ? ' tomador' : ''}${no.ent.tipo === 'pf' ? ' pf' : ''}`}
        onClick={() => alternar(no.ent.id)} aria-expanded={aberto}>
        <span className="mt-org-seta">{temFilhos || no.ent.papel ? (aberto ? '▾' : '▸') : ''}</span>
        <span className="mt-org-nome">
          {no.ent.nome}
          {tomador && <span className="mt-org-selo"> · o tomador</span>}
          {no.ent.tipo === 'pf' && <span className="mt-org-tipo">PF</span>}
        </span>
        <span className={`mt-org-pct${/%$/.test(no.rotulo) ? ' n' : ''}`}>{tomador && !no.rotulo ? 'topo' : no.rotulo}</span>
      </button>

      {aberto && (
        <div className="mt-org-detalhe">
          {no.ent.cnpj && <span className="mt-org-cnpj">{no.ent.cnpj}</span>}
          {no.ent.papel && <span>{no.ent.papel}</span>}
          {no.ent.capital_social && <span>Capital social {no.ent.capital_social}</span>}
          {no.ent.diretores.length > 0 && (
            <span>{no.ent.diretores.map(d => [d.nome, d.cargo].filter(Boolean).join(', ')).join(' · ')}</span>
          )}
        </div>
      )}

      {aberto && temFilhos && (
        <div className="mt-org-filhos" style={{ marginLeft: nivel >= 4 ? 8 : 18 }}>
          {visiveis.map(f => <Cartao key={f.ent.id} no={f} nivel={nivel + 1} abertos={abertos} alternar={alternar} />)}
          {escondidos > 0 && (
            <button type="button" className="mt-org-cartao mais" onClick={() => setMaisIrmaos(true)}>
              <span className="mt-org-seta" />
              <span className="mt-org-nome">+ {escondidos} {escondidos === 1 ? 'empresa' : 'empresas'}</span>
              <span className="mt-org-pct">ver</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function OrganogramaAnalise({ estrutura, dataAnalise }: {
  estrutura: EstruturaSocietaria; dataAnalise: string
}) {
  const { raizes, total } = useMemo(() => montar(estrutura), [estrutura])
  const ids = useMemo(() => estrutura.entidades.map(e => e.id), [estrutura])

  // Nasce aberto até o tomador e os filhos dele; o resto o Marco abre.
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    const s = new Set<string>()
    const desce = (n: No, prof: number) => { if (prof <= 2) { s.add(n.ent.id); n.filhos.forEach(f => desce(f, prof + 1)) } }
    raizes.forEach(r => desce(r, 0))
    return s
  })
  const [telaCheia, setTelaCheia] = useState(false)

  const alternar = (id: string) => setAbertos(prev => {
    const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s
  })
  const todos = () => setAbertos(new Set(ids))
  const nenhum = () => setAbertos(new Set())

  const pfs = estrutura.entidades.filter(e => e.tipo === 'pf').length
  const corpo = (
    <>
      <div className="mt-org-barra">
        <span className="mt-org-meta">{total - pfs} empresas · {pfs} sócios PF · da análise de {dataAnalise}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="mt-btn" onClick={todos}>Abrir tudo</button>
        <button type="button" className="mt-btn" onClick={nenhum}>Fechar tudo</button>
        <button type="button" className="mt-btn pri" onClick={() => setTelaCheia(v => !v)}>
          {telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </div>
      <div className="mt-org-arvore">
        {raizes.map(r => <Cartao key={r.ent.id} no={r} nivel={0} abertos={abertos} alternar={alternar} />)}
      </div>
    </>
  )

  if (telaCheia) {
    return (
      <div className="mt-org-cheia" role="dialog" aria-label="Organograma em tela cheia">
        <div className="mt-org-cheia-corpo">{corpo}</div>
      </div>
    )
  }
  return corpo
}

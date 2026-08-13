'use client'

// ============================================================
//  Blocos da Apresentação Executiva, nas duas "peles":
//   • diretoria → tela 16:9 escura, para projetar
//   • caderno   → página A4 clara, para imprimir e entregar
//
//  Cada bloco é escrito UMA vez e lê as cores da pele, então os dois formatos
//  nunca divergem em conteúdo. Os slides são renderizados em tamanho REAL
//  (1600x900 / 1240x1754) e só reduzidos por transform na hora de exibir:
//  assim o PNG e o PDF saem na resolução cheia, sem depender do zoom da tela.
//
//  Tipografia: 'Calibri','Segoe UI',sans-serif, a mesma de todo o CRM.
//  Paletas dos gráficos: validadas para daltonismo e contraste sobre cada fundo.
// ============================================================
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import type { DadosApresentacao, LinhaRanking } from '@/lib/apresentacao/dados'

export const FONTE = "'Calibri','Segoe UI',sans-serif"

export interface Pele {
  id: 'diretoria' | 'caderno'
  nome: string
  descricao: string
  largura: number
  altura: number
  fundo: string
  superficie: string
  tinta: string
  tinta2: string
  tinta3: string
  acento: string
  linha: string
  series: [string, string, string, string]
}

export const PELES: Record<Pele['id'], Pele> = {
  diretoria: {
    id: 'diretoria',
    nome: 'Sala de Diretoria',
    descricao: 'Telas 16:9 escuras, para projetar na parede',
    largura: 1600, altura: 900,
    fundo: '#0b1524', superficie: '#122240',
    tinta: '#ffffff', tinta2: '#c3d2e6', tinta3: '#7f95b5',
    acento: '#e8b84b', linha: '#1b2c46',
    series: ['#4a8ada', '#b28b30', '#2f9a80', '#cf5c45'],
  },
  caderno: {
    id: 'caderno',
    nome: 'Caderno do Conselho',
    descricao: 'Páginas A4 claras, para imprimir e entregar',
    largura: 1240, altura: 1754,
    fundo: '#fdfcfa', superficie: '#f2f5fa',
    tinta: '#141a24', tinta2: '#3c4452', tinta3: '#7b8494',
    acento: '#96721c', linha: '#e2e6ee',
    series: ['#3168c4', '#b5821c', '#188a72', '#c24630'],
  },
}

// ─── Blocos disponíveis ──────────────────────────────────────────────────────

export interface Bloco {
  id: string
  titulo: string
  descricao: string
}

export const BLOCOS: Bloco[] = [
  { id: 'capa', titulo: 'Capa', descricao: 'Marca, período e título da reunião' },
  { id: 'retrato', titulo: 'Retrato de hoje', descricao: 'Prêmio, exposição, base e ticket médio' },
  { id: 'evolucao', titulo: 'Evolução mensal', descricao: 'Apólices e prêmio, mês a mês' },
  { id: 'vigencia', titulo: 'Prêmio por mês de vigência', descricao: 'A leitura corrigida, ao lado da emissão' },
  { id: 'funil', titulo: 'Funil de operações', descricao: 'Da entrada até a apólice, com as recusas' },
  { id: 'eficiencia', titulo: 'Disciplina de subscrição', descricao: 'Recusados e perdidos, com o racional' },
  { id: 'corretoras', titulo: 'Corretoras', descricao: 'Quem traz o negócio e a concentração' },
  { id: 'modalidades', titulo: 'Mix por modalidade', descricao: 'Onde o prêmio está concentrado' },
  { id: 'pipeline', titulo: 'O que está na mesa', descricao: 'Aprovados à espera de emissão e a esteira' },
  { id: 'fechamento', titulo: 'Fechamento', descricao: 'Síntese dos números e o próximo passo' },
]

// ─── Formatação ──────────────────────────────────────────────────────────────

function moedaCurta(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mi`
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`
  return fmtMoeda(v)
}

const dataExtenso = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

// ─── Peças reaproveitadas pelos blocos ───────────────────────────────────────

// Escala tudo pela largura do slide: um bloco escrito para 1600px de largura
// funciona igual no A4 de 1240px, sem duplicar medidas.
function u(pele: Pele, valor: number): number {
  return (valor * pele.largura) / 1600
}

function Marca({ pele, tamanho = 1 }: { pele: Pele; tamanho?: number }) {
  const esc = (n: number) => u(pele, n * tamanho)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: esc(16) }}>
      <span style={{ fontSize: esc(42), fontWeight: 700, letterSpacing: '.02em', color: pele.tinta, lineHeight: 1 }}>FAM</span>
      <span style={{ width: 1, height: esc(34), background: pele.acento }} />
      <span style={{ fontSize: esc(11), fontWeight: 600, letterSpacing: '.42em', color: pele.acento }}>SEGURADORA</span>
    </div>
  )
}

function Moldura({
  pele, rotulo, titulo, pagina, total, children, nota,
}: {
  pele: Pele; rotulo: string; titulo: string; pagina: number; total: number
  children: React.ReactNode; nota?: string
}) {
  const claro = pele.id === 'caderno'
  return (
    <>
      <div style={{ height: u(pele, 4), background: claro ? '#1e4080' : `linear-gradient(90deg,${pele.acento} 0%,${pele.acento} 34%,#1e4080 34%)` }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: `${u(pele, 46)}px ${u(pele, 62)}px ${u(pele, 30)}px`, minHeight: 0 }}>
        {claro && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: u(pele, 16), borderBottom: `1.5px solid #1e4080`, marginBottom: u(pele, 26) }}>
            <Marca pele={pele} tamanho={0.62} />
            <span style={{ fontSize: u(pele, 15), color: pele.tinta3 }}>Reunião de Sócios</span>
          </div>
        )}
        <div style={{ fontSize: u(pele, 13), fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: pele.acento }}>{rotulo}</div>
        <div style={{ fontSize: u(pele, 40), fontWeight: claro ? 600 : 600, letterSpacing: '-.02em', color: pele.tinta, lineHeight: 1.1, marginTop: u(pele, 8) }}>{titulo}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: u(pele, 30) }}>{children}</div>
        {nota && (
          <div style={{ fontSize: u(pele, 16), color: pele.tinta2, lineHeight: 1.5, marginTop: u(pele, 18), maxWidth: '92%' }}>{nota}</div>
        )}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        margin: `0 ${u(pele, 62)}px ${u(pele, 26)}px`, paddingTop: u(pele, 14),
        borderTop: `1px solid ${pele.linha}`, fontSize: u(pele, 12), color: pele.tinta3, letterSpacing: '.06em',
      }}>
        <span>FAM Seguradora · Documento Confidencial</span>
        <span>{pagina} / {total}</span>
      </div>
    </>
  )
}

function Numero({ pele, rotulo, valor, pe, destaque }: { pele: Pele; rotulo: string; valor: string; pe?: string; destaque?: boolean }) {
  return (
    <div style={{ borderTop: `2px solid ${destaque ? pele.acento : (pele.id === 'caderno' ? '#1e4080' : '#1e4080')}`, paddingTop: u(pele, 15), display: 'flex', flexDirection: 'column', gap: u(pele, 4), minWidth: 0 }}>
      <span style={{ fontSize: u(pele, 12), fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase', color: pele.tinta3 }}>{rotulo}</span>
      <span style={{ fontSize: u(pele, 40), fontWeight: 600, letterSpacing: '-.025em', color: destaque ? pele.acento : pele.tinta, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
      {pe && <span style={{ fontSize: u(pele, 13), color: pele.tinta3 }}>{pe}</span>}
    </div>
  )
}

// Gráfico de barras verticais. Rótulo direto em cada barra: sem legenda,
// sem eixo Y, sem grade — o número já está escrito em cima.
function Barras({
  pele, dados, cor, formatar, destaqueMax,
}: {
  pele: Pele
  dados: { rotulo: string; valor: number }[]
  cor: string
  formatar: (v: number) => string
  destaqueMax?: boolean
}) {
  const max = Math.max(...dados.map(d => d.valor), 0) || 1
  const iMax = dados.findIndex(d => d.valor === max)
  // Altura em proporção à ALTURA do slide, não à largura. Com altura fixa
  // calculada pela largura, a folha A4 ficava com metade da página em branco;
  // com flex:1 puro, a barra crescia até tomar a folha inteira. O teto é uma
  // fração da própria folha: 55% da tela 16:9, 30% do A4.
  const teto = pele.altura * (pele.id === 'caderno' ? 0.30 : 0.55)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: u(pele, 8), flex: 1, minHeight: 0, maxHeight: teto }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(pele, 20), flex: 1, minHeight: 0 }}>
        {dados.map((d, i) => (
          <div key={d.rotulo} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: u(pele, 7), height: '100%' }}>
            <span style={{ fontSize: u(pele, 15), fontWeight: 600, color: pele.tinta2, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{formatar(d.valor)}</span>
            <div style={{
              width: '100%', height: `${Math.max((d.valor / max) * 100, 0.6)}%`, minHeight: u(pele, 3),
              background: destaqueMax && i === iMax ? pele.series[1] : cor,
              borderRadius: `${u(pele, 4)}px ${u(pele, 4)}px 0 0`,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: u(pele, 20), borderTop: `1px solid ${pele.linha}`, paddingTop: u(pele, 8) }}>
        {dados.map(d => (
          <span key={d.rotulo} style={{ flex: 1, textAlign: 'center', fontSize: u(pele, 14), color: pele.tinta3 }}>{d.rotulo}</span>
        ))}
      </div>
    </div>
  )
}

// Barras horizontais com rótulo à esquerda e valor à direita.
function BarrasH({
  pele, dados, formatar, altura,
}: {
  pele: Pele
  dados: { rotulo: string; valor: number; cor: string; extra?: string }[]
  formatar: (v: number) => string
  altura?: number
}) {
  const max = Math.max(...dados.map(d => d.valor), 0) || 1
  // Linhas de altura própria: no A4 elas não devem esticar até o rodapé, então
  // ficam ancoradas no topo em vez de centralizadas na sobra.
  const claro = pele.id === 'caderno'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: u(pele, claro ? 18 : 13),
      justifyContent: claro ? 'flex-start' : 'center',
      flex: claro ? 'none' : 1, minHeight: 0, height: altura,
    }}>
      {dados.map(d => (
        <div key={d.rotulo} style={{ display: 'grid', gridTemplateColumns: `${u(pele, 300)}px 1fr ${u(pele, 190)}px`, alignItems: 'center', gap: u(pele, 18) }}>
          <span style={{ fontSize: u(pele, 17), color: pele.tinta2, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.rotulo}</span>
          <div style={{ height: u(pele, 26), background: pele.superficie, borderRadius: u(pele, 3), overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(d.valor / max) * 100}%`, background: d.cor, borderRadius: u(pele, 3) }} />
          </div>
          <span style={{ fontSize: u(pele, 18), fontWeight: 600, color: pele.tinta, fontVariantNumeric: 'tabular-nums' }}>
            {formatar(d.valor)}
            {d.extra && <span style={{ fontSize: u(pele, 14), color: pele.tinta3, marginLeft: u(pele, 7), fontWeight: 400 }}>{d.extra}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function Tabela({
  pele, colunas, linhas, rodape,
}: {
  pele: Pele
  colunas: { nome: string; alinhar?: 'left' | 'right' | 'center'; largura?: string }[]
  linhas: (string | number)[][]
  rodape?: (string | number)[]
}) {
  const claro = pele.id === 'caderno'
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
      <thead>
        <tr>
          {colunas.map(c => (
            <th key={c.nome} style={{
              fontSize: u(pele, 13), fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              color: claro ? '#ffffff' : pele.tinta2, background: claro ? '#1a3560' : 'transparent',
              textAlign: c.alinhar ?? 'right', padding: `${u(pele, 11)}px ${u(pele, 12)}px`,
              borderBottom: `2px solid ${claro ? '#1a3560' : pele.linha}`, width: c.largura,
            }}>{c.nome}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} style={{ background: claro && i % 2 === 1 ? pele.superficie : 'transparent' }}>
            {l.map((cel, j) => (
              <td key={j} style={{
                fontSize: u(pele, 17), color: j === 0 ? pele.tinta : pele.tinta2,
                fontWeight: j === 0 ? 600 : 400,
                textAlign: colunas[j]?.alinhar ?? 'right',
                padding: `${u(pele, 11)}px ${u(pele, 12)}px`,
                borderBottom: `1px solid ${pele.linha}`,
              }}>{cel}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {rodape && (
        <tfoot>
          <tr>
            {rodape.map((cel, j) => (
              <td key={j} style={{
                fontSize: u(pele, 17), fontWeight: 700, color: claro ? '#1e4080' : pele.acento,
                textAlign: colunas[j]?.alinhar ?? 'right',
                padding: `${u(pele, 12)}px ${u(pele, 12)}px`,
                borderTop: `2px solid ${claro ? '#1e4080' : pele.linha}`,
                background: claro ? '#eef3fb' : 'transparent',
              }}>{cel}</td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

// ─── O slide ─────────────────────────────────────────────────────────────────

export function Slide({
  bloco, dados, pele, pagina, total, sumario,
}: {
  bloco: string; dados: DadosApresentacao; pele: Pele; pagina: number; total: number
  sumario?: { pagina: number; titulo: string }[]
}) {
  const d = dados
  const colunas = pele.id === 'caderno' ? 2 : 4
  const claro = pele.id === 'caderno'

  const conteudo = () => {
    switch (bloco) {

      case 'capa':
        return (
          <>
            <div style={{ height: u(pele, 4), background: claro ? '#1e4080' : `linear-gradient(90deg,${pele.acento} 0%,${pele.acento} 34%,#1e4080 34%)` }} />
            {/* Na tela 16:9 a capa é centrada; na folha A4 ela fica no terço
                superior e o resto vira sumário, senão sobra meia página em branco. */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              justifyContent: claro ? 'flex-start' : 'center',
              gap: u(pele, 26), padding: claro ? `${u(pele, 150)}px ${u(pele, 62)}px 0` : `0 ${u(pele, 62)}px`,
            }}>
              <Marca pele={pele} />
              <div>
                <div style={{ fontSize: u(pele, 15), fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: pele.acento }}>
                  Reunião de Sócios · Exercício {d.ano}
                </div>
                <div style={{ fontSize: u(pele, 62), fontWeight: 600, letterSpacing: '-.025em', color: pele.tinta, lineHeight: 1.08, marginTop: u(pele, 14), maxWidth: '22ch' }}>
                  Os números da FAM em {d.ano}
                </div>
                <div style={{ width: u(pele, 140), height: u(pele, 3), background: pele.acento, marginTop: u(pele, 22) }} />
              </div>
              <div style={{ fontSize: u(pele, 19), color: pele.tinta2 }}>
                {d.emitidas.qtd} {d.emitidas.qtd === 1 ? 'apólice emitida' : 'apólices emitidas'} · {moedaCurta(d.emitidas.premio)} de prêmio · {moedaCurta(d.emitidas.lmg)} de exposição
              </div>
              {claro && sumario && sumario.length > 0 && (
                <div style={{ marginTop: u(pele, 90), display: 'flex', flexDirection: 'column', gap: u(pele, 14) }}>
                  <div style={{ fontSize: u(pele, 13), fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: pele.acento, borderBottom: `1.5px solid #1e4080`, paddingBottom: u(pele, 12) }}>
                    Neste caderno
                  </div>
                  {sumario.map(s => (
                    <div key={s.pagina} style={{ display: 'flex', alignItems: 'baseline', gap: u(pele, 14), fontSize: u(pele, 20), color: pele.tinta2 }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: pele.tinta3, minWidth: u(pele, 30) }}>{String(s.pagina).padStart(2, '0')}</span>
                      <span style={{ flex: 1 }}>{s.titulo}</span>
                      <span style={{ flex: 'none', borderBottom: `1px dotted ${pele.linha}`, width: u(pele, 300) }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              margin: `0 ${u(pele, 62)}px ${u(pele, 26)}px`, paddingTop: u(pele, 14),
              borderTop: `1px solid ${pele.linha}`, fontSize: u(pele, 13), color: pele.tinta3,
            }}>
              <span>Dados extraídos do FAM CRM em {dataExtenso(d.geradoEm)}</span>
              <span>Documento Confidencial</span>
            </div>
          </>
        )

      case 'retrato':
        return (
          <Moldura pele={pele} rotulo="Capítulo 1 · onde estamos" titulo="O retrato de hoje" pagina={pagina} total={total}
            nota={`Base cadastrada de ${d.baseTomadores} tomadores, trazidos por ${d.baseCorretoras} corretoras. Das ${d.totalEsteira} operações que passaram pela esteira, ${d.emitidas.qtd} viraram apólice.`}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colunas},1fr)`, gap: u(pele, 26), marginBottom: u(pele, 34) }}>
              <Numero pele={pele} rotulo="Prêmio emitido" valor={moedaCurta(d.emitidas.premio)} pe={`${d.emitidas.qtd} apólices em ${d.ano}`} destaque />
              <Numero pele={pele} rotulo="Exposição (LMG)" valor={moedaCurta(d.emitidas.lmg)} pe="limite máximo de garantia" />
              <Numero pele={pele} rotulo="Tomadores na base" valor={String(d.baseTomadores)} pe={`por ${d.baseCorretoras} corretoras`} />
              <Numero pele={pele} rotulo="Ticket médio" valor={moedaCurta(d.emitidas.ticketMedio)} pe="prêmio por apólice" />
            </div>
            <div style={{ fontSize: u(pele, 18), fontWeight: 600, color: pele.tinta2, marginBottom: u(pele, 12) }}>
              Apólices emitidas por mês <span style={{ fontWeight: 400, color: pele.tinta3, fontSize: u(pele, 15) }}>quantidade</span>
            </div>
            <Barras pele={pele} dados={d.meses.map(m => ({ rotulo: m.mesLabel, valor: m.qtd }))}
              cor={pele.series[0]} formatar={v => String(v)} />
          </Moldura>
        )

      case 'evolucao': {
        // A folha A4 comporta os dois gráficos abaixo da tabela; a tela 16:9
        // não, então lá sai só o prêmio de emissão e a comparação fica no
        // bloco seguinte.
        const maiorQtd = [...d.meses].sort((a, b) => b.qtd - a.qtd)[0]
        return (
          <Moldura pele={pele} rotulo="Capítulo 2 · evolução" titulo={`Mês a mês, ${d.ano}`} pagina={pagina} total={total}
            nota={maiorQtd
              ? `${maiorQtd.mesLabel} foi o mês de maior volume, com ${maiorQtd.qtd} ${maiorQtd.qtd === 1 ? 'apólice' : 'apólices'}. Repare que o mês de maior volume não é o de maior prêmio: apólices longas concentram um valor alto num único lançamento.`
              : undefined}>
            <Tabela pele={pele}
              colunas={[
                { nome: 'Mês', alinhar: 'left' }, { nome: 'Apólices', alinhar: 'center' },
                { nome: 'Exposição' }, { nome: 'Prêmio na emissão' }, { nome: 'Prêmio / mês de vigência' }, { nome: 'Taxa média' },
              ]}
              linhas={d.meses.map(m => [m.mesLabel, m.qtd, moedaCurta(m.lmg), fmtMoeda(m.premio), fmtMoeda(m.premioMes), fmtPercent(m.taxaMedia / 100)])}
              rodape={['Total', d.emitidas.qtd, moedaCurta(d.emitidas.lmg), fmtMoeda(d.emitidas.premio), fmtMoeda(d.emitidas.premioMes), fmtPercent(d.emitidas.taxaMedia / 100)]}
            />
            <div style={{ marginTop: u(pele, 30), flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: u(pele, 26) }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: u(pele, 18), fontWeight: 600, color: pele.tinta2, marginBottom: u(pele, 12) }}>
                  Prêmio lançado na emissão <span style={{ fontWeight: 400, color: pele.tinta3, fontSize: u(pele, 15) }}>a apólice inteira entra no mês da emissão</span>
                </div>
                <Barras pele={pele} dados={d.meses.map(m => ({ rotulo: m.mesLabel, valor: m.premio }))}
                  cor={pele.series[0]} formatar={moedaCurta} destaqueMax />
              </div>
              {claro && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div style={{ fontSize: u(pele, 18), fontWeight: 600, color: pele.tinta2, marginBottom: u(pele, 12) }}>
                    Prêmio por mês de vigência <span style={{ fontWeight: 400, color: pele.tinta3, fontSize: u(pele, 15) }}>o que de fato entra em cada mês</span>
                  </div>
                  <Barras pele={pele} dados={d.meses.map(m => ({ rotulo: m.mesLabel, valor: m.premioMes }))}
                    cor={pele.series[2]} formatar={moedaCurta} destaqueMax />
                </div>
              )}
            </div>
          </Moldura>
        )
      }

      case 'vigencia': {
        const maiorMes = [...d.meses].sort((a, b) => b.premio - a.premio)[0]
        return (
          <Moldura pele={pele} rotulo="Capítulo 2 · como ler a receita" titulo="O mesmo prêmio, contado de duas formas" pagina={pagina} total={total}
            nota={maiorMes
              ? `${maiorMes.mesLabel} lidera nas duas leituras, mas por margens muito diferentes: à esquerda, o prêmio inteiro de apólices longas cai todo no mês da emissão; à direita, o que de fato entra a cada mês de vigência. A segunda leitura é a que mede desempenho.`
              : undefined}>
            <div style={{ display: 'grid', gridTemplateColumns: pele.id === 'caderno' ? '1fr' : '1fr 1fr', gap: u(pele, 40), flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: u(pele, 18), fontWeight: 600, color: pele.tinta2, marginBottom: u(pele, 12) }}>
                  Prêmio na emissão <span style={{ fontWeight: 400, color: pele.tinta3, fontSize: u(pele, 15) }}>apólice inteira no mês</span>
                </div>
                <Barras pele={pele} dados={d.meses.map(m => ({ rotulo: m.mesLabel, valor: m.premio }))}
                  cor={pele.series[0]} formatar={moedaCurta} destaqueMax />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: u(pele, 18), fontWeight: 600, color: pele.tinta2, marginBottom: u(pele, 12) }}>
                  Prêmio por mês de vigência <span style={{ fontWeight: 400, color: pele.tinta3, fontSize: u(pele, 15) }}>o que entra em cada mês</span>
                </div>
                <Barras pele={pele} dados={d.meses.map(m => ({ rotulo: m.mesLabel, valor: m.premioMes }))}
                  cor={pele.series[2]} formatar={moedaCurta} destaqueMax />
              </div>
            </div>
          </Moldura>
        )
      }

      case 'funil':
        return (
          <Moldura pele={pele} rotulo="Capítulo 3 · eficiência" titulo={`De ${d.totalEsteira} pedidos na mesa, ${d.emitidas.qtd} viraram apólice`} pagina={pagina} total={total}
            nota={`Posição da esteira inteira em ${dataExtenso(d.geradoEm)}, incluindo operações que entraram antes de ${d.ano}.`}>
            <BarrasH pele={pele}
              dados={d.funil.map(f => ({
                rotulo: f.status, valor: f.qtd, cor: f.cor,
                extra: `${moedaCurta(f.premio)}`,
              }))}
              formatar={v => String(v)} />
          </Moldura>
        )

      case 'eficiencia': {
        const pctRecusa = d.decididas > 0 ? d.recusadas / d.decididas : 0
        const pctEmissao = d.decididas > 0 ? d.emitidas.qtd / d.decididas : 0
        return (
          <Moldura pele={pele} rotulo="Capítulo 3 · disciplina" titulo="Recusar também é resultado" pagina={pagina} total={total}
            nota={`A recusa é o maior bloco das decisões tomadas e não deve ser lida como perda: é o filtro que sustenta a qualidade da carteira nesta fase de formação. O ponto de atenção são as ${d.perdidas} operações perdidas para a concorrência, o único bloco em que a decisão foi do cliente, e não nossa.`}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colunas},1fr)`, gap: u(pele, 26), marginBottom: u(pele, 36) }}>
              <Numero pele={pele} rotulo="Casos já decididos" valor={String(d.decididas)} pe="emitidos, recusados ou perdidos" />
              <Numero pele={pele} rotulo="Recusados pela subscrição" valor={String(d.recusadas)} pe={`${fmtPercent(pctRecusa)} das decisões`} destaque />
              <Numero pele={pele} rotulo="Perdidos para a concorrência" valor={String(d.perdidas)} pe="preço ou prazo de resposta" />
              <Numero pele={pele} rotulo="Aproveitamento" valor={fmtPercent(pctEmissao)} pe="decididos que viraram apólice" />
            </div>
            <BarrasH pele={pele}
              dados={[
                { rotulo: 'Emitido', valor: d.emitidas.qtd, cor: pele.series[2], extra: moedaCurta(d.emitidas.premio) },
                { rotulo: 'Recusado pela subscrição', valor: d.recusadas, cor: pele.series[3], extra: moedaCurta(d.funil.find(f => f.status === 'Recusado')?.premio ?? 0) },
                { rotulo: 'Perdido para a concorrência', valor: d.perdidas, cor: pele.series[1], extra: moedaCurta(d.funil.find(f => f.status === 'Perdido')?.premio ?? 0) },
              ]}
              formatar={v => String(v)} altura={u(pele, 200)} />
          </Moldura>
        )
      }

      case 'corretoras': {
        const top = d.corretoras.slice(0, pele.id === 'caderno' ? 12 : 8)
        const concentracao = d.corretoras.slice(0, 3).reduce((s, c) => s + c.pct, 0)
        return (
          <Moldura pele={pele} rotulo="Capítulo 4 · origem do negócio" titulo="Quem traz o prêmio" pagina={pagina} total={total}
            nota={`As três primeiras corretoras respondem por ${fmtPercent(concentracao)} do prêmio emitido em ${d.ano}. ${d.corretoras.length} ${d.corretoras.length === 1 ? 'corretora colocou' : 'corretoras colocaram'} negócio no período, de uma base cadastrada de ${d.baseCorretoras}.`}>
            <Tabela pele={pele}
              colunas={[{ nome: 'Corretora', alinhar: 'left' }, { nome: 'Apólices', alinhar: 'center' }, { nome: 'Prêmio' }, { nome: 'Exposição' }, { nome: 'Participação' }]}
              linhas={top.map((c: LinhaRanking) => [c.nome, c.qtd, fmtMoeda(c.premio), moedaCurta(c.lmg), fmtPercent(c.pct)])}
              rodape={['Total', d.emitidas.qtd, fmtMoeda(d.emitidas.premio), moedaCurta(d.emitidas.lmg), '100,00%']}
            />
          </Moldura>
        )
      }

      case 'modalidades':
        return (
          <Moldura pele={pele} rotulo="Capítulo 4 · composição" titulo="Onde o prêmio está concentrado" pagina={pagina} total={total}
            nota={`Mix por modalidade das ${d.emitidas.qtd} apólices emitidas em ${d.ano}. Taxa média ponderada da carteira: ${fmtPercent(d.emitidas.taxaPonderada / 100)}, em base anual.`}>
            <BarrasH pele={pele}
              dados={d.modalidades.slice(0, 7).map((m, i) => ({
                rotulo: m.nome, valor: m.premio, cor: pele.series[i % 4],
                extra: `${m.qtd} ${m.qtd === 1 ? 'apólice' : 'apólices'}`,
              }))}
              formatar={moedaCurta} />
          </Moldura>
        )

      case 'pipeline':
        return (
          <Moldura pele={pele} rotulo="Capítulo 5 · o que vem" titulo="O que está na mesa" pagina={pagina} total={total}
            nota={`As ${d.pipeline.qtd} operações aprovadas são o estoque mais próximo de virar receita: a subscrição já disse sim, falta emitir. Atrás delas há ${d.emAnalise.qtd} operações ainda em avaliação.`}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colunas},1fr)`, gap: u(pele, 26), marginBottom: u(pele, 34) }}>
              <Numero pele={pele} rotulo="Aprovadas, a emitir" valor={String(d.pipeline.qtd)} pe="subscrição já aprovou" destaque />
              <Numero pele={pele} rotulo="Prêmio potencial" valor={moedaCurta(d.pipeline.premio)} pe="se todas forem emitidas" />
              <Numero pele={pele} rotulo="Em avaliação" valor={String(d.emAnalise.qtd)} pe="para analisar, em análise e comitê" />
              <Numero pele={pele} rotulo="Prêmio em avaliação" valor={moedaCurta(d.emAnalise.premio)} pe="ainda sem decisão" />
            </div>
            <Tabela pele={pele}
              colunas={[{ nome: 'Situação', alinhar: 'left' }, { nome: 'Operações', alinhar: 'center' }, { nome: 'Exposição pedida' }, { nome: 'Prêmio potencial' }]}
              linhas={d.funil.map(f => [f.status, f.qtd, moedaCurta(f.lmg), fmtMoeda(f.premio)])}
              rodape={['Total na esteira', d.totalEsteira,
                moedaCurta(d.funil.reduce((s, f) => s + f.lmg, 0)),
                fmtMoeda(d.funil.reduce((s, f) => s + f.premio, 0))]}
            />
          </Moldura>
        )

      case 'fechamento': {
        const pctRecusa = d.decididas > 0 ? d.recusadas / d.decididas : 0
        return (
          <Moldura pele={pele} rotulo="Fechamento" titulo="O que os números dizem" pagina={pagina} total={total}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: u(pele, 22), flex: 1, justifyContent: 'center' }}>
              {[
                ['Produção', `${d.emitidas.qtd} apólices emitidas em ${d.ano}, somando ${moedaCurta(d.emitidas.premio)} de prêmio e ${moedaCurta(d.emitidas.lmg)} de exposição.`],
                ['Receita recorrente', `A carteira emitida passou a render ${fmtMoeda(d.emitidas.premioMes)} por mês de vigência, a medida que não se deixa distorcer por apólices longas.`],
                ['Seletividade', `${fmtPercent(pctRecusa)} dos casos decididos foram recusados pela subscrição. Carteira limpa antes de volume.`],
                ['Próximo passo', `${d.pipeline.qtd} operações aprovadas aguardam emissão, com ${moedaCurta(d.pipeline.premio)} de prêmio potencial. É a conversão mais rápida disponível.`],
              ].map(([titulo, texto]) => (
                <div key={titulo} style={{ display: 'grid', gridTemplateColumns: `${u(pele, 260)}px 1fr`, gap: u(pele, 26), alignItems: 'baseline', borderLeft: `3px solid ${pele.acento}`, paddingLeft: u(pele, 22) }}>
                  <span style={{ fontSize: u(pele, 17), fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: pele.acento }}>{titulo}</span>
                  <span style={{ fontSize: u(pele, 21), color: pele.tinta2, lineHeight: 1.5 }}>{texto}</span>
                </div>
              ))}
            </div>
          </Moldura>
        )
      }

      default:
        return null
    }
  }

  return (
    <div
      data-slide={bloco}
      style={{
        width: pele.largura, height: pele.altura, background: pele.fundo, color: pele.tinta,
        fontFamily: FONTE, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        position: 'relative', flex: 'none',
      }}
    >
      {conteudo()}
    </div>
  )
}

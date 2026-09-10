'use client'

// ============================================================================
//  O QUE A IA DESENHA  ·  tabela e gráfico de verdade, não markdown
//
//  Ordem dele em 09/09/2026: "a IA deve responder a criação de tabelas e
//  gráficos quando solicitado".
//
//  A escolha que faz esta peça existir: a IA NÃO escreve tabela em texto. Ela
//  chama uma ferramenta que devolve dado estruturado, e quem desenha é este
//  componente, com os mesmos tokens do resto do CRM. Duas consequências:
//  o gráfico é um gráfico (dá para passar o mouse, ler valor, exportar), e a
//  resposta não vira uma parede de pipes que ninguém lê no celular.
//
//  A ORIGEM APARECE SEMPRE. Gráfico sem origem é gráfico que ninguém pode
//  conferir, e este CRM já teve número assim.
// ============================================================================

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { fmtMoeda } from '@/lib/utils'

export interface Bloco {
  tipo: 'tabela' | 'grafico'
  titulo: string
  formato?: string | null
  dados: Record<string, unknown>
  origem?: string | null
}

/* A paleta é a do CRM, e não a padrão do Recharts: é a diferença entre "um
   gráfico" e "um gráfico deste sistema".

   Ela era uma cópia escrita aqui, e a cópia guardava um roxo que a regra de
   ouro proíbe. Passou a vir de lib/ui/painel.ts em 09/09/2026, que é o ponto
   inteiro daquele arquivo existir: token copiado à mão vira token divergente
   no primeiro ajuste. */
import { SERIE as CORES } from '@/lib/ui/painel'

/** Número grande vira legível no eixo: 12.500.000 -> "12,5 mi". Eixo com sete
 *  dígitos empurra o gráfico para fora da tela no celular. */
const curto = (v: number): string => {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (Math.abs(n) >= 1e9) return (n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/** Na célula da tabela: número vira número brasileiro, e o resto vira texto.
 *  Sem isto, 1234.5 apareceria com ponto decimal americano no meio de um
 *  relatório em português. */
const celula = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  return String(v)
}

function Moldura({ titulo, origem, children }: {
  titulo: string; origem?: string | null; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
      padding: '11px 12px 12px', marginTop: 10,
    }}>
      <div style={{
        fontSize: 12.5, fontWeight: 700, color: '#0a1628', marginBottom: 9,
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{ width: 3, height: 13, borderRadius: 2, background: '#e8b84b', flexShrink: 0 }} />
        {titulo}
      </div>
      {children}
      {origem && (
        <div style={{ fontSize: 10.5, color: 'var(--soft)', marginTop: 8, lineHeight: 1.45 }}>
          origem: {origem}
        </div>
      )}
    </div>
  )
}

export default function BlocoIA({ bloco }: { bloco: Bloco }) {
  if (bloco.tipo === 'tabela') {
    const colunas = (bloco.dados.colunas ?? []) as string[]
    const linhas = (bloco.dados.linhas ?? []) as unknown[][]
    if (!colunas.length || !linhas.length) return null

    return (
      <Moldura titulo={bloco.titulo} origem={bloco.origem}>
        {/* A rolagem é DA TABELA, e não da página: tabela larga não pode fazer
            a conversa inteira rolar de lado no celular. */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c} style={{
                    textAlign: 'left', padding: '5px 8px', color: '#1a3560', fontWeight: 700,
                    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} style={{ background: i % 2 ? '#f7fafd' : undefined }}>
                  {colunas.map((_, j) => (
                    <td key={j} style={{
                      padding: '5px 8px', color: '#26374a',
                      borderBottom: '1px solid #eef3f9',
                      textAlign: typeof l?.[j] === 'number' ? 'right' : 'left',
                      whiteSpace: 'nowrap',
                    }}>{celula(l?.[j])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Moldura>
    )
  }

  const eixo = String(bloco.dados.eixo ?? '')
  const series = (bloco.dados.series ?? []) as { campo: string; rotulo: string }[]
  const dados = (bloco.dados.dados ?? []) as Record<string, unknown>[]
  if (!dados.length || !series.length) return null

  const formato = bloco.formato ?? 'barra'
  const eixos = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e4ecf5" vertical={false} />
      <XAxis dataKey={eixo} tick={{ fontSize: 10.5, fill: '#6080a0' }} tickLine={false} axisLine={{ stroke: '#c5d5e8' }} />
      <YAxis tickFormatter={curto} tick={{ fontSize: 10.5, fill: '#6080a0' }} tickLine={false} axisLine={false} width={52} />
      <Tooltip
        formatter={(v: unknown) => (Math.abs(Number(v)) >= 1000 ? fmtMoeda(Number(v)) : curto(Number(v)))}
        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
      />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
    </>
  )

  return (
    <Moldura titulo={bloco.titulo} origem={bloco.origem}>
      <ResponsiveContainer width="100%" height={formato === 'pizza' ? 230 : 200}>
        {formato === 'pizza' ? (
          <PieChart>
            <Pie
              data={dados} dataKey={series[0].campo} nameKey={eixo}
              cx="50%" cy="50%" outerRadius={78} innerRadius={42} paddingAngle={2}
            >
              {dados.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
            </Pie>
            <Tooltip formatter={(v: unknown) => curto(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : formato === 'linha' ? (
          <LineChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            {eixos}
            {series.map((s, i) => (
              <Line key={s.campo} type="monotone" dataKey={s.campo} name={s.rotulo}
                stroke={CORES[i % CORES.length]} strokeWidth={2} dot={{ r: 2.5 }} />
            ))}
          </LineChart>
        ) : formato === 'area' ? (
          <AreaChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            {eixos}
            {series.map((s, i) => (
              <Area key={s.campo} type="monotone" dataKey={s.campo} name={s.rotulo}
                stroke={CORES[i % CORES.length]} fill={CORES[i % CORES.length]} fillOpacity={0.16} strokeWidth={2} />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            {eixos}
            {series.map((s, i) => (
              <Bar key={s.campo} dataKey={s.campo} name={s.rotulo}
                fill={CORES[i % CORES.length]} radius={[3, 3, 0, 0]} maxBarSize={44} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </Moldura>
  )
}

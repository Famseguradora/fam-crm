'use client'

// ============================================================================
//  A RÉGUA DO CARD  ·  "onde o card está", em toda a vida do tomador
//
//  Pedido dele em 28/09/2026, com a Eldorado de exemplo: o tomador subiu na
//  análise, faltavam documentos, e o card abria dentro do Crédito. "Quando eu
//  clico no Card desse tomador, deveria abrir dentro de Triagem/Cadastro, pois
//  é a etapa que se encontra." E a régua do Fluxo por área "deveria aparecer em
//  toda a vida do tomador".
//
//  O desenho é o da proposta da porta 3200 (a que ele gosta): os nós das áreas
//  ligados por uma haste em S, a área atual cheia, e as asas laterais para
//  passar à anterior e à próxima. A haste é GERADA pela quantidade de nós
//  (`curva`), e não um `d=` fixo: cada nó é uma área real da empresa, e o
//  sistema vai poder criar áreas novas.
//
//  Duas perguntas diferentes, e a régua mostra as duas:
//    · onde o card ESTÁ (`atual`): o nó cheio, "está aqui";
//    · qual área a pessoa está OLHANDO (`vendo`): o nó contornado.
//  Olhar outra área não move o card. Quem move é a esteira (até Crédito) e o
//  Concluir de cada área.
//
//  Um arquivo só, usado pelo card da Análise e pelo Fluxo por área do tomador.
// ============================================================================

import { useEffect, useRef } from 'react'
import { cor, raio } from '@/lib/ui/painel'
import { REGUA, nomeArea, type PostoCentral } from '@/lib/card/secoes'
import { IcoCarteira, IcoCheck, IcoGrafico, IcoEscudo } from '@/components/tomador/icones'

export type EstadoNo = 'feita' | 'parada' | null

function IcoEmissao({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="m9 15 2 2 4-4" />
    </svg>
  )
}

const ICONE: Record<PostoCentral, (p: { size?: number }) => React.ReactElement> = {
  comercial: IcoCarteira,
  cadastro: IcoCheck,
  credito: IcoGrafico,
  subscricao: IcoEscudo,
  juridico: IcoEscudo,
  emissao: IcoEmissao,
}

/** A haste entre os nós: cada nó no centro da sua fatia de 1000, a altura
 *  alternando entre 28 e 68, e um cúbico com os controles no meio (o "S"). */
function curva(n: number, ate = n - 1): string {
  if (n < 2 || ate < 1) return ''
  const fatia = 1000 / n
  const x = (i: number) => fatia * (i + 0.5)
  const y = (i: number) => (i % 2 === 0 ? 28 : 68)
  let d = `M ${x(0).toFixed(1)} ${y(0)}`
  for (let i = 1; i <= Math.min(ate, n - 1); i++) {
    const meio = ((x(i - 1) + x(i)) / 2).toFixed(1)
    d += ` C ${meio} ${y(i - 1)}, ${meio} ${y(i)}, ${x(i).toFixed(1)} ${y(i)}`
  }
  return d
}

const VARS = {
  '--rc-tinta': cor.tinta,
  '--rc-acao': cor.acao,
  '--rc-alerta': cor.alerta,
  '--rc-feita': cor.areaOperacao,
  '--rc-papel': cor.papel,
  '--rc-zebra': cor.papelZebra,
  '--rc-destaque': cor.destaque,
  '--rc-borda': cor.borda,
  '--rc-borda-ativa': cor.bordaAtiva,
  '--rc-sub': cor.textoSub,
  '--rc-fraco': cor.textoFraco,
  '--rc-r': `${raio.cartao}px`,
} as React.CSSProperties

const CSS = `
.rc { display: flex; align-items: flex-start; position: relative; isolation: isolate; margin: 6px 0 8px; min-height: 150px; }
.rc-curva { position: absolute; inset: 0 0 auto; width: 100%; height: 100px; z-index: -1; overflow: visible;
  filter: drop-shadow(0 5px 3px color-mix(in srgb, var(--rc-tinta) 16%, transparent)); }
.rc-curva path { fill: none; stroke: var(--rc-borda); stroke-width: 3; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.rc-curva .andou { stroke: var(--rc-acao); stroke-opacity: .45; }
.rc > button { flex: 1; min-width: 0; border: 0; background: none; cursor: pointer; font: inherit;
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px 0; color: var(--rc-sub); }
.rc > button:nth-of-type(even) { padding-top: 46px; }
.rc-no { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%;
  background: var(--rc-papel); border: 1px solid var(--rc-borda); margin-bottom: 5px; color: var(--rc-fraco);
  box-shadow: 0 4px 10px -6px var(--rc-sub);
  transition: transform .24s ease, border-color .24s ease, box-shadow .24s ease; }
.rc > button:hover .rc-no { transform: translateY(-3px); border-color: var(--rc-borda-ativa); }
.rc b { font-size: 12.5px; font-weight: 700; color: var(--rc-tinta); line-height: 1.3; text-align: center; }
.rc em { font-style: normal; font-size: 11px; color: var(--rc-fraco); min-height: 15px; text-align: center; }
.rc .acao { font-size: 11px; color: var(--rc-fraco); min-height: 15px; }
.rc > button:hover .rc-no { box-shadow: 0 8px 14px -8px var(--rc-tinta); }
.rc .feita .rc-no { border-color: var(--rc-feita); color: var(--rc-feita); box-shadow: 0 5px 12px -7px var(--rc-feita); }
.rc .parada .rc-no { border-color: var(--rc-alerta); color: var(--rc-alerta); box-shadow: 0 5px 12px -7px var(--rc-alerta); }
.rc .vendo .rc-no { border: 2px solid var(--rc-acao); color: var(--rc-acao); transform: translateY(-2px); box-shadow: 0 7px 14px -8px var(--rc-acao); }
.rc .vendo .acao { color: var(--rc-acao); font-weight: 700; }
.rc .aqui .rc-no { background: var(--rc-acao); color: #fff; border: 4px solid var(--rc-destaque); outline: 1px solid var(--rc-borda-ativa);
  box-shadow: 0 8px 16px -8px var(--rc-tinta); }
.rc .aqui b, .rc .aqui em { color: var(--rc-acao); }
.rc .aqui em { font-weight: 700; }
.rc-palco { display: grid; grid-template-columns: 34px minmax(0, 1fr) 34px; gap: 8px; align-items: stretch; perspective: 1000px; }
.rc-palco > .rc-meio { min-width: 0; transform-origin: 50% 20%; }
.rc-asa { border: 1px solid var(--rc-borda); border-radius: var(--rc-r); background: var(--rc-zebra); color: var(--rc-sub);
  cursor: pointer; font: inherit; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
  gap: 12px; padding: 18px 0; max-height: 320px; box-shadow: 0 7px 14px -12px var(--rc-tinta);
  transition: transform .24s ease, background .24s ease, box-shadow .24s ease; }
.rc-asa.anterior { transform: rotateY(14deg); }
.rc-asa.proxima { transform: rotateY(-14deg); }
.rc-asa span { writing-mode: vertical-rl; font-size: 11.5px; line-height: 1.2; }
.rc-asa.proxima span { rotate: 180deg; }
.rc-asa:hover:not(:disabled) { background: var(--rc-destaque); color: var(--rc-acao); border-color: var(--rc-borda-ativa); box-shadow: 0 9px 16px -10px var(--rc-tinta); }
.rc-asa.anterior:hover:not(:disabled) { transform: rotateY(6deg) translateX(-2px); }
.rc-asa.proxima:hover:not(:disabled) { transform: rotateY(-6deg) translateX(2px); }
.rc-asa:disabled { opacity: .35; cursor: default; }
@media (max-width: 700px) {
  .rc { min-height: 140px; }
  .rc b { font-size: 11px; }
  .rc em, .rc .acao { font-size: 10px; }
  .rc-no { width: 36px; height: 36px; }
  .rc > button { padding-top: 9px; }
  .rc > button:nth-of-type(even) { padding-top: 49px; }
  .rc-palco { display: block; }
  .rc-asa { display: none; }
}
@media (prefers-reduced-motion: reduce) { .rc-no, .rc-asa { transition: none; } }
`

export function EstiloRegua() {
  return <style>{CSS}</style>
}

export default function ReguaDoCard({ atual, vendo, estados, legenda, aoEscolher }: {
  /** onde o card está */
  atual: PostoCentral
  /** a área aberta na tela; sem ela, nenhum nó fica contornado */
  vendo?: PostoCentral | null
  /** concluída ou paralisada, por nó */
  estados?: Partial<Record<PostoCentral, EstadoNo>>
  /** a frase pequena embaixo do nome; sem ela, "está aqui" / "concluída" / "aguarda" */
  legenda?: (posto: PostoCentral) => string | null
  aoEscolher?: (posto: PostoCentral) => void
}) {
  return (
    <div style={VARS}>
      <EstiloRegua />
      <nav className="rc" aria-label="Onde o card está">
        <svg className="rc-curva" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={curva(REGUA.length)} />
          {/* o trecho que o caso já andou, até onde ele está */}
          <path className="andou" d={curva(REGUA.length, REGUA.indexOf(atual))} />
        </svg>
        {REGUA.map(posto => {
          const aqui = posto === atual
          const olhando = !!vendo && posto === vendo
          const estado = estados?.[posto] ?? null
          const Ico = ICONE[posto]
          const classe = [aqui ? 'aqui' : '', olhando && !aqui ? 'vendo' : '', estado ?? ''].filter(Boolean).join(' ')
          const frase = legenda?.(posto) ?? (aqui ? 'está aqui' : estado === 'feita' ? 'concluída' : estado === 'parada' ? 'paralisada' : 'aguarda')
          return (
            <button key={posto} type="button" className={classe || undefined}
              aria-current={aqui ? 'step' : undefined}
              aria-pressed={aoEscolher ? olhando : undefined}
              onClick={() => aoEscolher?.(posto)}
              style={aoEscolher ? undefined : { cursor: 'default' }}>
              <span className="rc-no" aria-hidden><Ico size={19} /></span>
              <b>{nomeArea(posto)}</b>
              <em>{frase}</em>
              {aoEscolher && <span className="acao">{olhando ? 'Visualizando' : 'Abrir'}</span>}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/** A área aberta entre as duas asas: passar à anterior ou à próxima sem subir
 *  até a régua. No celular as asas somem e a régua faz esse papel. */
export function PalcoDaRegua({ vendo, aoEscolher, children }: {
  vendo: PostoCentral
  aoEscolher: (posto: PostoCentral) => void
  children: React.ReactNode
}) {
  const i = REGUA.indexOf(vendo)
  const antes = i > 0 ? REGUA[i - 1] : undefined
  const depois = i >= 0 && i < REGUA.length - 1 ? REGUA[i + 1] : undefined
  /* A área nova chega do lado de onde veio: indo para a frente ela entra pela
     direita, voltando entra pela esquerda. É o gesto da proposta 3200.
     Sem remontar o conteúdo (uma `key` nova apagaria o rascunho da nota que
     a pessoa estava escrevendo): a animação é disparada no mesmo elemento. */
  const meio = useRef<HTMLDivElement>(null)
  const ultimo = useRef(i)
  useEffect(() => {
    const de = ultimo.current
    ultimo.current = i
    if (de === i || !meio.current?.animate) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const lado = i > de ? 1 : -1
    meio.current.animate(
      [{ opacity: 0, transform: `translateX(${lado * 36}px) rotateY(${lado * -2}deg)` }, { opacity: 1, transform: 'none' }],
      { duration: 380, easing: 'cubic-bezier(.2, .75, .25, 1)' },
    )
  }, [i])
  return (
    <div className="rc-palco" style={VARS}>
      <Asa lado="anterior" posto={antes} aoIr={aoEscolher} />
      <div className="rc-meio" ref={meio}>{children}</div>
      <Asa lado="proxima" posto={depois} aoIr={aoEscolher} />
    </div>
  )
}

function Asa({ lado, posto, aoIr }: { lado: 'anterior' | 'proxima'; posto: PostoCentral | undefined; aoIr: (p: PostoCentral) => void }) {
  const anterior = lado === 'anterior'
  return (
    <button type="button" className={`rc-asa ${lado}`} disabled={!posto}
      aria-label={posto ? `Ver ${nomeArea(posto)}` : anterior ? 'Não há área anterior' : 'Não há próxima área'}
      title={posto ? `Ver ${nomeArea(posto)}` : undefined}
      onClick={() => posto && aoIr(posto)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={anterior ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
      </svg>
      <span>{posto ? nomeArea(posto) : anterior ? 'Início' : 'Fim'}</span>
    </button>
  )
}

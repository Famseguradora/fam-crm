// ============================================================================
//  A FAIXA DA ÁREA E OS INSTRUMENTOS  ·  30/09/2026
//
//  As duas peças do topo de uma bancada, tiradas da Mesa da Subscrição (mockup
//  v2 de 29/09), que foi a referência que ele escolheu para refazer o Cadastro
//  e o Crédito: "ficou bem legal, se espelhe nessa tela".
//
//    FaixaDaArea ..... o recibo da área, no marinho com o filete dourado: a
//                      conclusão em letra grande, o que falta em pontos, uma
//                      referência no meio e as ações à direita.
//    Instrumentos .... a fileira de cartões logo abaixo, UM número por cartão
//                      e a origem no pé (regras 1 e 4 do docs/DESIGN-PAINEL.md).
//
//  Moram aqui, e não em cada tela, porque o pedido dele foi PADRONIZAR: a
//  bancada do Cadastro, a Visão geral do Crédito e, depois, a da Subscrição
//  têm de ter a mesma cara. O conteúdo é de cada área; a forma é uma só.
//
//  A largura manda por CONTAINER (`@container`), e não pela janela: a mesma
//  faixa mora na página larga do Funil e no card estreito da Análise. Por isso
//  é folha CSS (prefixo `pf-`) e não estilo inline, que não faz `@container`
//  nem `:hover`. Os valores vêm de lib/ui/painel.ts: nenhum hex redigitado.
//  Cada peça traz a própria caixa medidora (`pf-caixa`), então funciona em
//  qualquer tela sem pedir nada a quem usa. O `<style href precedence>` do React 19 põe a folha uma vez só no <head>,
//  por mais faixas que a tela tenha.
// ============================================================================

import type { ReactNode } from 'react'
import { cor, raio } from '@/lib/ui/painel'

/* O AZUL DA FAIXA (30/09/2026). Nasceu no marinho `tinta` da Mesa da
   Subscrição, e ele achou escuro demais: "use um tom mais próximo ao padrão da
   FAM (azul)", mostrando o azul do cabeçalho do CRM. É o `tinta2`, o meio
   daquele cabeçalho, chapado: o cabeçalho é degradê, e degradê aqui é proibido.
   A linha que separa as partes e a borda do botão são o texto claro a 35%, que
   aparece sobre o azul sem virar outra cor. */
const LINHA = `color-mix(in srgb, ${cor.textoSobreEscuro} 35%, transparent)`

const FOLHA = `
.pf-caixa { container-type: inline-size; }
.pf-faixa { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(0,1fr) auto; gap: 20px; align-items: center;
  background: ${cor.tinta2}; color: ${cor.branco}; border-radius: ${raio.janela}px; border-bottom: 3px solid ${cor.ouro};
  padding: 16px 20px; margin-bottom: 14px; }
.pf-faixa.sem-meio { grid-template-columns: minmax(0,1fr) auto; }
.pf-faixa .pf-r { font-size: 11.5px; color: ${cor.textoSobreEscuro}; }
.pf-faixa .pf-big { font-size: 21px; font-weight: 800; line-height: 1.15; margin: 3px 0 8px; color: ${cor.branco}; }
.pf-faixa .pf-big i { font-style: normal; color: ${cor.areaOperacao}; }
.pf-faixa .pf-big i.at { color: ${cor.ouro}; }
.pf-faixa .pf-big i.al { color: ${cor.alertaBorda}; }
.pf-faixa ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.pf-faixa li { font-size: 12.5px; color: ${cor.textoClaroSobreEscuro}; display: flex; gap: 8px; align-items: baseline; line-height: 1.45; }
.pf-faixa li::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: ${cor.ouro}; flex-shrink: 0; transform: translateY(-1px); }
.pf-faixa .pf-meio { border-left: 1px solid ${LINHA}; padding-left: 20px; min-width: 0; }
.pf-faixa .pf-meio b { display: block; font-size: 16px; font-weight: 800; color: ${cor.branco}; margin: 2px 0; overflow-wrap: anywhere; }
.pf-faixa .pf-meio span { font-size: 12px; color: ${cor.textoClaroSobreEscuro}; }
.pf-faixa .pf-acoes { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }

/* O botão da faixa: vazado claro, e o principal em dourado cheio (o da Mesa). */
.pf-bt { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 14px; border-radius: ${raio.controle}px;
  border: 1px solid ${LINHA}; background: transparent; color: ${cor.textoClaroSobreEscuro}; cursor: pointer;
  white-space: nowrap; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
.pf-bt:hover:not(:disabled) { border-color: ${cor.textoSobreEscuro}; color: ${cor.branco}; }
.pf-bt:disabled { opacity: .5; cursor: default; }
.pf-bt.ouro { background: ${cor.ouro}; border-color: ${cor.ouro}; color: ${cor.tinta}; font-weight: 700; }
.pf-bt.ouro:hover:not(:disabled) { color: ${cor.tinta}; border-color: ${cor.branco}; }

.pf-inst { display: grid; grid-template-columns: repeat(var(--pf-n, 4), minmax(0,1fr)); gap: 12px; margin-bottom: 14px; }
/* O TAMANHO (30/09/2026). O número era 21 px e, no notebook dele, "8,67" e o
   nome do grupo em duas linhas dominavam a tela: "tem que usar o tamanho de
   fonte padrão da FAM". Ficou 18 px, e o número que é TEXTO (nome de grupo,
   de empresa) desce para 14,5 px e para em duas linhas: nome não é número. */
.pf-ins { background: ${cor.papel}; border: 1px solid ${cor.borda}; border-radius: ${raio.cartao}px; padding: 11px 13px 9px;
  display: flex; flex-direction: column; min-width: 0; }
.pf-ins h5 { margin: 0; font-size: 12px; font-weight: 700; color: ${cor.tinta}; display: flex; justify-content: space-between; gap: 8px; }
.pf-ins h5 small { font-size: 11px; font-weight: 600; color: ${cor.textoFraco}; white-space: nowrap; }
.pf-ins .pf-num { font-size: 18px; font-weight: 800; color: ${cor.tinta}; line-height: 1.2; margin-top: 6px; overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums; }
.pf-ins .pf-num.txt { font-size: 14.5px; font-weight: 700; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pf-ins .pf-num.ok { color: ${cor.areaOperacao}; }
.pf-ins .pf-num.at { color: ${cor.ouroTexto}; }
.pf-ins .pf-num.al { color: ${cor.alerta}; }
.pf-ins .pf-ap { font-size: 12px; color: ${cor.textoSub}; line-height: 1.45; margin-top: 3px; }
.pf-ins .pf-orig { margin-top: auto; padding-top: 10px; font-size: 10.5px; color: ${cor.textoFraco}; }
.pf-ins .pf-orig::before { content: ""; display: block; border-top: 1px dashed ${cor.bordaSuave}; margin-bottom: 6px; }

@container (max-width: 820px) {
  .pf-faixa, .pf-faixa.sem-meio { grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
  .pf-faixa.sem-meio > :first-child { grid-column: 1 / -1; }
  .pf-faixa .pf-acoes { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; }
  .pf-inst { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@container (max-width: 560px) {
  .pf-faixa, .pf-faixa.sem-meio { grid-template-columns: minmax(0,1fr); }
  .pf-faixa .pf-meio { border-left: none; padding-left: 0; border-top: 1px solid ${LINHA}; padding-top: 12px; }
  /* No celular os cartões ficam dois a dois: um por linha eram quatro telas de
     rolagem para quatro números. O número encolhe para caber. */
  .pf-inst { gap: 8px; }
  .pf-ins { padding: 10px 11px 8px; }
  .pf-ins .pf-num { font-size: 16px; }
  .pf-ins .pf-num.txt { font-size: 13.5px; }
}
@container (max-width: 340px) {
  .pf-inst { grid-template-columns: minmax(0,1fr); }
}
@media (pointer: coarse) { .pf-bt { min-height: 40px; } }
`

function Folha() {
  return <style href="painel-faixa" precedence="default">{FOLHA}</style>
}

export function FaixaDaArea({ rotulo, veredito, pontos, meio, acoes }: {
  /** A linha pequena de cima: área, data, de onde veio. */
  rotulo: string
  /** A conclusão em letra grande. Um `<i>` dentro dela sai colorido
   *  (verde; `className="at"` dourado; `className="al"` alerta). */
  veredito: ReactNode
  /** O que falta ou o que pesa, uma linha cada. Quatro no máximo: mais que
   *  isso a faixa vira lista, e lista mora embaixo. */
  pontos?: string[]
  meio?: { rotulo: string; titulo: string; sub?: string }
  /** Botões `pf-bt`; o principal leva `pf-bt ouro`. */
  acoes?: ReactNode
}) {
  const lista = pontos ?? []
  const visiveis = lista.length > 4 ? [...lista.slice(0, 3), `e mais ${lista.length - 3} logo abaixo`] : lista
  // A caixa de fora é quem MEDE a largura: um container não consulta a si mesmo.
  return (
    <div className="pf-caixa">
    <Folha />
    <div className={`pf-faixa${meio ? '' : ' sem-meio'}`}>
      <div style={{ minWidth: 0 }}>
        <div className="pf-r">{rotulo}</div>
        <div className="pf-big">{veredito}</div>
        {visiveis.length > 0 && <ul>{visiveis.map((p, i) => <li key={i + p}>{p}</li>)}</ul>}
      </div>
      {meio && (
        <div className="pf-meio">
          <div className="pf-r">{meio.rotulo}</div>
          <b>{meio.titulo}</b>
          {meio.sub && <span>{meio.sub}</span>}
        </div>
      )}
      {acoes && <div className="pf-acoes">{acoes}</div>}
    </div>
    </div>
  )
}

export function Instrumentos({ children, colunas = 4 }: { children: ReactNode; colunas?: number }) {
  return (
    <div className="pf-caixa">
      <Folha />
      <div className="pf-inst" style={{ '--pf-n': colunas } as React.CSSProperties}>{children}</div>
    </div>
  )
}

/** Um cartão da fileira. `numero` já vem formatado: quem sabe a unidade é quem
 *  chama. `tom` só quando o número pede leitura diferente, e vermelho só onde
 *  há decisão a tomar (regra 3). */
export function Instrumento({ titulo, marca, numero, tom, apoio, origem }: {
  titulo: string
  /** A etiqueta pequena à direita do título ("robô", "matriz"). */
  marca?: string
  numero: ReactNode
  tom?: 'ok' | 'at' | 'al' | ''
  apoio?: ReactNode
  /** De onde o número veio. Regra 4: número sem origem ninguém confere. */
  origem: string
}) {
  // Texto comprido no lugar do número (nome de grupo) sai menor: ver a folha.
  const ehTexto = typeof numero === 'string' && numero.length > 14
  return (
    <div className="pf-ins">
      <h5>{titulo}{marca && <small>{marca}</small>}</h5>
      <div className={`pf-num${tom ? ' ' + tom : ''}${ehTexto ? ' txt' : ''}`} title={ehTexto ? numero : undefined}>{numero}</div>
      {apoio && <div className="pf-ap">{apoio}</div>}
      <div className="pf-orig">{origem}</div>
    </div>
  )
}

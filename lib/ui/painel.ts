// ============================================================================
//  O DESIGN DO PAINEL  ·  os tokens, num lugar só
//
//  Ordem dele em 09/09/2026, depois do painel da IA Gestor ficar pronto:
//  "esse design que você usou foi fantástico. Mantenha isso dentro das
//  informações do sistema, porque as telas que eu vou refazer devem usar esse
//  design: Comercial, Funil, Análise e Tomadores, assim como todas as telas
//  dentro dessas telas."
//
//  Então isto não é um documento sobre o design: é o design. Tela que quiser
//  esta cara IMPORTA daqui e não redigita hex nenhum. O motivo é velho e já
//  aconteceu neste CRM: token copiado à mão vira token divergente no primeiro
//  ajuste, e aí "o mesmo design" passa a ser cinco designs parecidos.
//
//  A REGRA DE OURO, e ela é dele: o CRM não pode ter cara de IA. Na prática,
//  o que está PROIBIDO aqui dentro:
//    · caixa alta espaçada (`textTransform: uppercase` + `letterSpacing`)
//    · gradiente de fundo
//    · brilho, glow, sombra colorida
//    · roxo, ciano elétrico, neon
//  O que vale: azul-marinho, dourado, o verde do CRM, branco, e densidade de
//  sistema de trabalho. Uma ferramenta não precisa se anunciar como robô a
//  cada pixel.
//
//  A explicação em prosa, com o porquê de cada escolha, está em
//  docs/DESIGN-PAINEL.md. Se um dia os dois discordarem, ESTE arquivo é quem
//  manda: ele é o que a tela executa.
// ============================================================================

/* ══════════════════════════════════════════════════════════════════════════
   COR

   Os mesmos valores das variáveis de app/globals.css, repetidos aqui em TS
   porque estilo inline não enxerga `var(--x)` em toda situação (o Recharts,
   por exemplo, precisa do hex cru para pintar uma barra). Quando os dois
   existirem para a mesma coisa, prefira a variável CSS no `style` e este
   objeto onde só cabe hex.
   ══════════════════════════════════════════════════════════════════════════ */
export const cor = {
  /** O azul-marinho do CRM. Cabeçalho, número grande, texto forte. */
  tinta: '#0a1628',
  tinta2: '#1a3560',
  /** O azul de ação: botão cheio, borda de item selecionado. */
  acao: '#1e4080',
  acaoClara: '#3070c8',
  /** O azul da área de Tomadores e de tudo que é cadastro. */
  areaTomador: '#2255a4',
  /** O verde da área de Operações, subscrição e do que deu certo. */
  areaOperacao: '#27a96c',
  /** O dourado. É filete, marcador, borda e ponto: NUNCA fundo de bloco
   *  grande, e NUNCA texto. */
  ouro: '#e8b84b',
  /** O dourado quando precisa ser LIDO (rótulo de atenção, chip "aguardando").
   *  O `ouro` sobre branco dá ~1,9:1 de contraste, que é ilegível; este dá
   *  ~5,7:1. Quem apontou foi a sessão que repaginou a Análise em 09/09/2026,
   *  e ela estava certa: o token faltava. */
  ouroTexto: '#8a6410',
  /** Vermelho de alerta. Só onde existe decisão a tomar. */
  alerta: '#c0392b',
  alertaFundo: '#fbe9e9',
  alertaBorda: '#e8b4b4',

  /** As superfícies. `fundo` é a área; `papel` é o cartão em cima dela. */
  fundo: '#f4f7fb',
  papel: '#ffffff',
  papelZebra: '#f7fafd',
  destaque: '#e8f0fa',

  borda: '#c5d5e8',
  bordaAtiva: '#3070c8',
  bordaSuave: '#eef3f9',

  /** Os textos, do mais forte ao mais fraco. */
  texto: '#26374a',
  textoSub: '#5a7290',
  textoFraco: '#6080a0',
  textoSobreEscuro: '#8fa3b8',
} as const

/** A paleta de série, para gráfico e para qualquer coisa que precise de N
 *  cores distinguíveis. É a do CRM, e não a padrão do Recharts: é a diferença
 *  entre "um gráfico" e "um gráfico deste sistema". */
export const SERIE = [
  '#1e4080', '#e8b84b', '#27a96c', '#3070c8',
  '#d64545', '#6080a0', '#0f766e', '#c76f3a',
] as const

/* O sétimo tom já foi '#9878d0', um roxo, e isso contradizia a regra de ouro
   escrita seis linhas acima. Ficou assim porque a paleta veio de um arquivo
   antigo e ninguém releu os oito valores contra a própria regra. Virou teal em
   09/09/2026, no mesmo dia em que a regra foi escrita, depois que outra sessão
   apontou. Fica como lembrete: regra em comentário não vale nada se o valor
   logo abaixo dela desobedece. */

/** Azuis e verdes em rampa, do escuro ao claro. Use quando a ordem da cor
 *  significa a ordem do valor (barra ordenada, mapa de calor). Regra que veio
 *  do Dashboard em 09/09/2026: o MAIOR valor fica em cima e leva o tom mais
 *  escuro; a rampa nunca pode dar a volta e repetir escuro embaixo. */
export const AZUIS = [
  '#1e4080', '#2255a4', '#3070c8', '#4a90d8',
  '#6ab0e8', '#8acaf8', '#aadaff', '#c0e8ff',
] as const
export const VERDES = [
  '#065f46', '#166534', '#047857', '#15803d', '#16a34a',
  '#22c55e', '#4ade80', '#6ee7b7', '#86efac', '#bbf7d0',
] as const

/* ══════════════════════════════════════════════════════════════════════════
   FORMA

   Raio, sombra e espaço. Três degraus e só: mais que isso vira decisão a cada
   componente, e decisão a cada componente é como um sistema perde a unidade.
   ══════════════════════════════════════════════════════════════════════════ */
export const raio = {
  /** Janela e painel inteiro. */
  janela: 14,
  /** Cartão, bloco, moldura de tabela e de gráfico. */
  cartao: 10,
  /** Botão, campo, item de lista. */
  controle: 8,
} as const

export const sombra = {
  /** A janela flutuante. Sombra funda, cinza-azulada, nunca colorida. */
  janela: '0 24px 60px -22px rgba(10,22,40,.55), 0 2px 10px -4px rgba(10,22,40,.25)',
  /** Cartão aberto ou em foco. Discreta: marca o item, não o ilumina. */
  cartao: '0 4px 14px -8px rgba(10,22,40,.4)',
  /** Botão flutuante sobre a tela. */
  botao: '0 8px 24px -8px rgba(10,22,40,.55)',
} as const

/* ══════════════════════════════════════════════════════════════════════════
   TIPOGRAFIA

   Denso. Este é um sistema de trabalho, não uma landing page: o rótulo é
   pequeno, o número é grande, e o que sobra é 11,5 px. A hierarquia se faz
   pelo PESO e pela COR, quase nunca pelo tamanho.
   ══════════════════════════════════════════════════════════════════════════ */
export const texto = {
  /** O número que a pessoa veio ver. É o único item grande da tela. */
  numero: { fontSize: 21, fontWeight: 800, lineHeight: 1.1, color: cor.tinta },
  /** O rótulo acima do número. Pequeno, fraco, e em caixa normal. */
  rotulo: { fontSize: 11.5, color: cor.textoFraco },
  /** A frase que dá contexto ao número. */
  apoio: { fontSize: 11.5, color: cor.textoSub, lineHeight: 1.45 },
  /** Título de bloco, de cartão e de seção. */
  titulo: { fontSize: 13, fontWeight: 700, color: cor.tinta },
  /** Texto corrido, item de lista, célula de tabela. */
  corpo: { fontSize: 12.5, color: cor.texto, lineHeight: 1.55 },
  /** Rodapé, origem do dado, aviso de governança. */
  nota: { fontSize: 10.5, color: cor.textoFraco, lineHeight: 1.5 },
} as const

/* ══════════════════════════════════════════════════════════════════════════
   PEÇAS PRONTAS

   Objetos de estilo para o que se repete. Componente React que usa estas
   peças está em components/painel/Painel.tsx.
   ══════════════════════════════════════════════════════════════════════════ */

/** A superfície branca sobre o fundo da área. */
export const papel: React.CSSProperties = {
  background: cor.papel,
  border: `1px solid ${cor.borda}`,
  borderRadius: raio.cartao,
}

/** O cabeçalho azul-marinho, com o filete dourado embaixo. O filete é a
 *  assinatura da FAM na peça, e é a única aparição do dourado como faixa. */
export const cabecalhoEscuro: React.CSSProperties = {
  background: cor.tinta,
  color: '#fff',
  borderBottom: `2px solid ${cor.ouro}`,
}

/** Botão cheio, de ação principal. */
export const botaoCheio: React.CSSProperties = {
  background: cor.acao, color: '#fff', border: 'none',
  borderRadius: raio.controle, padding: '8px 13px',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}

/** Botão vazado, de ação secundária. */
export const botaoVazado: React.CSSProperties = {
  background: cor.papel, color: cor.texto,
  border: `1px solid ${cor.borda}`,
  borderRadius: raio.controle, padding: '8px 13px',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}

/** O ponto colorido que abre uma seção. Some da tela e ainda assim é ele que
 *  diz de que área aquele bloco é. */
export const ponto = (c: string): React.CSSProperties => ({
  width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0,
})

/** A cor da área, a partir do nome dela. Serve para o ponto da seção, para a
 *  barra do gráfico e para a borda do cartão daquela área. */
export function corDaArea(area: 'tomadores' | 'operacoes' | 'comercial' | 'analise' | 'juridico'): string {
  if (area === 'operacoes') return cor.areaOperacao
  if (area === 'comercial') return cor.ouro
  if (area === 'analise') return cor.acaoClara
  if (area === 'juridico') return cor.alerta
  return cor.areaTomador
}

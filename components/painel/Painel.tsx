'use client'

// ============================================================================
//  AS PEÇAS DO PAINEL  ·  o design de 09/09/2026, em componente
//
//  Ordem dele: as telas Comercial, Funil, Análise e Tomadores (e todas as
//  telas dentro delas) vão ser refeitas com o design do painel da IA Gestor.
//  Para isso valer alguma coisa, o design tem que ser IMPORTÁVEL, e não uma
//  descrição que cada tela reinterpreta do seu jeito.
//
//  O primeiro consumidor destas peças é o próprio painel da IA
//  (components/ia/GestorGlobal.tsx). Isso é de propósito: peça de design que
//  nasce sem usuário nasce errada, e peça que o autor não usa vira peça que
//  ninguém usa. Se mudar aqui, muda lá na hora, e é assim que os dois nunca
//  divergem.
//
//  Os tokens estão em lib/ui/painel.ts. O porquê de cada escolha está em
//  docs/DESIGN-PAINEL.md.
// ============================================================================

import { cor, raio, sombra, texto, ponto } from '@/lib/ui/painel'

/* ══════════════════════════════════════════════════════════════════════════
   SEÇÃO

   O cabeçalho que separa um assunto do outro: um ponto da cor da área e o
   nome, em caixa NORMAL. A caixa alta espaçada foi proibida por ele: é o
   sotaque visual que faz o sistema parecer feito por IA.
   ══════════════════════════════════════════════════════════════════════════ */
export function SecaoPainel({ nome, cor: c, acao, children }: {
  nome: string
  /** A cor da área. Use `corDaArea()` de lib/ui/painel. */
  cor: string
  /** Um botão ou filtro, encostado à direita do título. */
  acao?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11.5, fontWeight: 700, color: c, marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={ponto(c)} />
        <span style={{ flex: 1 }}>{nome}</span>
        {acao}
      </div>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   CARTÃO DE NÚMERO

   A peça central do design. Um rótulo pequeno, UM número grande, e uma frase
   de contexto. O detalhe fica escondido até alguém pedir: doze tabelas
   abertas de uma vez é uma parede, e parede ninguém lê.

   `alerta` pinta o número de vermelho, e existe uma regra para ele: só onde
   há decisão a tomar, nunca onde o número é só grande. Alarme que toca todo
   dia vira paisagem, e aí o vermelho não quer dizer mais nada.
   ══════════════════════════════════════════════════════════════════════════ */
export function CartaoNumero({
  rotulo, numero, sub, alerta, aberto, aoAlternar, children, rodape,
}: {
  rotulo: string
  /** Já formatado. O cartão não formata nada: quem sabe a unidade é quem chama. */
  numero: string
  sub?: string
  alerta?: boolean
  /** Sem estes dois, o cartão é só leitura e não abre. */
  aberto?: boolean
  aoAlternar?: () => void
  /** O detalhe, que só desenha com o cartão aberto. */
  children?: React.ReactNode
  /** Uma ação no pé do cartão aberto (um "aprofundar", um "ver na tela"). */
  rodape?: React.ReactNode
}) {
  const abrivel = !!aoAlternar
  const miolo = (
    <>
      <div style={{
        ...texto.rotulo, marginBottom: 3,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ flex: 1 }}>{rotulo}</span>
        {abrivel && (
          <span style={{ fontSize: 11, color: cor.textoSobreEscuro }}>{aberto ? '−' : '+'}</span>
        )}
      </div>
      <div style={{ ...texto.numero, color: alerta ? cor.alerta : cor.tinta }}>{numero}</div>
      {sub && <div style={{ ...texto.apoio, marginTop: 3 }}>{sub}</div>}
    </>
  )

  return (
    <div style={{
      background: cor.papel, borderRadius: raio.cartao, marginBottom: 7,
      border: `1px solid ${aberto ? cor.bordaAtiva : cor.borda}`,
      boxShadow: aberto ? sombra.cartao : undefined,
    }}>
      {abrivel ? (
        <button
          onClick={aoAlternar}
          style={{
            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
            background: 'none', border: 'none', padding: '10px 12px',
          }}
        >
          {miolo}
        </button>
      ) : (
        <div style={{ padding: '10px 12px' }}>{miolo}</div>
      )}

      {aberto && (children || rodape) && (
        <div style={{ padding: '0 12px 12px' }}>
          {children}
          {rodape && <div style={{ marginTop: 10 }}>{rodape}</div>}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MOLDURA

   A caixa branca com filete dourado no título, em volta de uma tabela, de um
   gráfico ou de qualquer coisa que precise dizer DE ONDE veio.

   `origem` não é enfeite e não é opcional por acaso: número sem origem é
   número que ninguém pode conferir, e este CRM já teve número assim.
   ══════════════════════════════════════════════════════════════════════════ */
export function Moldura({ titulo, origem, children }: {
  titulo: string
  origem?: string | null
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: cor.papel, border: `1px solid ${cor.borda}`,
      borderRadius: raio.cartao, padding: '11px 12px 12px', marginTop: 10,
    }}>
      <div style={{
        ...texto.titulo, fontSize: 12.5, marginBottom: 9,
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{
          width: 3, height: 13, borderRadius: 2,
          background: cor.ouro, flexShrink: 0,
        }} />
        {titulo}
      </div>
      {children}
      {origem && (
        <div style={{ ...texto.nota, marginTop: 8 }}>origem: {origem}</div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   ABAS

   Abas coladas no cabeçalho escuro: a ativa é a que tem o fundo da área, como
   uma pasta puxada para frente. Nada de sublinhado colorido nem de pílula.
   ══════════════════════════════════════════════════════════════════════════ */
export function AbasPainel<T extends string>({ abas, atual, aoTrocar }: {
  abas: { id: T; nome: string; dica?: string }[]
  atual: T
  aoTrocar: (id: T) => void
}) {
  return (
    <div style={{
      display: 'flex', gap: 2, padding: '7px 10px 0',
      background: cor.tinta, flexShrink: 0,
    }}>
      {abas.map((a) => (
        <button
          key={a.id}
          onClick={() => aoTrocar(a.id)}
          title={a.dica}
          style={{
            border: 'none', cursor: 'pointer', padding: '7px 13px 8px',
            borderRadius: `${raio.controle}px ${raio.controle}px 0 0`,
            fontSize: 12.5, fontWeight: 600,
            background: atual === a.id ? cor.fundo : 'transparent',
            color: atual === a.id ? cor.tinta : cor.textoSobreEscuro,
          }}
        >
          {a.nome}
        </button>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   AVISO

   Erro, alerta e recado, com a mesma forma. Vermelho é falha de verdade;
   `tom="calmo"` é para o que só precisa ser lido, e é o que substituiu a
   caixa vermelha que aparecia quando a IA estava desligada: desligada por
   escolha não é erro, e pintar de vermelho o que a pessoa escolheu é mentir
   para ela.
   ══════════════════════════════════════════════════════════════════════════ */
export function Aviso({ tom = 'calmo', children }: {
  tom?: 'calmo' | 'erro'
  children: React.ReactNode
}) {
  const erro = tom === 'erro'
  return (
    <div style={{
      background: erro ? cor.alertaFundo : cor.papel,
      border: `1px solid ${erro ? cor.alertaBorda : cor.borda}`,
      borderRadius: raio.cartao, padding: '11px 13px',
      fontSize: 12.5, lineHeight: 1.6,
      color: erro ? '#a02020' : cor.textoSub,
    }}>
      {children}
    </div>
  )
}

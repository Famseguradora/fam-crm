# O design do CRM FAM

> Ordem do Marco, 09/09/2026, depois do painel da IA Gestor ficar pronto:
> *"Esse design que você usou foi fantástico. Mantenha isso dentro das
> informações do sistema, porque as telas que eu vou refazer devem usar esse
> design: Comercial, Funil, Análise e Tomadores, assim como todas as telas
> dentro dessas telas."*

Este é o padrão visual do CRM daqui para a frente. Ele nasceu do painel da IA
Gestor, e a referência viva dele é essa tela: se a dúvida não estiver respondida
aqui, abra o painel (Ctrl+I) e copie o que ele faz.

## Onde o design mora

| O quê | Onde | Para quê |
|---|---|---|
| Os tokens | `lib/ui/painel.ts` | cor, raio, sombra, tipografia. **Importe daqui, não redigite hex.** |
| As peças | `components/painel/Painel.tsx` | `SecaoPainel`, `CartaoNumero`, `Moldura`, `AbasPainel`, `Aviso` |
| As variáveis CSS | `app/globals.css` | os mesmos valores, para quem usa `var(--x)` |
| A referência viva | `components/ia/GestorGlobal.tsx` | a tela que consome tudo isso |

`lib/ui/painel.ts` é a fonte da verdade. Se este documento e aquele arquivo
discordarem, o arquivo ganha: ele é o que a tela executa.

## A regra de ouro: o CRM não pode ter cara de IA

Queixa dele, e ela é específica. **Proibido:**

- caixa alta espaçada (`textTransform: uppercase` junto com `letterSpacing`)
- gradiente de fundo
- brilho, glow, sombra colorida
- roxo, ciano elétrico, neon

**O que vale:** azul-marinho, dourado, o verde do CRM, branco, e densidade de
sistema de trabalho. Uma ferramenta não precisa se anunciar como robô a cada
pixel.

## As cores

| Papel | Valor | Onde |
|---|---|---|
| Tinta | `#0a1628` | cabeçalho escuro, número grande, texto forte |
| Ação | `#1e4080` | botão cheio, balão da pessoa |
| Área Tomadores | `#2255a4` | ponto da seção, barra do gráfico |
| Área Operações | `#27a96c` | idem, e tudo que deu certo |
| Ouro | `#e8b84b` | **filete, marcador, borda e ponto. Nunca fundo de bloco, nunca texto** |
| Ouro como texto | `#8a6410` | `cor.ouroTexto`, para rótulo de atenção e chip |
| Alerta | `#c0392b` | número que exige decisão |
| Fundo | `#f4f7fb` | a área |
| Papel | `#ffffff` | o cartão em cima da área |
| Borda | `#c5d5e8` | e `#3070c8` quando ativo |

Gráfico usa `SERIE` (8 cores do CRM), nunca a paleta padrão do Recharts. Quando
a cor significa ordem de grandeza, use `AZUIS` / `VERDES`: **maior valor em cima,
com o tom mais escuro**, e a rampa não dá a volta repetindo escuro embaixo (esse
bug existiu no Dashboard e foi corrigido em 09/09/2026).

## A forma

Três degraus de raio e só: `janela: 14`, `cartao: 10`, `controle: 8`. Sombra é
sempre cinza-azulada, nunca colorida.

## A tipografia

Denso. O rótulo é pequeno (11,5), o número é grande (21, peso 800), e o resto é
12,5. **A hierarquia se faz pelo peso e pela cor, quase nunca pelo tamanho.**

## As cinco decisões que fazem esse design funcionar

1. **Um número grande por cartão.** Rótulo pequeno em cima, número, e uma frase
   de contexto embaixo. Se o cartão tem dois números grandes, ele é dois cartões.

2. **O detalhe fica escondido até alguém pedir.** Tabela e gráfico só desenham
   com o cartão aberto. Treze tabelas abertas de uma vez é uma parede, e parede
   ninguém lê.

3. **Vermelho só onde há decisão a tomar**, nunca onde o número é apenas grande.
   Alarme que toca todo dia vira paisagem, e aí o vermelho não quer dizer mais
   nada. Um cartão que sempre mostraria zero não ganha alerta.

4. **Todo número diz de onde veio.** Tabela e gráfico carregam `origem`. Número
   sem origem é número que ninguém pode conferir, e este CRM já teve número
   assim.

5. **Cartão sem dado não some: ele aparece dizendo que não tem dado.** Sumir com
   o cartão faz a pessoa achar que a pergunta não existe, quando a verdade é que
   o campo está vazio no banco. Isso é informação.

## Como usar numa tela nova

```tsx
import { SecaoPainel, CartaoNumero, Moldura } from '@/components/painel/Painel'
import { corDaArea, botaoCheio, texto } from '@/lib/ui/painel'

<SecaoPainel nome="Operações e subscrição" cor={corDaArea('operacoes')}>
  <CartaoNumero
    rotulo="Prêmio emitido"
    numero="R$ 8,4 mi"
    sub="realizado em 27 operações emitidas"
    aberto={aberto === 'premio'}
    aoAlternar={() => setAberto(aberto === 'premio' ? null : 'premio')}
  >
    <Moldura titulo="Por corretora" origem="operacoes.premio_previsto em status Emitido">
      {/* a tabela ou o gráfico */}
    </Moldura>
  </CartaoNumero>
</SecaoPainel>
```

## As exceções, e por que elas são nomeadas

Uma exceção escrita é uma decisão; uma exceção não escrita é só divergência.
Estas duas nasceram em 09/09/2026, quando a Análise foi repaginada em paralelo:

1. **`components/analise/Estilo.tsx` mantém hex escrito**, sem importar
   `painel.ts`. Não é teimosia: aquilo é uma folha CSS de ~560 linhas dentro de
   um `<style>` com prefixo `an-`, e não estilo inline. Interpolar
   `${cor.borda}` em cada linha do template literal deixaria a folha ilegível e
   quebraria o realce de sintaxe. A regra que vale lá é a que está no cabeçalho
   do próprio arquivo: **se um valor dali divergir de `painel.ts`, quem manda é
   `painel.ts`.**

2. **O ouro não pode ser texto.** `#e8b84b` sobre branco dá ~1,9:1 de contraste,
   que é ilegível. Onde o ouro precisa ser lido, use `cor.ouroTexto` (`#8a6410`,
   ~5,7:1). O `#e8b84b` fica onde ele funciona: filete, marcador, borda, ponto.

Há também um roxo pré-existente que sobreviveu à faxina: `--purple: #9878d0` em
`app/globals.css`, dentro do bloco do cockpit escuro. Ele não vem de `painel.ts`
e ainda não foi decidido. Se aparecer numa tela nova, é bug.

## O que ainda não está extraído

A janela flutuante (arrastar pelo cabeçalho, esticar pelas oito bordas, tamanho
guardado no `localStorage`) ainda mora dentro de `GestorGlobal.tsx`. Quando a
segunda tela precisar de janela, ela vira peça em `components/painel/` — antes
disso seria abstração sem segundo caso.

## Um aviso sobre os números, não sobre a cor

O design não salva número errado. Antes de somar operação em qualquer tela nova,
leia `docs/` e o cabeçalho de `lib/ia/robo.ts`: o LMG é capado em 80 milhões, as
operações vivem em três mundos que **não se somam** (emitida, funil, encerrada),
e a taxa ponderada não é prêmio dividido por LMG.

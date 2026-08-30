# FAM Financeiro · projeto

Sistema de caixa e auditoria para o CEO da FAM. Substitui a planilha
`2026.07 - Santander - Recebimentos e Pagamentos New`, mantida pelo Aldeir.

**O sistema:** [`fam-financeiro/dashboard.html`](../fam-financeiro/dashboard.html) · arquivo
único, montado por `build-dashboard.cjs`. Abre por duplo clique no Edge, ou pelo atalho que o
[instalador](../fam-financeiro/Instalar%20FAM%20Financeiro.cmd) cria.

*(`fam-financeiro.html` e `artifact.html` são os protótipos antigos, guardados só como registro.)*

---

## 1. Por que trocar a planilha

O fluxo de caixa da FAM é o extrato do Santander. Hoje o Aldeir lê o extrato e redigita cada
movimento na planilha, classificando na "natureza" certa e conferindo o saldo no fim do mês.
A planilha tem 3 abas: `Dashboard` (só fórmula), `Detalhado 2` (a digitação, 93 lançamentos em
julho/2026 e 14 naturezas) e `Instruções` (o manual que o próprio Aldeir escreveu).

Seis coisas quebram nela:

**1. Todo card do Dashboard aponta para linha fixa.** `B19 = 'Detalhado 2'!B14`,
`J19 = 'Detalhado 2'!B21`, `F31 = 'Detalhado 2'!B117`. Inserir uma natureza desloca as linhas e
o Dashboard passa a mostrar a natureza errada **sem dar erro visível**. É por isso que as
Instruções gastam duas seções ensinando onde *não* inserir linha, e mandam "copiar um card
existente e apontar para as novas células". Um painel que exige manutenção de fórmula a cada
categoria nova é o custo central da planilha.

**2. O manual já divergiu.** As Instruções falam numa aba `Resumo` que não existe mais · virou
`Detalhado 2`. Quem seguir o manual ao pé da letra não acha a célula do saldo.

**3. Transferência entre contas próprias entra como receita.** "Transf da LFT para CC" foi
R$ 498.274,29 dos R$ 953.892,67 de entradas de julho · **52% do mês**. Não é receita: é dinheiro
da FAM trocando de bolso. Do outro lado, "Aplicação em Fundo" infla as saídas pelo mesmo motivo.
Enquanto as duas contarem, "Entradas do mês" e "Saídas do mês" não medem nada.

**4. A digitação é frágil por construção.** Metade do manual é sobre como não errar: não digite
"R$", não use ponto de milhar, não comece com apóstrofo, não deixe espaço, não escreva "pendente"
na coluna de valor, cuidado com número que entrou como texto. Todas essas regras existem só
porque a entrada é livre.

**5. A conferência é cega.** O único controle é a "Diferença a conciliar". Se der diferente de
zero, ninguém diz qual lançamento falta.

**6. Faltam contas.** A planilha é só do Santander CC, mas os lançamentos já citam Contamax,
LFT, Banco do Brasil e S3 Caceis.

### O backlog do próprio Aldeir

No rodapé do Dashboard ele deixou cinco pendências. **São a régua de aceitação do sistema:**

| # | Pendência | Onde o sistema resolve |
|---|---|---|
| 1 | Produzir comparação mês a mês | Painel → Comparação mês a mês; Relatórios → DRE lado a lado |
| 2 | Conta S3Caceis · R$ 2.850,00 | Contas bancárias |
| 3 | Conta B. Brasil · R$ 155,00 | Contas bancárias |
| 4 | Automatizar dashboard × detalhado 2 | Painel gerado do plano de contas, sem fórmula por linha |
| 5 | Incluir Investimentos e conta corrente | Contas bancárias + par de transferência interna |

---

## 2. Decisões de arquitetura

| Ponto | Decisão | Por quê |
|---|---|---|
| Forma | HTML único standalone | Quem usa é o Aldeir, não o Marco. Duplo clique no Edge, zero instalação, zero servidor. |
| Banco de dados | Pasta do OneDrive da FAM, via File System Access API | Sem Supabase nesta fase. Backup automático e o Marco enxerga os dados do lado dele. |
| Importação | OFX/OFC agora, PDF depois | OFX traz `FITID` · identificador único por lançamento. É o que torna a importação segura de repetir. |
| Bancos | Por banco e consolidado | Backlog #2, #3 e #5. |
| PLD | Trilha sobre os lançamentos importados | Sinalização para conferência humana, não acusação. |

### A pasta que faz papel de banco

```
FAM-Financeiro/                  (dentro do OneDrive da FAM)
  config.json                    contas bancárias, parâmetros, versão do schema
  plano-de-contas.json           as naturezas e seus atributos
  regras.json                    regras de categorização automática
  lancamentos/2026-07.json       um arquivo por mês
  fechamentos/2026-07.json       mês congelado
  extratos/originais/            .ofx e .pdf originais, para a auditoria voltar na fonte
  auditoria/log.jsonl            append-only: quando, o quê, de → para
  backups/                       snapshot completo, rotação de 30
```

**Um arquivo por mês, não um arquivão.** O OneDrive sincroniza o arquivo inteiro a cada
gravação: escrita pequena significa sync rápido e menos risco de conflito.

**Escrita atômica.** `createWritable()` grava num arquivo temporário e só troca no `close()`
a troca é atômica. Nunca há um JSON pela metade em disco.

**Blindagem contra o OneDrive fora do ar.** Falha já conhecida na FAM: o arquivo existe, mas
está marcado como "só na nuvem", e a leitura estoura `UNKNOWN`. O sistema mantém espelho
completo no navegador. Se a pasta não responder, ele abre em **modo somente leitura** com faixa
vermelha no topo, mostrando o espelho e a data do último sync bom. Ninguém fica sem o cockpit
por causa de sync.

**Duas pessoas ao mesmo tempo.** `owner.json` com heartbeat: a segunda sessão abre em leitura e
avisa quem está com a escrita. *(previsto, ainda não no protótipo)*

---

## 3. Modelo de dados

### Lançamento

```json
{
  "id": "lc-3f", "conta": "sant-cc",
  "data": "2026-07-14", "contraparte": "ITHERA CORRETORA",
  "descritivo": "Comissão - Apol. 26107760000010 a 13 - Par 1/1",
  "valor": -32630.37, "natureza": "Comissão Corretoras",
  "obs": "", "conciliado": true,
  "origem": "ofx", "fitid": "SANT-202607-0042"
}
```

Duas mudanças em relação à planilha:

- **`contraparte` virou campo próprio.** Na planilha a coluna B fazia papel duplo: nome da
  natureza na linha de cabeçalho, fornecedor/pagador nas linhas de item. Isso impedia somar por
  fornecedor.
- **`fitid` é a chave de deduplicação.** O mesmo extrato importado duas vezes não gera lançamento
  duplicado. É o que permite reimportar sem medo.

### Natureza (o "grupo de contas")

```json
{
  "id": "nat-14", "nome": "Aplicação em Fundo",
  "tipo": "saida", "interna": true, "fixa": false,
  "recorrencia": "mensal", "contaContabil": ""
}
```

| Campo | Para que serve |
|---|---|
| `tipo` | entrada ou saída |
| `interna` | **conserta o problema 3.** Transferência entre contas próprias não conta como receita nem como despesa. Nasce marcado em "Transf da LFT para CC" e "Aplicação em Fundo". |
| `fixa` | entra no cálculo de despesa fixa e do fôlego de caixa |
| `recorrencia` | `mensal` · `trimestral` · `eventual`. Alimenta a projeção e o vigia de "recorrente que sumiu". |
| `contaContabil` | **gancho da fase contábil.** Nasce vazio; é o que vai amarrar cada natureza ao plano contábil sem remodelar o que já foi lançado. |

### As 14 naturezas de julho/2026

**Entradas:** Transf da LFT para CC *(interna, eventual)* · Premio recebido *(mensal)* ·
Rendimento líquido Contamax *(mensal)*

**Saídas:** Cartão de Crédito Corporativo *(mensal)* · Taxa fiscalização SUSEP *(fixa,
trimestral)* · Pagto ED Resseguradoras *(eventual)* · Tributos e Taxas *(mensal)* · Tributos e
Taxas - Retenção *(mensal)* · Reembolso de despesas *(mensal)* · Comissão Corretoras *(mensal)* ·
Tarifa bancária *(fixa, mensal)* · Remuneração Time FAM *(fixa, mensal)* · Fornecedores
*(mensal)* · Aplicação em Fundo *(interna, mensal)*

### Regra de categorização

```json
{ "id": "rg-07", "campo": "descritivo", "texto": "Tar PIX",
  "natureza": "Tarifa bancária", "prioridade": 1,
  "acertos": 34, "origem": "de fábrica" }
```

Ordem de classificação na importação:

1. **regra explícita bate** → verde, categorizado
2. **sem regra, mas a contraparte já caiu numa natureza antes** → amarelo, sugestão a confirmar
3. **contraparte nova e nenhuma regra** → vermelho, desconhecido

Toda confirmação no amarelo ou no vermelho **vira regra nova**. O sistema fica mais automático a
cada mês, sem IA: é aprendizado por confirmação explícita. A coluna `acertos` serve para podar
regra com zero acerto há meses é lixo.

---

## 4. Catálogo de indicadores

Nunca há dois caminhos para o mesmo número: tudo passa pela função `apurar(mês)`.

| Indicador | Fórmula |
|---|---|
| Saldo inicial | saldo final do mês anterior. Não é digitado. |
| Entradas do mês | soma dos lançamentos positivos, **menos** as naturezas `interna` |
| Saídas do mês | soma dos lançamentos negativos, **menos** as naturezas `interna` |
| Resultado do mês | entradas + saídas |
| Movimento | soma de **todos** os lançamentos, inclusive `interna` · o dinheiro sai da conta de verdade |
| Saldo apurado | saldo inicial + movimento |
| Diferença a conciliar | saldo apurado − saldo do extrato. **Ideal: zero.** |
| Despesa fixa | soma dos negativos cujas naturezas são `fixa` |
| Saída média | média das saídas dos últimos 3 meses |
| Fôlego de caixa | saldo do extrato ÷ saída média, em meses |
| AV% | valor da natureza ÷ entradas do mês |
| AH% | variação da natureza contra o mês anterior |

**Sobre o fôlego de caixa:** hoje ele só enxerga a conta corrente do Santander. Enquanto o Fundo
LFT não for importado, o número subestima o caixa real · porque o dinheiro aplicado sai da conta
e não reaparece em lugar nenhum. O sistema diz isso na cara do usuário, em vez de mostrar um
número bonito e errado.

---

## 5. Os vigias

Rodam sozinhos a cada abertura e a cada importação.

| Vigia | Critério | Severidade |
|---|---|---|
| Conciliação | diferença ≠ 0 | crítico |
| Lançamento sem natureza | existe lançamento órfão | alerta |
| Recorrente que sumiu | natureza `mensal` presente em ≥ 2 meses anteriores e ausente agora | alerta |
| Gasto acima do padrão | natureza 50% acima da própria média | alerta |
| Possível duplicidade | mesma data + contraparte + valor, **e valor ≥ R$ 500** | alerta |
| PLD · contraparte nova | contraparte inédita movimentando ≥ R$ 20.000 | crítico |
| PLD · fracionamento | ≥ 3 pagamentos à mesma contraparte somando ≥ R$ 10.000, nenhum dominante | alerta |
| Transferência interna | quanto das entradas brutas é dinheiro trocando de conta | info |

O piso de R$ 500 na duplicidade é deliberado: duas tarifas de PIX de R$ 1,90 no mesmo dia são
rotina, não duplicidade. Vigia que grita à toa vira vigia ignorado.

**Achado crítico bloqueia o fechamento do mês.** Um mês que fecha com a conciliação em aberto não
vale nada.

---

## 6. O robô · FIN

Determinístico. **Não é IA.** Lê o estado carregado e responde com a conta à mostra. Mesmo
espírito do painel 🧭 Racional do template de análise de crédito.

### Gramática de intenção

A pergunta é normalizada (minúscula, sem acento) e cruzada com quatro eixos:

- **métrica** · dicionário de sinônimos em PT-BR: `gastei/gasto/despesa/paguei` → saídas;
  `folego/runway/quanto tempo/aguenta` → fôlego; e assim por diante
- **período** · nome do mês, `2026-07`, ou "mês passado". Quando a pergunta cita dois meses
  ("de junho para julho"), **vale o último**
- **natureza** · casamento com os nomes do plano de contas
- **contraparte** · casamento com as contrapartes de **todos** os meses, não só o aberto: quem
  pergunta "quanto paguei pra Veraz" não quer ouvir que o mês corrente não tem Veraz

### O que ele responde

saldo · entradas · saídas · resultado · fôlego de caixa · conciliação · duplicidade · PLD ·
variação mês a mês · maiores contrapartes · despesa fixa · projeção · qualquer natureza do plano
· qualquer contraparte.

### Três regras que ele não quebra

1. **Toda resposta traz a memória de cálculo** · a fórmula, os números que entraram nela, e a
   lista dos lançamentos. Clicável, leva ao razão já filtrado.
2. **Quando não entende, diz que não entendeu** e oferece o que sabe fazer. Nunca chuta número.
3. **Ação só com confirmação.** Criar natureza, criar regra, recategorizar em lote · sempre com
   preview e registro na trilha de auditoria.

---

## 7. O que já funciona

| Módulo | Estado |
|---|---|
| Acompanhamento mensal | **funcionando** · vários meses na tela ao mesmo tempo, drill-down em três níveis, jeito Excel no botão direito e na célula |
| Desfazer | **funcionando** · Ctrl+Z e Ctrl+Y sobre toda mudança de dado, pendurado no `gravar()` |
| Importar extrato | **funcionando** · parser OFX e PDF próprios, dedup por FITID, conferência verde/amarelo/vermelho, confronto de saldo, aprendizado de regra |
| Plano de contas | **funcionando** · criar natureza e a tela se atualiza sozinha |
| Robô Caixa | **funcionando** · chips, pergunta livre, memória de cálculo, vigias |
| Simulação em abas | **funcionando** · cada cenário é uma cópia inteira, a Principal fica intacta |
| HP-12C | **funcionando** · réplica do teclado da máquina, RPN, as cinco financeiras; janela e ícone se arrastam |
| Trilha de auditoria | **funcionando** · append-only, quem/quando/de/para, filtro, CSV, PDF |
| Instalador | **funcionando** · ícone próprio, menu Iniciar, desinstalador, sem pedir administrador |
| Modo revisão (post-its) | **funcionando** · é do protótipo, não vai para o sistema definitivo |

### A carga de fábrica é a planilha Matriz, e só ela

A cópia da planilha que temos é a versão "para Marco", com os valores das linhas mascarados em
1,00. Os totais reais sobreviveram no bloco lateral do Dashboard, e a massa foi reconstruída para
**fechar exatamente contra eles**: entradas R$ 953.892,67 · saídas R$ 914.986,87 · saldo final
R$ 43.685,18 · conciliação zero. A estrutura (natureza, contraparte, data e descritivo dos 93
lançamentos) é a da planilha, linha por linha.

O sistema sobe **só julho/2026**. Nenhum mês derivado nasce junto: mês que não veio do extrato
nem da mão do CFO não é dado, é enfeite, e enfeite em tela de caixa vira número de reunião.

`CARGA` (em `_p3.html`) é o carimbo da carga. Enquanto ele não muda, o que está gravado no
navegador vale. Quando muda, o sistema **descarta o que havia e sobe a Matriz de novo**, avisando
na tela e registrando na trilha de auditoria. É assim que uma carga nova chega a quem já usa o
sistema sem depender de ninguém clicar em nada. O botão "↺ Zerar e voltar à planilha Matriz", no
rodapé, faz a mesma coisa a pedido.

**Pendências do Marco:** a planilha sem máscara (para a carga inicial de verdade) e um OFX do
Santander (para calibrar o parser contra o arquivo real).

---

## 8. Vários meses na tela

A planilha do Aldeir mostrava um mês. A primeira versão da tela mostrava dois. Agora mostra
quantos ele quiser.

- **Colunas:** uma por mês, em ordem de calendário. Nada mais: sem faixa por cima e sem coluna
  extra. A tela é de conferir número, e o resto poluía a leitura antes de servir para alguma coisa.
- **Agrupamento por trimestre:** existe, mas nasce **desligado**, e liga pelo botão direito na
  tela. Ligado, entra uma faixa por cima agrupando os meses de cada trimestre e uma coluna com o
  total dele no fim de cada grupo. O total só se chama "Total T3" quando os **três** meses estão à
  vista; faltando mês, o rótulo é "T3 parcial" · somar dois meses e chamar de trimestre é o tipo
  de número que vai para uma reunião e não volta.
- **Dif. R$ e Var. %:** comparam sempre **dois** meses, por padrão os dois últimos do calendário
  entre os que estão na tela. As colunas desse par ficam marcadas. O par pode ser trocado à mão
  no seletor, e o botão "↺ dois últimos" devolve o automático. Comparar tudo com tudo não é
  comparação.
- **Congelamento:** Dif. R$ e Var. % ficam presas na borda direita, como o "congelar painéis" do
  Excel. Com o ano inteiro na tela a tabela rola de lado, e sem isso as duas colunas que decidem
  seriam as primeiras a sumir.
- **Largura:** uma medida por *papel* de coluna, não por mês. Arrastar a borda de um mês move
  todos, e a alça anda junto com o mouse porque o passo é dividido pelo número de colunas daquele
  tipo que ficam dali para a direita.
- **Recortes:** Tudo · Últimos 3/6/12 · por ano · escolher mês a mês. A escolha fica gravada.
  Mês recém-criado, recém-importado ou recém-simulado entra na tela sozinho: recorte que esconde
  o que a pessoa acabou de fazer parece que engoliu o trabalho.

---

## 9. A HP-12C

O CFO tem uma HP-12C de verdade na mesa. Esta é a mesma máquina, e é a única
calculadora do sistema: a "normal" saiu, porque duas calculadoras numa gaveta só
viravam uma escolha a fazer antes de cada conta.

**Ela é copiada da máquina**, olhando a foto da HP do CFO: corpo preto, placa dourada escovada em
cima com o visor de cristal líquido e o selo `hp 12C`, o teclado num campo preto cercado por um
fio dourado, e `HEWLETT·PACKARD` no pé.

**O teclado é o dela**: quatro fileiras por dez colunas, na mesma ordem. Todas as teclas são
pretas · as duas únicas coloridas são o `f` (laranja) e o `g` (azul). O que muda de cor é a
LEGENDA: **laranja acima da tecla**, impressa no corpo (as funções do f), branca na tecla, azul no
rodapé dela (as do g). Os três arcos laranja da máquina estão lá: `BOND` sobre PRICE e YTM,
`DEPRECIATION` sobre SL, SOYD e DB, `CLEAR` sobre Σ, PRGM, FIN, REG e PREFIX. O `ENTER` ocupa duas
fileiras na sexta coluna, com o nome de pé.

Fora do corpo da máquina, logo abaixo dela, ficam a pilha (Y Z T e LAST x) e os cinco
registradores financeiros. A HP de verdade só mostra um número por vez; conferir sem ver a pilha é
o que faz alguém desconfiar do resultado, e isso não podia virar enfeite desenhado por cima dela.

**É RPN**: primeiro o número, depois a tecla. `3 ENTER 4 +` dá 7. Pilha de quatro
registradores, LAST x, `x≷y`, `R↓`, STO/RCL de 0 a 9.

**As cinco financeiras** seguem a regra do aparelho: digitou um número e apertou a
tecla, ela **guarda**; apertou a tecla **sem digitar**, ela **calcula** a partir
das outras quatro. A equação é uma só, e guardar e calcular leem a mesma:

```
PV + PMT · k · (1 - (1+i)^-n) / i + FV · (1+i)^-n = 0     k = (1+i) no BEGIN, 1 no END
```

`n`, `PV`, `PMT` e `FV` saem por isolamento. `i` não se isola: o sistema varre o
intervalo procurando a troca de sinal e fecha por bisseção. É lento para um
computador e exato para quem vai assinar embaixo do número.

Também funcionam: `yˣ` `1/x` `%` `Δ%` `%T`, e no azul `√x` `eˣ` `LN` `FRAC` `INTG`
`n!` `LSTx` `12×` `12÷` `BEG` `END`; a estatística `Σ+ Σ- x̄ s`; `f CLEAR FIN`,
`f CLEAR REG`, `f PREFIX`, e `f` seguido de um dígito para as casas decimais.
`ON` desliga (fecha a janela), como no aparelho.

**O que ela não faz:** fluxo de caixa (NPV, IRR, CFj, Nj, CF0), datas, amortização,
programação (R/S, SST, BST, GTO) e EEX. Essas teclas estão no teclado porque a
máquina real as tem, e quando apertadas dizem, com todas as letras, que não fazem
nada aqui. Tecla que finge que calculou é pior que tecla que falta.

**A janela se arrasta, e o ícone também.** Os dois moram por cima da tabela, e
parados no canto de baixo é justamente onde ficam as últimas linhas que se está
conferindo. Arrastam pelo mesmo mecanismo (`[data-arrasta]`), cada um lembrando
onde foi largado. Dois detalhes que só aparecem na mão:

- **O ícone é botão e é alça ao mesmo tempo.** A regra é a distância: saiu menos
  de 4px, foi clique; passou disso, foi arrasto, e o clique que o navegador
  dispara em seguida é engolido. Sem isso, mover o ícone abriria a calculadora
  toda vez.
- **Botão dentro da alça não vira arrasto.** A captura de ponteiro leva o clique
  para quem capturou, e por causa disso o `×` de fechar deixava de fechar a
  janela. O `×` está dentro da barra que se arrasta, então a barra ignora o
  pointerdown que nasce num botão que não seja ela mesma.

Conferência que a suíte roda toda vez: R$ 100.000 em 24 meses a 1,5% ao mês dá PMT
de -R$ 4.992,41, e a partir dessa prestação o `i` volta a 1,5% e o `n` volta a 24.

### A barra de comandos, e o que foi para o botão direito

Ela é comando, não é conteúdo. Os botões nasceram no tamanho do resto da tela e comiam a altura
que faz falta para a tabela num notebook. A compactação vale **só dentro da `.filter-row`**
(`.filter-row .btn-secondary`, `.filter-row .fam-input`, ...): os mesmos botões dentro dos modais
continuam do tamanho de sempre.

Depois de ver a tela pronta, o Marco pediu para despoluir mais. **Três coisas saíram da barra e
foram para o botão direito na tela**, sem nada ser desprogramado:

| Saiu da barra | Onde está agora |
|---|---|
| 🗓️ Meses na tela | botão direito · "Escolher os meses da tela" (o seletor de chips continua em cima) |
| 🧾 Trilha de auditoria | botão direito · e o rodapé |
| chip "Total por trimestre" | botão direito · "Ligar o agrupamento por trimestre" |

Ficaram na barra as seis ações do dia a dia: Novo lançamento · Nova natureza · Novo mês ·
Importar extrato · Simulador · PDF. O resto do menu do botão direito é o de sempre.

---

## 9.1. Desfazer, e a célula vazia que se digita

### Ctrl+Z

`gravar()` é o funil por onde passa **toda** mudança de dado: vinte lugares chamam, e nenhum outro
escreve no `localStorage` do razão. O desfazer está pendurado ali, e não em cada função · é o que
faz ele nascer completo e continuar completo: função nova que grave não precisa lembrar de nada, e
nenhuma mudança escapa por esquecimento.

Antes de cada gravação guarda-se uma foto do estado (`JSON.stringify(RAIZ)`), **junto com a aba e o
mês abertos**: sem isso desfazer devolveria os números certos numa tela olhando para outro lugar. O
rótulo do passo vem da ponta da trilha de auditoria, porque em toda mutação o `auditar()` roda
antes do `gravar()`.

- **Ctrl+Z** desfaz, **Ctrl+Y** (ou Ctrl+Shift+Z) refaz. Dentro de um campo de texto o Ctrl+Z
  continua sendo o do navegador: quem está corrigindo uma descrição quer desfazer a **letra**, não
  o lançamento inteiro.
- Os botões **↶ Desfazer** e **↷ Refazer** só aparecem quando há o que desfazer, e o título deles
  diz o quê. Também estão no botão direito da tela.
- Teto de 30 passos, **só nesta sessão**: fechou a página, acabou. Quem guarda o histórico de
  verdade é a trilha de auditoria.
- **Desfazer não apaga nada da trilha.** Ela é append-only: o que foi feito continua registrado, e
  o desfazer entra como mais uma linha depois dele ("Desfez: Lançamento duplicado").

Vale até para o pior caso: zerar o sistema para a Matriz sem querer volta com um Ctrl+Z.

### Digitar na célula vazia

Os lançamentos se repetem quase iguais todo mês. No nível 3, o mês que ainda não teve aquele
lançamento mostra uma travinha, e **dois cliques nela lançam ali**: o valor é o que se digita, e a
natureza, a contraparte, o descritivo e o dia vêm da própria linha, que é o que faz dela uma linha.
O dia é preso ao último dia do mês quando o mês novo é mais curto (dia 31 em mês de 30 nasceria
fora do próprio mês), e **o sinal segue o da linha**: uma saída não vira entrada porque foi lançada
noutro mês. Entra na trilha como "Lançamento digitado na linha" e desfaz com Ctrl+Z.

### O backup não voltava

`baixarBackup()` grava `db: RAIZ` (a Principal e as abas de simulação), e o `escolherBackup()` só
sabia ler o formato antigo, em que o arquivo trazia direto o bloco de meses. Resultado: **o sistema
recusava o próprio backup**, com a mensagem de arquivo inválido. Como o backup em `.json` é o único
caminho para levar dados de uma máquina a outra, isso era o pior defeito do sistema, e era mudo.

Corrigido: a leitura aceita os dois formatos, o antigo virando a aba Principal. A confirmação passou
a dizer quantos meses e quantas simulações vão entrar, e a restauração inteira desfaz com Ctrl+Z.
A suíte agora faz o caminho completo · gera o backup, zera o sistema e restaura o arquivo gerado.

### A tela mais limpa

Também a pedido do Marco, depois de ver a tela pronta:

- os títulos das gavetas ("Dentro de X · por contraparte", "Lançamentos de Y") saíram · repetiam o
  que a linha de cima já diz, e a tabela de dentro tem cabeçalho próprio
- a reta azul que marca o grupo à esquerda foi a 70% de transparência · ela é marca de
  agrupamento, não título, e cheia demais competia com o número

---

## 10. A trilha de auditoria

Responde três perguntas, sempre: **quando, quem, e de que valor para que valor.**

Entram na trilha: inclusão, edição (campo a campo, com o valor de antes), exclusão, correção na
célula, duplicação, conta esvaziada no mês, natureza criada ou excluída, mês criado, extrato
importado, simulação criada/renomeada/excluída/promovida, backup gerado ou restaurado, troca de
quem está usando, e o zerar para a Matriz.

- **Append-only.** Não há botão de apagar registro, nem na tela nem no menu do botão direito.
- **Restaurar backup não substitui a trilha, JUNTA** a do arquivo com a que já está na máquina,
  sem duplicar (a chave é o `id` do registro). Trilha que some ao restaurar backup não é trilha.
- **A trilha vai junto** na cópia de segurança (`baixarBackup`), e sai sozinha em CSV (com BOM,
  abre direto no Excel), em JSON e em PDF.
- **Quem está usando** é um nome configurável por máquina, gravado em cada registro.
- **O teto** é de 8.000 registros neste navegador. A partir de 6.000 o sistema pede para exportar;
  ao encostar no teto ele poda os mais antigos **e grava um registro dizendo quantos podou e de
  que datas**. O buraco fica visível em vez de silencioso.

---

## 11. O instalador

`fam-financeiro/Instalar FAM Financeiro.cmd`, duplo clique. Não pede administrador.

| O que faz | Onde |
|---|---|
| Instala | `%LOCALAPPDATA%\FAM Financeiro` |
| Atalho com ícone | área de trabalho, perguntando ao Windows onde ela fica de verdade: com o OneDrive ligado ela não é `%USERPROFILE%\Desktop` |
| Menu Iniciar | `FAM Seguradora` → FAM Financeiro · Desinstalar · Pasta do sistema |
| Adicionar ou remover programas | `HKCU\...\CurrentVersion\Uninstall\FAMFinanceiro` |
| Desinstalador | `Desinstalar FAM Financeiro.cmd`, dentro da instalação |
| Carimbo | `versao.txt` com data, origem e a data do `dashboard.html` |

O atalho abre o Edge em janela limpa (`--app`), com o ícone `fam-financeiro.ico`. O ícone é
desenhado por código (`node fam-financeiro/gerar-icone.cjs`, de 16 a 256px, sem biblioteca): é o
mesmo "F" do logo do CRM. Sem ele o atalho nasce com cara de arquivo de HTML solto.

Rodar por cima **atualiza**, e diz que está atualizando. Rodando de dentro da pasta de
desenvolvimento, ele avisa que aquela é a pasta do código e instala noutro lugar, sem encostar em
nada dali: o Marco instala para testar e continua com o ambiente dele inteiro.

**Onde ficam os dados, e por que isso importa no desinstalador.** Os lançamentos ficam no
`localStorage` do Edge, presos ao usuário do Windows, e **não** dentro do `dashboard.html`. No
Edge o `file://` compartilha o mesmo `localStorage` entre pastas diferentes (verificado): a cópia
de desenvolvimento do Marco e a cópia instalada enxergam **os mesmos dados**. Daí que trocar o
arquivo de lugar, atualizar ou desinstalar não apaga nada, e que uma carga nova (`CARGA`) zera os
dois lados de uma vez. O que apaga é limpar os dados de navegação do Edge, e é por isso que o
desinstalador manda salvar a cópia dos dados antes de continuar.

Para testar sem sujar a máquina: `FAM_DEST` instala noutra pasta e `FAM_SEM_PAUSA` não espera
tecla.

---

## 12. A fase contábil

Nada precisa ser remodelado quando ela chegar:

- `contaContabil` já existe em toda natureza
- o razão já guarda data, contraparte, valor, natureza e origem por lançamento
- a trilha de auditoria é append-only desde o primeiro dia
- o fechamento de mês congela o período

O que entra depois: partida dobrada sobre o mesmo razão, plano de contas contábil amarrado ao
gerencial pelo `contaContabil`, e exportação no layout de importação da contabilidade.

---

## 13. Como reconstruir o arquivo

```bash
node fam-financeiro/build-dashboard.cjs
```

Junta as partes `_p1 _p2 _p3 _p4 _p6 _p7 _p8 _p9 _pa _p5` (o `_p5` vai por último: é ele que
dispara o início e precisa de tudo já definido), injeta `julho.json` no lugar do marcador
`/*__JULHO__*/null`, gera o ícone se ele não existir, confere a sintaxe de cada bloco `<script>`,
confere que os números de julho fecham contra a planilha, barra travessão no HTML e copia o
resultado para a pasta do Aldeir no OneDrive.

Três suítes de navegador, todas no Edge instalado, rodadas a partir da raiz do repositório:

```bash
node fam-financeiro/teste-dashboard.cjs   fam-financeiro/dashboard.html <pasta-de-prints>
node fam-financeiro/teste-excel.cjs       fam-financeiro/dashboard.html <pasta-de-prints>
node fam-financeiro/teste-novas-pecas.cjs fam-financeiro/dashboard.html
```

A primeira cobre a tela, os números, a importação e o robô; a segunda o jeito Excel e a largura
das colunas; a terceira a carga da Matriz, os vários meses com trimestre, a calculadora, a trilha
de auditoria e a assinatura do rodapé. As duas primeiras montam o agosto delas na abertura
(`gerarAgostoPadrao()`) e prendem a tela em dois meses: a carga de fábrica é só julho, e o que
elas conferem é o desenho de duas colunas.

---

Desenvolvido por: **Marco Aurélio Dragone**

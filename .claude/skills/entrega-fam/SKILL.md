---
name: entrega-fam
description: Processo de entrega de alta qualidade do FAM CRM — mapear antes de codar, reuso de fonte única, testar no app real contra o banco, revisão adversarial e correção. Use ao construir ou alterar QUALQUER funcionalidade do CRM (tela, rota, migração, integração), especialmente quando a mudança toca dinheiro, votação, dados de cliente ou o banco de produção.
---

# Entrega FAM — como chegar na qualidade máxima

Processo destilado da entrega da **Cédula de Votação do Comitê** (2026-07-20/21), que
passou por 97 agentes de revisão e teve 4 defeitos críticos capturados **antes** de
chegar ao usuário. Siga as cinco fases. Não pule a 4 nem a 5.

O princípio que atravessa tudo: **o custo de descobrir um erro cresce a cada fase.**
Um número errado achado no mapeamento custa minutos; achado pelo diretor durante uma
votação real, custa a confiança na ferramenta.

---

## Fase 1 — Desafiar a premissa antes de aceitar a tarefa

O Marco descreve o problema pela solução que imaginou. Duas vezes na mesma entrega a
premissa estava errada, e dizer isso **antes** de codar economizou dias:

- *"o arquivo é grande demais para o banco"* → o CRM nunca guardou arquivo no Postgres;
  sempre foi Supabase Storage. Não havia problema a resolver.
- *"o botão abre o WhatsApp com o arquivo anexado"* → tecnicamente impossível, nenhuma
  API do WhatsApp aceita anexo por link. Só texto.

**Faça:** antes de planejar, verifique no código/banco se o problema descrito existe
mesmo. Se a premissa cair, diga em uma frase e ofereça o caminho que funciona.
Nunca implemente em volta de uma premissa falsa só para não contrariar.

**Também nesta fase:** procure o conflito escondido no pedido. "Lista de transmissão"
(mensagem idêntica para todos) versus "link único por diretor" (token por pessoa) são
incompatíveis — isso precisa virar decisão explícita, não improviso na hora de codar.

---

## Fase 2 — Mapear o que já existe, exaustivamente

Nunca reproduza uma tela do CRM de memória ou "por semelhança". Mapeie campo a campo:
rótulo literal, coluna de origem, função de formatação, fórmula.

Use `Workflow` com um agente por área e **um verificador cético por mapa** — o
verificador achou fatos inventados no mapa original (um alerta citava um `grep` que
retornava zero resultados). Um mapa com evidência falsa é pior que nenhum mapa.

Perguntas que o mapa tem que responder:
- Qual o **rótulo exato** que o usuário lê? (`Realizado Atual` tem dois espaços.)
- De qual `tabela.coluna` vem? Passa por qual formatador?
- Que cálculo a tela faz? Copie o código, não a descrição.
- O que **não existe**? (`comite_comentarios` existia com 0 linhas e nenhuma UI de
  escrita — isso mudou o desenho da feature inteira.)

---

## Fase 3 — Construir com fonte única de verdade

**Regra dura: se dois lugares mostram o mesmo número, a fórmula mora em UM módulo.**

Na cédula, `anosVig`/`sufVig` eram funções locais de `operacoes/page.tsx`. Duplicá-las
teria criado o pior defeito possível: o diretor vota olhando um número e o subscritor vê
outro. Foram extraídas para `lib/comite/calculo.ts`, e o CRM passou a importar de lá.

Padrões do projeto que já existem e devem ser reusados:
- `lib/comite/votacao.ts` — `calcularPlacar`, `membrosComite`, `VOTO_META`
- `lib/comite/calculo.ts` — `anosVig`, `vigenciaTxt`, `calcularCenario`, `calcularImpacto`
- `lib/comite/whatsapp-sim.ts` — `montarConvite` (mesmo texto no simulador e no envio real)
- `lib/utils.ts` — `fmtMoeda`, `fmtPercent`, `maskCNPJ`, `fmtData`
- Fonte: `'Calibri','Segoe UI',sans-serif`. **Não introduza serifa nem outra família.**

Ao replicar o comportamento do CRM, replique inclusive o que parece errado — ou
sinalize a divergência ao Marco. Números que não batem com a tela que ele conhece são
lidos como bug, mesmo quando estão "mais certos".

---

## Fase 4 — Testar no app REAL, contra o banco, restaurando o estado

Build limpo não é teste. `npm run build` só prova que compila.

O padrão que funcionou (script em `scratchpad/`, ~50 asserções):

1. **Guarda o estado original** da operação/registro alvo num objeto.
2. **Monta o cenário** (muda status, cria token, seta o caso de borda).
3. **Sobe o servidor de verdade** (`next start`) num `spawn` dentro do próprio script —
   o ambiente bloqueia processos em background, então servidor + testes + shutdown
   moram no mesmo processo Node.
4. **Exercita por HTTP**, como o usuário: rota pública, API, estados de erro.
5. **Confere no banco** que gravou o que devia, com o valor que devia.
6. **`finally` que sempre restaura** e mata o servidor — mesmo se um teste explodir.
7. **Confirma a restauração** com um SELECT no fim.

Teste os caminhos negativos com o mesmo carinho que os positivos: token inválido,
expirado, revogado, voto por diretor alheio, força bruta de PIN, anexo de outro tomador,
comentário vazio. Foi assim que a maioria dos furos apareceu.

**Cuidado com o banco de produção.** Toda escrita de teste tem que ser reversível e
verificada. Se o Marco estiver usando o sistema no momento (dá para ver por registros
recentes), **não apague nada que não seja seu**.

---

## Fase 5 — Revisão adversarial, e corrigir o que ela achar

Rode `Workflow` com dimensões independentes e **3 céticos por achado**, cada um com uma
lente diferente (o código faz isso mesmo? / afeta o usuário de verdade? / é regressão ou
já existia?). Achado só sobrevive se menos de 2 refutarem. Isso filtra o ruído sem
perder o que importa.

Dimensões que valem para quase toda entrega do CRM:
- **paridade numérica** com a tela que já existe (o risco nº 1 em CRM financeiro)
- **segurança e vazamento** (o que vai parar no HTML? que policy RLS existe?)
- **mobile** (o Marco liga muito; alvos ≥44px, `font-size:16px` em input, sem scroll lateral)
- **regressão** (call-sites da prop nova, sandbox, imports circulares)

Os 4 críticos que essa fase pegou — todos meus, todos invisíveis no build:

1. **Unidade de medida.** `vigencia_anos` guarda o valor *na unidade* de
   `periodicidade_vigencia`. Escrever "anos" direto exibia "22 anos" onde eram 22 meses,
   em 29% do book.
2. **Policy RLS legada.** `ALL ... TO public USING (true)` — e `public` inclui `anon`.
   A chave pública do bundle lia e escrevia a tabela. **Ao criar tabela nova, sempre
   `TO authenticated`; nunca `USING (true)` solto.**
3. **Barreira de dados vs. barreira visual.** No App Router, prop de Server → Client
   Component é serializada no HTML. Uma tela de login/PIN dentro do componente client é
   `if` de renderização, **não** proteção: os dados já foram enviados. Só monte o dado
   sensível depois que a identidade estiver provada no servidor.
4. **Input numérico controlado.** `type=number` + `parseFloat(v) || 0` destrói o
   separador decimal (`0,84` → `84`). Use estado em **texto** e converta na leitura.

---

## Fase 6 — Relatar sem maquiar

- Diga o que **você** errou, com nome e impacto. O Marco confia mais em quem reporta o
  próprio erro do que em quem só reporta sucesso.
- Distinga o que foi **verificado** do que foi **inferido**. "Testei por HTTP e banco,
  não abri no navegador" é uma frase honesta e necessária.
- Nunca afirme que está pronto sem ter rodado. Se um passo foi pulado, diga qual.
- Marque as pendências reais (env var faltando, deploy, aprovação visual).

---

## Checklist rápido

- [ ] A premissa do pedido foi verificada no código/banco?
- [ ] O que já existe foi mapeado com rótulo, origem e fórmula literais?
- [ ] Toda fórmula duplicada virou módulo único, importado pelos dois lados?
- [ ] Fonte, cores e classes seguem o sistema (`globals.css`)?
- [ ] Tabela nova tem RLS `TO authenticated` (nunca `USING (true)` para `public`)?
- [ ] Dado sensível só é montado **depois** da identidade provada no servidor?
- [ ] Teste ponta a ponta rodou contra o banco e **restaurou** o estado?
- [ ] Caminhos negativos testados (inválido, expirado, forjado, vazio)?
- [ ] Revisão adversarial rodou e os achados confirmados foram corrigidos?
- [ ] O relato diz o que falhou, o que foi verificado e o que ficou pendente?

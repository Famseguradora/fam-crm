# Prompt para a próxima conversa — Mesa do Tomador

Copie tudo o que está entre as linhas e cole numa conversa nova do Claude Code,
aberta na pasta `fam-crm`.

---

Estou continuando a **Mesa do Tomador** do FAM CRM. A conversa anterior parou aqui, e este é o
estado real, medido, não suposto.

## O QUE JÁ ESTÁ FEITO E FUNCIONANDO

A tela existe em `/tomadores/<id>`. Clicar em qualquer lugar da linha na lista de tomadores abre
ela; a edição do cadastro virou o botão `✏️ Editar` na última coluna. Conferido no app real com
Playwright: abre, não dá erro de console, e não rola de lado nem no desktop nem em 390 px.

Arquivos, **todos ainda SEM COMMIT**:

| arquivo | estado | o que é |
|---|---|---|
| `app/(dashboard)/tomadores/[id]/page.tsx` | novo | a Mesa. Client Component. Next 16: `params` é Promise, resolvida com `use(params)` |
| `lib/analise/ficha.ts` | novo | lê a análise inteira do Supabase + exercícios + documentos |
| `lib/tomador/dossie-html.ts` | novo | o **Baixar HTML** |
| `components/tomador/icones.tsx` | novo | SVG inline, sem biblioteca |
| `app/globals.css` | alterado | bloco novo no fim, tudo com prefixo `.mt-*`, só append |
| `app/(dashboard)/tomadores/page.tsx` | alterado | clique na linha abre a Mesa; `useRouter`; coluna do lápis; `colSpan` 7→8 |
| `LEMBRETES.md` | novo | a fila do Marco, lida no início de toda sessão |

O layout foi ditado por uma imagem que o Marco fez no ChatGPT: cabeçalho com três KPIs à direita,
faixa de comprometimento do limite ao lado de quatro cartões com ícone, e embaixo o rail de
navegação à esquerda com o painel largo à direita. **Reproduzir, não recriar.** As cores são as do
CRM (`app/globals.css`), não as da imagem.

## O QUE FALTA, EM ORDEM

1. **Commitar, mas NÃO AGORA.** O Marco decidiu em 30/08: *"eu tenho que alterar muita coisa. ele
   fará o commit"*. Ou seja: **primeiro ele mexe no que quiser nesta tela, e o commit vem no fim**,
   feito por você, com ele presente. **Não ofereça commit antes de ele dizer que terminou de
   alterar.** Quando chegar a hora: listar arquivo por arquivo, **nunca `git add -A`** (uma sessão
   já levou arquivos de outra por engano).

   Enquanto isso, o risco existe e ele sabe: os arquivos da Mesa estão fora do git e há outras
   conversas no mesmo repo. Se você for mexer nos arquivos da tabela abaixo, confira antes se o
   que está no disco ainda é o que esta lista descreve.
2. **Carregar `analise_documentos`.** A tabela está com **ZERO linhas para as 131 análises**:
   ninguém nunca a populou (a migration cria, a carga só faz DELETE, não existe INSERT). O extrato
   do disco já está pronto, feito por outra sessão:
   `C:\Users\MarcoDragoneFAMSEGUR\OneDrive - FAM Seguradora\Documents\Analises FAM\_sistema\registro\documentos-para-o-crm.json`
   São **46 análises e 595 arquivos**, e as 85 que faltam estão listadas com o motivo, uma a uma.
   Campos: `chave_local`, `cnpj`, `pasta`, `onde`, `casou_por`, `retrato_em`,
   `documentos[{nome, bytes, hash16}]`. Casar por `chave_local`, caindo em `cnpj` + `data_analise`.
   **Normalizar NFC nos dois lados da comparação**: há 8 nomes em NFD, e estão justamente nas
   pastas com balanço. Ao terminar, dizer **46 de 131**, nunca "feito".
   **Três coisas que NÃO podem ficar de fora do script de carga.** Vieram das outras duas sessões,
   e as três são do tipo que não dá erro: se ficarem de fora, o dado sobe errado e ninguém percebe.

   a) **O booleano de "quem apurou".** O CNPJ que o Marco apurou e o que o robô chutou não podem
      chegar na tela com a mesma cara. O dado existe: é `identificacao.empresa_confiavel` no
      `_cadastro.json` de cada pasta, e viaja como `confiavel` no `_outlook-vistos.json`.
      **Se esse booleano não subir junto com o resto, depois não há como reconstruir quem apurou
      o quê.** E a Mesa precisa marcar a diferença de forma visível: hoje ela escreve a razão
      social em 25 px, e um palpite ali tem exatamente o mesmo peso visual de um fato. O caso
      concreto é o Ivamar, em que o classificador escolheu a empresa que aparecia em quatro
      aditivos, e não a tomadora, que só estava no Serasa.

   b) **Espelho velho parece vivo.** A tela tem que dizer **quando aquilo foi atualizado**, visível,
      não em rodapé. O `documentos-para-o-crm.json` já traz `gerado_em`, `aviso_hash` (o hash é
      sha256 CORTADO em 16, não o inteiro) e `aviso_retrato` (a lista é do início da análise, não
      de hoje). **Se esses avisos morrerem na carga, a tela passa a afirmar coisas que o dado não
      sustenta.**

   c) **Corpo e anexo de e-mail subindo para o banco é PERGUNTA PARA O MARCO**, não decisão de
      arquitetura: no Supabase outras pessoas leem. O extrato atual é inofensivo de propósito
      (só nome, bytes e hash, sem conteúdo nenhum). Não ampliar isso sozinho.

3. **Publicar: a análise completa o cadastro.** Salvar a análise preenche o tomador sozinho,
   **inclusive o limite**. Mas o campo pode já ter vindo do botão "Cadastro Básico": mostrar os
   dois valores lado a lado com a data de cada um, nunca sobrescrever calado. A Mesa já desenha
   esse confronto na gaveta "Análise de crédito"; falta a gravação.
4. **Serasa.** Score, risco, PEFIN, protestos, ações e consultas existem na análise mas não têm
   coluna no banco. A gaveta hoje diz honestamente que ainda não subiu. A busca automática pelo
   navegador (sem API) o Marco adiou.
5. **Campos criados por ele, estilo Pipefy**, e depois `pgvector` (disponível no projeto, ainda
   não ativado) para busca semântica.

## AS REGRAS QUE NÃO SE QUEBRAM

- **Nada de CRM sem o Marco presente.** Código, migration e commit só com ele junto.
- **Não escrever em `status`.** Os vocabulários de status do Sistema de Análise e do CRM não batem,
  e ele decidiu que a reconciliação fica para depois.
- **Nunca inventar número.** `limite_recomendado_num` só vale quando existe E quando
  `limite_recomendado_motivo` é nulo. Sem número, mostra-se o texto com o aviso do que ele é.
- **O estouro de limite só conta `Emitido`**, nunca `Aprovado`.
- **Palpite não pode ter a cara de fato.** Dado apurado pelo Marco e dado chutado por robô
  chegam na tela marcados de forma diferente, sempre. Senão o campo vira decoração e o chute
  vira fato em duas semanas.
- **Espelho de dado local diz a idade dele, visível.** Sem isso, tela velha parece viva.
- **Estado vazio não pode acusar o tomador.** "Nenhum documento" seria mentira quando o problema é
  que o índice nunca foi publicado.
- Ele **não gosta de travessão** (—). Usar ponto médio, dois-pontos ou parênteses.

## ARMADILHAS DESTA MÁQUINA, todas já pagas caro

- **`Next.js (stale)` no canto do balão de erro = servidor de dev velho.** Dá
  `"Jest worker encountered N child process exceptions"` em rota nova e serve CSS em cache (a tela
  aparece sem estilo nenhum). Conserto: derrubar os `next dev`, `Remove-Item -Recurse -Force .next`,
  subir de novo. **Não procurar bug no código antes disso.**
- **`next dev` recusa subir duas vezes na mesma pasta.** Hoje há um limpo de pé na **porta 3000**.
- **`npm run build` morre com `EPERM: unlink .next/static/...`** se algum `next start` estiver de pé.
  Parar o servidor antes de buildar.
- **Playwright**: o navegador dele não está baixado. Usar `chromium.launch({ channel: 'chrome' })`,
  com `require` por caminho absoluto, e `storageState: 'playwright-state.json'` para a sessão.
- **Heredoc come a barra invertida.** Script com `\` ou caminho do Windows vai por Write/Edit,
  nunca por heredoc.
- **Grid**: sem `min-width: 0` no item, o rail vira linha no celular e faz a página inteira rolar
  de lado.
- O lint já tinha 3 erros antes desta frente (`tomadores/page.tsx` linhas 156 e 1222). Não são novos.

## COMO CONFERIR QUE NÃO QUEBROU

O caso que exercita tudo é a **Maskan**, `/tomadores/84dbb77f-53a1-4f44-8a4b-049b9f622bb5`:
16 operações, análise vigente de 25/08/2026, e o limite do cadastro (R$ 29.834.731,17) diferente do
recomendado pela análise (R$ 16.400.733,06). Emitido: R$ 7.059.050,00 em 14 apólices.
Comprometido: 31,6%.

`npx tsc --noEmit` tem que passar limpo, e a tela tem que abrir pelo clique na linha sem erro de
console.

## OUTRAS CONVERSAS ATIVAS

Há mais duas sessões neste computador. Uma mexe no Sistema de Análises (`_sistema`, porta 7311) e
não encosta no repo do CRM. A outra tem alterações **sem commit** em `DashboardShell.tsx` e
`app/(dashboard)/page.tsx`. Antes de commitar, conferir se o que vai junto é seu.

Comece me dizendo o que entendeu do estado e o que pretende fazer primeiro, antes de escrever
qualquer código.

---

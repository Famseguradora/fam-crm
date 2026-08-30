# LEMBRETES

Esta lista aparece sozinha no começo de toda sessão do Claude Code.
Pode editar à mão. Item entregue **sai da lista**, não fica marcado acumulando.

## O que vai ser feito no CRM (ordem redefinida por ele em 30/08/2026)

Tudo converge para o CRM. Ele deixa de ser o cadastro e vira a casa de tudo, inclusive dos robôs.

- [ ] 1. **Análise de crédito** dentro do CRM. As 131 análises, 262 exercícios e 353 conflitos
      estão no banco desde 30/08, e a ficha lê do Supabase. **Falta**: a tela de Conferência
      (Tomadores › Conferência), o saneamento dos 213 tomadores sem CNPJ, o índice de documentos
      (`analise_documentos` está ZERADA nas 131, o dado está nos `_status.json` do disco) e a
      Edge Function que publica sozinha.
- [x] 2. ~~Financeiro~~ — **feito**, palavra dele em 30/08.
- [ ] 3. **Cadastro do tomador** — a tela única, forte, executiva. É a joia.
      **A Mesa do Tomador já existe**, em `/tomadores/<id>`, no layout que ele desenhou.
      Falta: publicar (a análise completar o cadastro ao salvar), Serasa, e os campos criados
      por ele estilo Pipefy.
- [ ] 4. **IAs e Robôs dentro do CRM** (era o 5)
- [ ] 5. **Múltiplos agentes, Organograma, e os agentes VISÍVEIS atuando nas telas** — "o principal"
- [ ] 6. **Dashboard inicial e o calendário**, que ele mandou fazer **junto com os agentes
      visíveis, os dois no fim**. Não começar antes.

Regra que vale para todas: **nada de CRM sem o Marco presente.** Código, migration e commit só com
ele junto.

## O que ele mandou gravar, e agora está gravado (29/08/2026)

Nenhum destes se perde mais: cada um virou arquivo de memória, e não só conversa.

- [ ] **Robô estatístico e de dados**, na máquina dele: desvio padrão, variância, risco,
      regressão linear "e mais". Gráficos e **tabelas customizadas montadas por ele**, tudo
      dentro do sistema. Estatística escrita em casa, com memória de cálculo ao lado do número.
      A **API do Claude entra só no fim** de todo o trabalho, palavra dele.
- [ ] **Calendário** (é o item 4 acima, visto pelo lado do Pipefy) e **notificação** quando vence.
- [ ] **Mensagens internas** dentro do card / tomador, estilo Pipefy. Nunca foi começado, e até
      hoje não existia registro nenhum disso. Não confundir com o mural dos agentes nem com os
      comentários que o Supabase já tem.
- [ ] **SLA por fase** visível como no print do Pipefy: contador, cor e motivo. Existe pela metade
      (a Mesa já fica vermelha quando estoura).
- [ ] **Serasa pelo navegador, sem API.** A conversa original **não está nesta máquina**: foram
      varridos os 374 MB de transcripts e não há nada. Foi no claude.ai web, cuja sincronização
      está desligada de propósito. O desenho precisa ser refeito com ele: qual portal, se roda
      sozinho ou sob comando, e se só baixa o PDF ou já grava os campos.
- [ ] **Supabase mensal + backup** — ele contrata quando o trabalho todo fechar.
- [x] **Baixar HTML** — pedido em 30/08: a análise deixa de morar em JSON, mas o botão de baixar
      HTML **fica**, porque ele manda o arquivo para a equipe. Já está feito na Mesa: um arquivo
      só, com tudo aberto, sem script nenhum dentro.

## Acesso, decidido em 30/08/2026

A análise de crédito tem **um analista só**. Todo mundo vê (ele quer a equipe
acompanhando o trabalho acontecer, e a Conferência atualiza ao vivo); ninguém
além dele edita. A marca é `usuarios.analista_credito`, e a trava é a RLS
`fam_e_analista()` — não é `perfil`, os 7 admins não passam.

- [ ] **Liberar as tais "algumas pessoas"** quando ele decidir quem. Não precisa de
      código nem de migration, é uma linha:
      `update usuarios set analista_credito = true where email = '…';`
- [ ] **Trocar a url do `_crm.json` no dia do deploy.** O motor avisa o CRM que uma
      análise começou (aviso no canto inferior direito, para a equipe toda). Hoje aponta
      para `http://localhost:3000`, que é o único endereço que existe. O arquivo está em
      `_sistema/estado/_crm.json` e o segredo dele tem que continuar igual ao
      `ANALISE_EVENTO_TOKEN` do `.env.local`. Sem isso o aviso simplesmente não sai, e
      a análise roda igual (de propósito: aviso nunca derruba análise).
- [ ] **O pipeline de e-mail nasce trancado.** Hoje o e-mail dele não está exposto
      porque o servidor local só escuta em `127.0.0.1`. No dia em que o corpo do
      e-mail subir vetorizado para o Supabase, ele passa a morar num banco
      compartilhado: a tabela `emails` precisa nascer com RLS de dono, no mesmo
      movimento em que for criada. Não depois.

## Com data marcada

- [ ] **22/09/2026** — vence a primeira apólice (Usina Termelétrica de Lins, R$ 21.045.420). É o
      primeiro caso de devolução de limite. Até lá, ou a linha do tempo existe ou o limite
      comprometido passa a mentir. Hoje nenhuma das 24 emitidas venceu: a janela está limpa.

## Duas perguntas dele que estão em aberto

- [ ] Apólice **vencida** devolve o limite integralmente, ou fica parte retida por cauda?
      Enquanto não responder, o cálculo soma todas as emitidas (critério conservador).
- [ ] Qual a **periodicidade** que a política de crédito manda para cobrar demonstrativo financeiro?
      Por faixa de limite ou por rating? E a notificação chega no CRM, por e-mail, ou nos dois?

## Dívida achada no banco, não é plano

- [ ] **Nova Tech Engenheiro** com o limite estourado: R$ 3.893.845,49 emitidos contra R$ 3.628.500,00
      aprovados. R$ 265.345,49 acima, e é anterior a qualquer alarme.
- [ ] **Fator Towers** em 98,1% do limite. Não estourou, mas não cabe mais nada.

## Por onde entrar

Plano do tomador único, com o controle de limite e a linha do tempo, e com "Modo revisão" para
rabiscar: https://claude.ai/code/artifact/fd9aea0f-df46-45eb-bf67-465e6a899675

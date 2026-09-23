# Proposta à diretoria: profissionalizar a base de dados e a IA do CRM FAM

Documento preparado para apoiar a decisão da diretoria sobre investimento em infraestrutura (Supabase, API de IA e leitura direta de e-mail). Data: 15/09/2026.

## Por que este documento existe

Hoje, a esteira de crédito mais avançada que a FAM já teve depende de três coisas frágeis ao mesmo tempo: um notebook ligado, uma aba do Outlook clássico aberta e uma pasta guardada no computador de uma única pessoa. Se esse notebook travar, for formatado, ficar sem internet ou simplesmente for desligado porque o dono viajou, a análise de crédito da empresa inteira para. Isso já aconteceu: o servidor local caiu no meio do expediente mais de uma vez.

Isso não é detalhe de TI. É um risco de continuidade de negócio que a diretoria carrega sem ter sido formalmente informada dele.

E há um segundo desconforto, mais difícil de admitir: construímos, sem gastar um real além do que a empresa já pagava, uma esteira de crédito com agentes de IA que vai do e-mail recebido até a análise pronta, algo que poucas seguradoras do nosso porte têm hoje, e várias tratam como diferencial competitivo caro de plataformas como Sixfold ou Federato. Só que o mesmo desenho que nos trouxe até aqui de graça é o que agora nos impede de crescer: rodar tudo numa pasta de computador pessoal não escala para Comercial, Cadastro e Subscrição juntos.

A pergunta que este documento responde não é "quanto custa profissionalizar isso". É: até quando a FAM aceita que a continuidade da sua análise de crédito dependa do notebook de uma pessoa.

---

## 1. Como funciona hoje

### 1.1 As atividades que passam pelas minhas mãos

| Atividade | O que acontece hoje | Onde trava em mim |
|---|---|---|
| Leitura do e-mail (entrada) | O Carteiro lê a caixa via Outlook clássico (protocolo COM do Windows) | Preciso manter o Outlook aberto e logado; sem isso, nada entra |
| Triagem de documentos | Automática desde 10/09/2026: a pasta do tomador nasce sozinha e a triagem roda sem eu clicar | Quando falta documento, o sistema para e espera minha autorização manual |
| Cadastro do tomador | Agente de Cadastro lê os documentos, confere Receita e Serasa e preenche o CRM sozinho | Só funciona com o notebook ligado e a pasta local acessível |
| Análise de crédito (motor integrado) | O motor roda sozinho e entrega um rascunho de análise | Na última medição, reescrevi a conclusão em 34 de 36 análises e a classificação de risco em boa parte delas: o robô ainda entrega rascunho, não parecer pronto |
| Gravar no banco de dados | Tudo grava no Supabase ao final de cada etapa | Sem problema hoje, mas o histórico de documento e o "retrato" do tomador ainda dependem da pasta local |

### 1.2 As três dependências que preocupam

1. **Outlook clássico aberto**: leitura de e-mail é por COM, não por API. Sem a janela aberta, o Carteiro não enxerga e-mail novo.
2. **Notebook ligado com telas abertas**: Carteiro, Análise e o servidor do CRM (`crm-servidor.vbs`) rodam localmente. Fechar a tela ou desligar a máquina para a esteira.
3. **Pasta do computador como banco**: documento, histórico e retrato do tomador moram em pasta local, não em um banco central acessível de qualquer lugar.

Nenhuma dessas três é culpa de mau projeto: foi a forma mais rápida e **sem custo** de provar que o modelo funciona. Funcionou. Agora precisa de outra base para crescer.

---

## 2. O que já construímos, com custo adicional zero

Tudo abaixo já está rodando (ou construído e pronto para produção) sem nenhuma assinatura nova, usando o plano gratuito do Supabase e o teto de IA já aprovado pela diretoria (até US$ 5/dia):

- **Esteira automática, do e-mail à análise**: Trazer → pasta → triagem → Cadastro (IA) → análise, sem digitar o mesmo dado duas vezes.
- **Carteiro gerencial**: painel que classifica e prioriza os e-mails recebidos, com IA em camadas (regra grátis primeiro, IA só no caso incerto).
- **IA Gestor em todo o CRM**: um painel único (Ctrl+I) com um robô que responde de graça, sem API, mais um modo avançado com IA quando ligado.
- **Organização virtual de agentes**: 14 "funcionários" de IA (ver seção 3) com hierarquia, alçada e um mural onde reportam o próprio trabalho.
- **Funil de crédito em cards**, mesa do tomador e relatório gerencial mensal da diretoria, todos consumindo o mesmo banco.

Este é o argumento central deste documento: **a FAM já provou o modelo sem gastar um real a mais**. O pedido de investimento que vem a seguir não é para começar algo novo, é para não deixar o que já funciona travado no computador de uma pessoa.

---

## 3. Nossa equipe de IA hoje (organização virtual)

A FAM já opera com 14 "funcionários" virtuais organizados por setor (não por pirâmide: cada um responde por uma parte diferente da mesma análise). Dos 13 agentes (fora eu, que superviso todos), 5 não usam IA nenhuma (só regra e cálculo, custo zero), e dos 8 que usam IA, a distinção que importa para o orçamento **não é se usam IA, é onde essa IA roda**:

- **IA pela API paga** (platform.claude.com, cobrada por token): só para os agentes que precisam responder sozinhos, para toda a equipe, mesmo sem mim por perto.
- **IA pela minha sessão local** (Claude Code no meu computador, já incluído na assinatura): para os agentes que só eu acionei, no meu ritmo. Isso continua funcionando exatamente assim mesmo depois da migração para o Supabase: eles passam a ler o documento do banco novo em vez da pasta, mas continuam sem gerar cobrança por chamada.

| Setor | Função | Usa IA? | Onde roda | Gera custo de API? |
|---|---|---|---|---|
| Consulta | IA Gestor (painel geral) | Sim | Nuvem (API), para toda a equipe | Sim, centavos por chamada com cache |
| Consulta | IA de Gestão (relatório mensal) | Sim | Nuvem (API), cai para minha fila se faltar | Sim, centavos por chamada |
| Consulta | IA do card (aba de cada tomador) | Sim | Nuvem (API) | Sim, centavos por chamada |
| Entrada | Carteiro (classifica e-mail) | Sim | Nuvem (API), roda sozinho o dia inteiro | Sim, mas em camadas: regra grátis primeiro, Haiku 4.5 depois, Sonnet 5 só no caso incerto |
| Entrada | Agente de Cadastro | Sim | Hoje: minha sessão local | Só se decidirmos automatizar sem mim presente; senão continua US$ 0 |
| Aprendizado | Auditor-chefe | Sim | Minha sessão local | Não precisa migrar para API; **US$ 0** |
| Consulta | Análise prévia | Sim | Minha sessão local | Não precisa migrar para API; **US$ 0** |
| Aritmética/Entrada | Bibliotecário do tomador | Sim | Minha sessão local | Não precisa migrar para API; **US$ 0** |
| Aritmética | Conferente / auditor de conta | Não | Cálculo puro | Zero |
| Contrato | Validador do contrato | Não | Regra | Zero |
| Conduta | Supervisor da esteira | Não | Medição | Zero |
| Vida | Vigias (monitoram a fila) | Não | Medição | Zero |
| Mural | Recados (comunicação entre agentes) | Não | Registro | Zero |

*Situação levantada em 11/09/2026; como é um sistema vivo, recomendo confirmar o estado atual na tela `/equipe` antes de apresentar este quadro à diretoria.*

**O que isso mostra para a diretoria**: dos 13 agentes, só **4 realmente precisam de API paga** (IA Gestor, IA de Gestão, IA do card e Carteiro), porque são os únicos que respondem para toda a equipe, sozinhos, o dia inteiro. Os outros 9 ou não usam IA (5, custo zero) ou continuam rodando pela minha sessão local, dentro da assinatura que já pago, exatamente como hoje (4). O gasto de API real está concentrado numa fatia pequena da operação, não nos 14 agentes.

---

## 4. Por que o modelo atual não escala

O mesmo desenho que provou o conceito de graça tem um teto: cada agente que "aguarda" na tabela acima está esperando não por dinheiro, mas por sair da dependência do notebook. Ligar Comercial, Cadastro e Subscrição no mesmo padrão, do jeito que está hoje, significa depender ainda mais de uma máquina e de uma pessoa. É o oposto de profissionalizar.

---

## 5. A proposta

Resumo executivo (detalhamento técnico em documento à parte, já validado comigo):

1. Leitura de e-mail direto da nuvem (Microsoft Graph API), sem depender do Outlook aberto.
2. Todo documento passa por OCR antes de qualquer gravação: guardamos o texto útil, nunca o arquivo bruto sem necessidade.
3. Banco vetorial (Supabase com `pgvector`) para busca semântica entre tomadores, documentos e análises.
4. Um servidor (MCP) que conecta a IA a esse banco de qualquer lugar, tirando a IA do notebook.
5. Os motores (esteira, Carteiro, análise) migram para rodar na nuvem, não mais numa máquina pessoal.
6. A pasta do tomador continua existindo, mas deixa de ser obrigatória: vira arquivo, não mais peça que trava o sistema.

Migração incremental, fase por fase, sempre rodando em paralelo com o que já funciona antes de desligar qualquer coisa antiga.

---

## 6. Quanto isso custa (comparado com o que gastamos hoje)

**Hoje**: o custo adicional de infraestrutura é praticamente zero. Usamos o plano gratuito do Supabase, o Outlook que a empresa já paga, e o único gasto real é o teto de IA já aprovado pela diretoria (até US$ 5/dia, raramente atingido). Isso já está rodando, independente desta proposta.

**Estimativa da evolução** (faixas, não valores fechados; câmbio aproximado de R$ 5,50/US$; recomendo validar com um piloto de 30 dias antes de fechar o plano definitivo, como já era o próximo passo combinado):

| Item novo | Mínimo/mês | Máximo/mês | Observação |
|---|---|---|---|
| Supabase (banco vetorial) | US$ 0 | US$ 85 | `pgvector` é extensão do Postgres, funciona no plano gratuito que já usamos; só migramos para o plano pago se o volume estourar o limite gratuito ou precisarmos de backup diário |
| OCR dos documentos | US$ 0 | US$ 60 | Piloto usa OCR de código aberto (sem custo por página), hospedado no próprio Supabase; só migramos para serviço pago (Azure/AWS) se a qualidade não bastar em documento ruim/escaneado torto |
| Embeddings (busca semântica) | US$ 0 | US$ 25 | Piloto usa modelo de embedding de código aberto (multilíngue, sem custo por chamada); serviço pago (Voyage AI) só entra se precisarmos de mais qualidade em escala |
| Microsoft Graph (leitura de e-mail) | US$ 0 | US$ 12 | Zero se a licença Microsoft 365 atual já permitir; senão, upgrade pontual |
| **Total de infraestrutura nova** | **US$ 0** | **US$ 182** | O piloto de 30 dias pode rodar com **custo adicional zero**; os valores altos só entram se o volume real exigir upgrade, o que o próprio piloto mede |

### 6.1 Como mantemos o custo de IA baixo, mesmo com mais áreas entrando

Só 4 dos 13 agentes precisam de API paga (ver seção 3): os que respondem para toda a equipe, sozinhos, o dia inteiro. Os agentes que só eu acionei continuam pela minha sessão local (Claude Code, já pago pela assinatura), mesmo depois da migração para o Supabase. Três mitigações adicionais, já parte da estratégia aprovada em 04/09/2026:

1. **Modelo por complexidade**: Haiku 4.5 para tarefa simples e de alto volume (classificar e-mail, resposta rápida do painel), Sonnet 5 no meio-termo, Opus 5 reservado só para a análise de crédito/subscrição em si. Haiku custa uma fração do preço de Sonnet por token.
2. **Cache de prompt**: a instrução e a política fixa que se repetem em toda chamada são lidas do cache a um décimo do preço normal, em vez de reescritas do zero a cada pergunta.
3. **Nenhum agente relê o que já foi processado**: cada etapa grava o resultado e a seguinte lê o que já está pronto, regra em vigor desde a esteira automática de 10/09.

Com isso, o teto diário de IA precisa subir menos do que se todos os 13 agentes fossem para a API: do atual (até US$ 150/mês, raramente batido) para uma faixa de US$ 150 a US$ 200/mês, mesmo com Comercial e Subscrição entrando. Isso não é custo novo de infraestrutura, é ajuste de um teto que a diretoria já aprovou no princípio, e é teto máximo, não gasto real esperado.

**Total do pacote completo (infraestrutura nova + IA ampliada): faixa de US$ 150 a US$ 380/mês** (aprox. R$ 825 a R$ 2.100/mês). O piso da faixa é só o teto de IA que já existe hoje: o piloto de 30 dias, usando código aberto para OCR/embedding e o plano gratuito do Supabase, pode custar **US$ 0 a mais** do que já gastamos.

---

## 7. Gatilhos para a decisão da diretoria

- **Continuidade de negócio**: hoje, um notebook desligado interrompe a esteira de crédito da FAM inteira. Isso é risco operacional, não deveria depender de uma pessoa.
- **Velocidade comercial**: e-mail entra, dossiê sai, sem depender de tela aberta, encurta o ciclo entre pedido e decisão.
- **LGPD e auditoria**: dado de tomador e segurado sai de uma pasta pessoal sem controle central para um ambiente com log, criptografia e acesso auditável.
- **Diferencial de mercado**: a FAM já tem, de graça, o que resseguradoras e concorrentes pagam caro para plataformas como Sixfold e Federato. Formalizar a base de dados é o que falta para usar isso como vitrine em negociação com parceiro e resseguradora.
- **Escala sem contratar**: a mesma estrutura de agentes hoje usada só no Crédito passa a servir Comercial, Cadastro e Subscrição, sem duplicar equipe humana.
- **Investimento pequeno perto do risco evitado**: o teto máximo estimado (US$ 380/mês, cerca de R$ 2.100) é menor que um salário de analista júnior, para tirar a operação de crédito da dependência de uma única pessoa e um único notebook.

---

## 8. Como isso não atrapalha o trabalho diário

- Migração por fase, sempre em paralelo: nada antigo é desligado antes do substituto estar provado.
- A pasta do tomador continua existindo e sendo usada normalmente durante toda a transição.
- Testamos em um tomador só antes de virar padrão, como já fazemos hoje em qualquer mudança de tela.
- O piloto de 30 dias mede o uso real antes de qualquer plano pago virar compromisso maior.

## 9. O que peço à diretoria

Aprovação para: (1) assinar o plano pago do Supabase e iniciar a Fase 0 da migração; (2) autorizar o registro do aplicativo de leitura de e-mail no Microsoft Entra ID; (3) rodar um piloto de 30 dias medindo o custo real de IA, OCR e banco vetorial antes de fixar o orçamento definitivo.

# PROMPT — Recriar o "Comitê / Deliberação" no sistema REAL (produção)

> Copie tudo abaixo da linha em uma nova conversa, junto com os prints das telas.
> Este prompt descreve uma funcionalidade já validada em ambiente de simulação; agora
> deve ser implementada **de verdade**: com **banco de dados real (Postgres/Supabase)** e
> **WhatsApp real via Meta Cloud API** (não simulado).

---

## CONTEXTO

Implemente a funcionalidade **"Deliberação do Comitê"** (votação colegiada estilo julgamento)
no FAM CRM (Next.js + Supabase/Postgres). É um fluxo onde, quando uma operação vai para o
status **"Comitê"**, os diretores votam (Aprovado / Aprovado com Ressalva / Reprovado), com
placar ao vivo, parecer da subscrição, histórico, pedido de vista e convite/votação pelo
**WhatsApp**. As telas de referência estão nos prints anexados — replique a aparência e o
comportamento fielmente.

> Observação de ambiente: estou anexando prints de uma versão validada. Reproduza **igual**.

## NÃO FAZER (exclusões)

- **NÃO altere a tela de Operações além da integração do Comitê.** Em especial, **não mexa
  nos ícones de modalidade** nem em qualquer cosmético não relacionado. Só adicione o que o
  Comitê exige (aba Deliberação, fluxo de status→Comitê, trava do "Devolver").
- Não use mocks/simulação: aqui é **banco real** e **WhatsApp real (Meta)**.

---

## 1) MODELO DE DADOS (migrations SQL)

**usuarios** — adicione:
- `comite BOOLEAN NOT NULL DEFAULT false` — diretor votante do comitê.
- (já existe `telefone TEXT`, mascarado sem DDI.)

**operacoes** — adicione:
- `parecer_subscricao TEXT`
- `voto_subscricao TEXT` CHECK em ('aprovado','aprovado_ressalva','reprovado')
- `subscritor_nome TEXT`
- `comite_enviado_whatsapp BOOLEAN NOT NULL DEFAULT false`
- `comite_parecer_final TEXT` (valores: 'Aprovada' | 'Aprovada com Ressalva' | 'Reprovada' | 'Empate')
- `comite_encerrado BOOLEAN NOT NULL DEFAULT false`
- `comite_vista_por TEXT`
- `comite_vista_cargo TEXT`
- `comite_vista_justificativa TEXT`

**comite_votos** — crie (1 voto por diretor por operação; re-voto = UPDATE):
```sql
CREATE TABLE public.comite_votos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id   UUID NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
  usuario_id    UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  autor         TEXT NOT NULL,                 -- nome do diretor (desnormalizado)
  cargo         TEXT,
  voto          TEXT NOT NULL CHECK (voto IN ('aprovado','aprovado_ressalva','reprovado')),
  segue_subscritor BOOLEAN NOT NULL DEFAULT false,  -- "Acompanho o Subscritor"
  argumentacao  TEXT,
  canal         TEXT NOT NULL DEFAULT 'crm' CHECK (canal IN ('crm','whatsapp')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operacao_id, usuario_id)
);
CREATE INDEX idx_comite_votos_operacao ON public.comite_votos (operacao_id);
```
Habilite RLS e crie policies: leitura para usuários autenticados; escrita pelo CRM (usuário
autenticado) e pelo webhook (service-role). Habilite **Realtime** em `comite_votos` e
`operacoes`.

**anexos**: a "análise de crédito" é um anexo do **tomador** (`entidade_tipo='tomador'`,
`entidade_id = tomador_id`). Já existe a tabela e o componente de upload — reaproveite.

---

## 2) ENUM DE VOTO + REGRA DO PLACAR (lib pura, sem IO)

`type VotoComite = 'aprovado' | 'aprovado_ressalva' | 'reprovado'`
Exibição: Aprovado ✅ (verde #22c55e), Aprovado com Ressalva ⚠️ (âmbar #d07830), Reprovado ❌ (vermelho #ef4444).

`calcularPlacar(votos, membros)` retorna `{ aprovado, aprovado_ressalva, reprovado,
aprovadosTotal, total, totalMembros, pendentes, completo, parecerFinal }`, onde:
- `membros` = usuários com `comite=true` e ativos.
- `aprovadosTotal = aprovado + aprovado_ressalva` (favoráveis).
- `pendentes = totalMembros − total`; `completo` quando todos votaram.
- Quando completo: `reprovado > aprovadosTotal` → **Reprovada**; `reprovado == aprovadosTotal`
  → **Empate**; senão se `aprovado_ressalva > 0` → **Aprovada com Ressalva**; senão **Aprovada**.

Helpers:
- `resolverVotoSeguindo(votoSubscricao)` → herda o voto do subscritor (default 'aprovado').
- `destinoSugerido(parecerFinal)` → próximo passo: Reprovada→Recusar; Empate→Devolver p/ Análise; aprovações→Aprovar.

---

## 3) TEMPO REAL

Cada voto deve **aparecer na tela de todos em tempo real**. Use **Supabase Realtime**
(`postgres_changes` em `comite_votos` e `operacoes`): ao receber evento, recarregue votos +
operações na tela de Comitê.

---

## 4) TELA DE USUÁRIOS — acesso de voto do diretor

- Adicione a flag **"🏛 Membro do Comitê"**: uma **coluna com botão de liga/desliga** na
  tabela (🏛 "Vota" / ○ "Não") e um **checkbox no formulário de edição** ("Membro do Comitê —
  pode votar no Julgamento; com telefone cadastrado, recebe o convite no WhatsApp").
- Persista `comite` no update do usuário.

---

## 5) FLUXO: STATUS → "COMITÊ" (não bloqueante, baseado no papel)

Ao mudar o status de uma operação para **"Comitê"** (qualquer pessoa pode; **não bloqueia** —
o status muda na hora):
- Se quem mudou **é subscritor** (cargo contém "subscri": Subscritor, Coordenador/Diretor de
  Subscrição): abra modal **"Deseja Registrar seu Voto?"** → **Sim** abre a Deliberação para
  ele registrar o parecer/voto da subscrição; **Não** mantém em Comitê (vota depois).
- Se **não é subscritor**: mostre **lembrete aos subscritores** ("há nova operação para
  votar", listando os subscritores) com a opção de abrir a Deliberação.
- Ofereça **"Enviar convite ao Comitê pelo WhatsApp"** (ver seção 8).

## 6) TRAVA DO "DEVOLVER"

No rodapé da operação em Comitê, **remova os botões "Aprovar" e "Negar"** (a decisão sai da
votação). Mantenha só **"↩ Devolver para Análise"** (volta status para "Em Análise").
**Trava:** se já existir **qualquer voto de diretor** OU `voto_subscricao` preenchido, ao
clicar mostre um aviso bloqueando: **"🔒 Função não liberada: Voto já proferido."**

---

## 7) TELA "DELIBERAÇÃO" (componente PainelJulgamento) — TEMA ESCURO PREMIUM

Aba **"⚖️ Deliberação"** (padrão) dentro do card da operação em Comitê. Réplica fiel dos
prints. Componente **presentacional** (recebe dados + callbacks; toda persistência no pai).

**Visual:** fundo navy em gradiente (#0c1426→#0e1a32), cards escuros (#111d38) com borda
#27375a; texto branco/#8da3c4; acentos: azul #3b82f6, roxo #a855f7, verde #22c55e, dourado
#e8b84b. Fonte padrão do sistema.

**Cabeçalho:** selo "👑 Deliberação do Comitê" (pílula roxa) + título (razão social do
tomador) + chips (CNPJ, modalidade, LMG, Taxa, **Prêmio em verde**). **No topo-direito**, um
**"Selo do Comitê" compacto (~84px)**: enquanto vota mostra ⚖️ "EM DELIBERAÇÃO · COMITÊ·FAM"
+ "X/Y votos · faltam Z"; ao **fechar o quórum** ele **"carimba" o veredito** (🏆 APROVADA /
🚫 REPROVADA / ⚖️ EMPATE) com animação de carimbo (escala + leve rotação −8°) e brilho.

**Linha com 2 cards:**
- **Placar ao Vivo** (esq): contadores grandes Favoráveis (verde) / Contrários (vermelho) /
  Pendentes (azul); barra segmentada por voto; legenda; e o box **"📑 Análise de Crédito &
  Anexos"** listando os anexos do tomador com botão **"↓ baixar"** (link assinado do arquivo)
  — para os diretores consultarem antes de votar.
- **A Bancada** (dir): cabeçalho com "FALTAM N DIRETORES" + botão **"📜 Histórico"**. Um card
  por diretor (membros do comitê). Quem **já votou**: pílula sólida do voto + **glow colorido**
  na borda (verde/âmbar/vermelho) + tag "⚖️ Acompanha" (se seguiu o subscritor) + "ver
  detalhes →" (abre o histórico focado nele). **Pendente**: botão **"🗳️ Votar"** (roxo).

**Votação on-demand:** as caixas de texto **só aparecem ao votar**. Clicar "Votar" abre um
painel: opções (os 3 votos + **"🤝 Acompanho o Subscritor"** + **"⏸️ Pedir Vista"**) + textarea
de **argumentação** (que só aparece após escolher) + botão **"⚖️ Proferir voto"**.

**Pedir Vista:** ao escolher, a textarea vira **"Justificativa da vista" (obrigatória)** e o
botão vira **"⏸️ Confirmar Pedido de Vista"**. Isso **pausa a deliberação**: banner âmbar
"Processo em VISTA — pedida por [nome]: [motivo]", botões de votar **bloqueados**, e botão
**"▶ Retomar deliberação"** (limpa a vista).

**Parecer da Subscrição** (seção compacta): mostra "[subscritor]: [parecer]" + pílula do voto;
botão **"✏️ Editar / + Registrar parecer"** revela o form (textarea + 3 botões de voto +
Salvar). Salvar grava `parecer_subscricao` + `voto_subscricao` + `subscritor_nome`.

**Parecer Final:** quando completo, banner colorido com o veredito + "próximo passo sugerido ao
subscritor" (de `destinoSugerido`).

**Modal Histórico (📜):** ao clicar num diretor que votou (ou no botão Histórico): mostra (se
focado) o **voto em destaque** (avatar, nome, cargo, voto grande, canal 📱WhatsApp/🖥️CRM,
data/hora, argumentação completa) + a **Linha do Tempo**: abre com o Parecer da Subscrição,
depois cada voto em ordem cronológica (quem, voto, cargo, canal, data/hora, justificativa) e,
se houver, o Pedido de Vista.

**Animações:** **chuva de confete a cada voto** (✨💙🎉🐾⭐) — um pouco maior em voto favorável,
discreta em contrário; e uma **chuva maior ao fechar o quórum favoravelmente**. Respeitar
`prefers-reduced-motion`. (Tínhamos testado um mascote/cachorro, mas **foi descartado** —
não inclua o cachorro; o **Selo do Comitê** é o elemento gráfico.)

**Botões de rodapé:** "💬 Abrir WhatsApp" e "👥 Reenviar convites" (ver seção 8).

---

## 8) WHATSAPP REAL (Meta Cloud API)

Já existe a base: webhook em `app/api/whatsapp/webhook` + cliente em `lib/whatsapp/client.ts`
+ variáveis (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, etc.). Use a
**Cloud API da Meta** de verdade.

**Enviar ao Comitê:** quando o subscritor confirma "Enviar para o Comitê", o servidor envia,
para **cada diretor com `comite=true` e telefone cadastrado**, uma mensagem **personalizada
pelo nome**:
> "Olá, *Sr(a). Sérgio Macedo* 👋 — O Subscritor *Ivan Lima* acabou de te convidar a conhecer
> uma operação que entrou em *Comitê*.
> 🏢 Tomador: [Razão Social] · 📋 Operação: [modalidade]
> 💰 Prêmio: [..] · 🛡️ LMG: [..] · 📈 Taxa: [..] · ⏳ Prazo: [..]"

Com **botões interativos**: **"📄 Ver análise de crédito"** (envia link assinado do anexo do
tomador, ou deep-link autenticado para a operação no CRM) e **"🗳️ Votar"** (revela os botões
**Aprovar / Aprovado com ressalva / Reprovar**). Como é mensagem iniciada pela empresa fora da
janela de 24h, será necessário **template aprovado na Meta** para o disparo inicial.

**Receber o voto:** o **webhook** trata o clique no botão de voto e grava em `comite_votos`
(`canal='whatsapp'`, `autor`=nome do diretor, casando o telefone → usuário via service-role,
fazendo UPSERT por `(operacao_id, usuario_id)`). Em seguida, responde no WhatsApp com **placar
parcial** + confirmação; quando fecha o quórum, envia o **veredito** + felicitações. Cada voto
recebido deve refletir **em tempo real** na tela (via Realtime, seção 3).

**Segurança:** valide a assinatura HMAC (x-hub-signature-256), só aceite votos de telefones de
diretores `comite=true` ativos, e trate idempotência (reenvios da Meta).

---

## 9) CRITÉRIOS DE ACEITE

- [ ] Migrations aplicadas (usuarios.comite, colunas em operacoes, tabela comite_votos, RLS, Realtime).
- [ ] Usuários: flag Comitê (coluna + checkbox) persiste.
- [ ] Mudar status p/ "Comitê" não bloqueia; modal certo conforme papel (subscritor x não).
- [ ] Deliberação fiel aos prints (tema escuro, placar, bancada, selo no topo, votação
      on-demand, Pedir Vista, parecer, histórico, confete, anexos com link real).
- [ ] Votos aparecem em tempo real para todos.
- [ ] "Devolver" travado quando há voto proferido (msg "Função não liberada: Voto já proferido").
- [ ] WhatsApp real: convite personalizado, ver análise, votar pelos botões, placar/veredito,
      e o voto cai no banco e na tela.
- [ ] Operações: **nada de ícones de modalidade** nem outros cosméticos alterados.
- [ ] Regra do placar/parecer final exatamente como na seção 2.
```

-- ============================================================================
--  A PASTA QUE SAIU DO COMPUTADOR  ·  10/09/2026
--
--  Pedido do Marco: "as analises de credito, quando terminadas e quando eu
--  recortar a pasta do tomador do meu computador e colar na rede da FAM, nao
--  precisaria ficar mais aparecendo dentro da tela Mesa". Casos: Rialma, Renova
--  Energia e Construtora e Incorporadora BOUW.
--
--  Por que nao acontecia: o agente da esteira so manda ao CRM as pastas que ele
--  enxerga (raiz + _concluidas das ultimas 24 h). Quando a pasta sai do disco ele
--  simplesmente para de mandar, e o card fica parado no banco para sempre. A Mesa
--  lista a tabela inteira, entao o card nunca saia.
--
--  Agora o agente compara o banco com o disco (raiz e _concluidas, qualquer idade)
--  e, quando a pasta nao esta em nenhum dos dois por duas rodadas seguidas, grava
--  esta data. Se a pasta voltar, a marca e limpa.
--
--  Quem esconde e a MESA (lib/analise/mesa.ts `naMesa`), e nao o GET da esteira: a
--  automacao do agente continua lendo a fila inteira.
--
--  E escrita so pelo agente (service role, /api/esteira). Nenhuma policy nova: a
--  leitura segue as policies que analise_fila ja tem.
-- ============================================================================

alter table public.analise_fila
  add column if not exists fora_do_disco_em timestamptz;

comment on column public.analise_fila.fora_do_disco_em is
  'Quando o agente viu que a pasta nao esta mais nem na raiz nem em _concluidas (recortada para a rede, apagada). Nulo = a pasta esta no computador. Analise concluida com esta marca sai da Mesa; a analise continua no Acervo.';

-- ROLLBACK
-- alter table public.analise_fila drop column if exists fora_do_disco_em;

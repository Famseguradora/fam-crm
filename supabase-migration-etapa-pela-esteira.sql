-- ============================================================================
--  A ESTEIRA DA ANÁLISE MOVE A ETAPA DO CARD  ·  28/09/2026
--
--  O caso que abriu isto: o Instituto de Pesquisas Eldorado subiu na análise,
--  faltavam balanços, Serasa e contrato social (Cadastro e triagem), e o card
--  do tomador continuava dizendo "Comercial · com a central". A esteira sabia
--  onde o caso estava; `tomadores.central_area` não, porque só mudava à mão.
--  Medido antes desta migration: 45 tomadores com análise CONCLUÍDA ainda em
--  Comercial.
--
--  Decisão do Marco, 28/09/2026: "a esteira da análise move a etapa sozinha até
--  Crédito; daí em diante é manual" (o Concluir de cada área, como sempre).
--
--  A REGRA, espelho de `areaDaFase` em lib/card/secoes.ts:
--    fase entrada | conferencia                 -> cadastro  (Cadastro e triagem)
--    fase liberado | analisando | pronta        -> credito
--  A fase é a coluna `fase` que o notebook grava; vazia, cai no `faseDe` de
--  lib/analise/esteira.ts, copiado aqui linha por linha.
--
--  O QUE ELA NÃO FAZ, de propósito:
--    · não tira da Subscrição nem da Emissão: passou de Crédito, é manual;
--    · não mexe em `status` de tomador nem de operação;
--    · não conclui seção nenhuma de `card_secoes` (concluir é gesto de gente);
--    · só age na TRANSIÇÃO (a área calculada mudou, ou a fila acabou de ganhar
--      tomador). A sincronização regrava `situacao` a cada rodada; sem isso,
--      quem movesse o card à mão seria desfeito um minuto depois;
--    · falhar aqui NUNCA derruba a gravação da fila: o erro vira aviso.
--
--  Todo movimento fica em `card_eventos` (a linha do tempo do card) e em
--  `fam_historico` (o gatilho de tomadores já registra o valor anterior).
--
--  ROLLBACK:
--    drop trigger if exists trg_fila_move_etapa on public.analise_fila;
--    drop function if exists public.fam_fila_move_etapa();
--    drop function if exists public.fam_area_da_fila(text, text, text);
--    -- e, para devolver a central de cada tomador movido pela carga:
--    update public.tomadores t set central_area = h.valor_antes
--      from public.fam_historico h
--     where h.tabela = 'tomadores' and h.registro_id = t.id and h.campo = 'central_area'
--       and h.criado_em >= '<momento da aplicação>'
--       and exists (select 1 from public.card_eventos e where e.tomador_id = t.id
--                   and e.autor_nome = 'Esteira da análise' and e.criado_em >= '<momento>');
-- ============================================================================

/* A área em que a fila coloca o card. Nula quando não dá para dizer. */
create or replace function public.fam_area_da_fila(p_fase text, p_situacao text, p_cadastro text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_fase text := nullif(p_fase, '');
begin
  if v_fase is null then
    -- faseDe(), lib/analise/esteira.ts
    if p_situacao = 'concluida' then v_fase := 'pronta';
    elsif p_situacao = 'em_andamento' then v_fase := 'analisando';
    elsif p_cadastro = 'pendente' then v_fase := 'entrada';
    elsif p_cadastro is null and p_situacao = 'pendente' then v_fase := 'entrada';
    elsif p_situacao in ('aguardando_resposta','bloqueada_documentos','aguardando_documentos','erro','pausada')
       or p_cadastro in ('bloqueado','em_conferencia') then v_fase := 'conferencia';
    else v_fase := 'liberado';
    end if;
  end if;

  if v_fase in ('entrada','conferencia') then return 'cadastro'; end if;
  if v_fase in ('liberado','analisando','pronta') then return 'credito'; end if;
  return null;
end;
$$;

create or replace function public.fam_fila_move_etapa()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_alvo    text;
  v_antes   text;
  v_central text;
begin
  if NEW.tomador_id is null then return NEW; end if;

  -- Tudo dentro do bloco protegido: nada aqui pode abortar a gravação da fila.
  begin
    v_alvo := public.fam_area_da_fila(NEW.fase, NEW.situacao, NEW.cadastro->>'status');
    if v_alvo is null then return NEW; end if;

    -- Só na transição: a área calculada mudou, ou a fila ganhou o tomador agora.
    if TG_OP = 'UPDATE' then
      v_antes := public.fam_area_da_fila(OLD.fase, OLD.situacao, OLD.cadastro->>'status');
      if v_antes is not distinct from v_alvo and OLD.tomador_id is not distinct from NEW.tomador_id then
        return NEW;
      end if;
    end if;

    /* SÓ A PASTA QUE FALA PELO CARD MOVE O CARD: a mais recente, viva antes de
       arquivada (a mesma escolha da carga abaixo e da tela do tomador). Uma
       pasta antiga que ainda recebe sincronização não puxa o card para trás. */
    if exists (
      select 1 from public.analise_fila o
       where o.tomador_id = NEW.tomador_id and o.id <> NEW.id
         and ((NEW.arquivada and not o.arquivada)
           or (o.arquivada = NEW.arquivada and o.atualizado_em > NEW.atualizado_em))
    ) then
      return NEW;
    end if;

    select central_area into v_central from public.tomadores where id = NEW.tomador_id;
    if not found then return NEW; end if;

    -- Passou de Crédito, é manual: a esteira não puxa de volta.
    if v_central is not null and v_central not in ('comercial','cadastro','credito') then
      return NEW;
    end if;
    if v_central is not distinct from v_alvo then return NEW; end if;

    update public.tomadores set central_area = v_alvo where id = NEW.tomador_id;
    insert into public.card_eventos (tomador_id, tipo, area, texto, autor_nome)
    values (
      NEW.tomador_id, 'evento', v_alvo,
      format('A esteira da análise moveu o card de %s para %s (pasta "%s", fase %s). O status das operações não mudou.',
        case coalesce(v_central, 'comercial') when 'comercial' then 'Comercial' when 'cadastro' then 'Cadastro e triagem' else 'Crédito' end,
        case v_alvo when 'cadastro' then 'Cadastro e triagem' else 'Crédito' end,
        NEW.pasta, coalesce(nullif(NEW.fase, ''), NEW.situacao)),
      'Esteira da análise'
    );
  exception when others then
    raise warning 'fam_fila_move_etapa: %', sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_fila_move_etapa on public.analise_fila;
create trigger trg_fila_move_etapa
  after insert or update of fase, situacao, cadastro, tomador_id, arquivada on public.analise_fila
  for each row execute function public.fam_fila_move_etapa();

/* A CARGA: os cards que já estão na esteira passam a dizer onde estão. Vale a
   pasta mais recente de cada tomador (viva antes de arquivada), e as mesmas
   travas do gatilho: só Comercial / Cadastro / Crédito / vazio se movem. */
with ultima as (
  select distinct on (f.tomador_id)
         f.tomador_id, f.pasta, coalesce(nullif(f.fase, ''), f.situacao) as fase,
         public.fam_area_da_fila(f.fase, f.situacao, f.cadastro->>'status') as alvo
    from public.analise_fila f
   where f.tomador_id is not null
   order by f.tomador_id, f.arquivada asc, f.atualizado_em desc
), mover as (
  select u.*, t.central_area as de
    from ultima u join public.tomadores t on t.id = u.tomador_id
   where u.alvo is not null
     and (t.central_area is null or t.central_area in ('comercial','cadastro','credito'))
     and t.central_area is distinct from u.alvo
), ev as (
  insert into public.card_eventos (tomador_id, tipo, area, texto, autor_nome)
  select m.tomador_id, 'evento', m.alvo,
         format('A esteira da análise moveu o card de %s para %s (pasta "%s", fase %s), na carga de 28/09/2026. O status das operações não mudou.',
           case coalesce(m.de, 'comercial') when 'comercial' then 'Comercial' when 'cadastro' then 'Cadastro e triagem' else 'Crédito' end,
           case m.alvo when 'cadastro' then 'Cadastro e triagem' else 'Crédito' end,
           m.pasta, m.fase),
         'Esteira da análise'
    from mover m
  returning tomador_id
)
update public.tomadores t set central_area = m.alvo
  from mover m
 where t.id = m.tomador_id;

-- ============================================================================
--  SÓ REMETENTE INTERNO CONTA COMO PEDIDO DE ANÁLISE  (10/09/2026)
--
--  Ordem do Marco: "eu recebo os e-mails internos, então as análises só são
--  feitas quando o e-mail vem de dentro da FAM (@famseguradora.com.br).
--  E-mail de corretora direto na caixa não abre sozinho."
--
--  O QUE MUDA: um campo a mais na régua (`so_remetente_interno`, ligado de
--  fábrica), do mesmo jeito que `so_com_anexo` e `so_nao_lidos` já existem.
--  Quando ligado, `avaliarEmail` (lib/email/regras.ts) só marca `serve = true`
--  se o remetente tiver o domínio da FAM. O que a régua recusa não some: fica
--  em "Todos os e-mails", só o dono da caixa vê, e o clique em "Trazer para a
--  esteira" continua funcionando à mão — isto só tira o automático.
--
--  ADITIVO: não apaga nada, não muda o comportamento de quem já tem
--  `remetentes` preenchido (aquele campo continua sendo uma restrição extra,
--  por cima desta).
-- ============================================================================

alter table public.email_regras
  add column if not exists so_remetente_interno boolean not null default true;

alter table public.email_contas
  add column if not exists so_remetente_interno boolean not null default true;

comment on column public.email_contas.so_remetente_interno is
  'Ligado de fábrica: só e-mail de @famseguradora.com.br vira pedido de análise sozinho. E-mail de corretora direto na caixa fica em "Todos", só o dono vê, e ele decide trazer à mão.';

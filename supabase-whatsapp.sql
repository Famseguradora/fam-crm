-- ════════════════════════════════════════════════════════════════════════
-- Integração WhatsApp (Cloud API / Meta) — FAM CRM
-- Rode no Supabase SQL Editor após o schema base (supabase-schema.sql).
-- ════════════════════════════════════════════════════════════════════════

-- 1) Índice para o lookup do webhook por telefone do diretor.
--    (A coluna usuarios.telefone já existe — TEXT, mascarado sem DDI.)
CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON public.usuarios (telefone);

-- 2) Tabela `comite_votos`, flag usuarios.comite, colunas do Julgamento em
--    operacoes, RLS e Realtime: NÃO ficam mais aqui.
--    Foram movidos para a migração `comite_julgamento_e_votos`
--    (aplicada via Supabase migrations) com o schema CORRETO — em especial
--    voto IN ('aprovado','aprovado_ressalva','reprovado') e os campos
--    autor/cargo/segue_subscritor/argumentacao/updated_at.
--    O bloco antigo aqui (voto IN ('aprovar','reprovar')) foi removido por
--    estar desatualizado. Consulte a migração para a fonte de verdade.

-- 3) Histórico de votos retratados do Comitê (migração `comite_votos_historico`,
--    aplicada via Supabase migrations). Cada vez que um diretor retrata/altera
--    seu voto, o voto vigente é arquivado aqui antes de ser sobrescrito —
--    preservando a trilha de auditoria. Documentado aqui para referência:
--
--    CREATE TABLE public.comite_votos_historico (
--      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--      operacao_id      uuid NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
--      usuario_id       uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
--      autor            text NOT NULL,
--      cargo            text,
--      voto             text NOT NULL CHECK (voto IN ('aprovado','aprovado_ressalva','reprovado')),
--      segue_subscritor boolean NOT NULL DEFAULT false,
--      argumentacao     text,
--      canal            text NOT NULL DEFAULT 'crm' CHECK (canal IN ('crm','whatsapp')),
--      votado_em        timestamptz,                 -- created_at original do voto retratado
--      retratado_em     timestamptz NOT NULL DEFAULT now()
--    );
--    CREATE INDEX idx_cvh_operacao ON public.comite_votos_historico (operacao_id);
--    ALTER TABLE public.comite_votos_historico ENABLE ROW LEVEL SECURITY;
--    -- Policies: authenticated lê (SELECT) e escreve (ALL), espelhando comite_votos.

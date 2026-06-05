-- ════════════════════════════════════════════════════════════════════════
-- Integração WhatsApp (Cloud API / Meta) — FAM CRM
-- Rode no Supabase SQL Editor após o schema base (supabase-schema.sql).
-- ════════════════════════════════════════════════════════════════════════

-- 1) Índice para o lookup do webhook por telefone do diretor.
--    (A coluna usuarios.telefone já existe — TEXT, mascarado sem DDI.)
CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON public.usuarios (telefone);

-- 2) Tabela FUTURA de votos do Comitê (estrutura apenas — ainda NÃO utilizada).
--    Preparada para a votação remota dos diretores via WhatsApp.
--    Acesso será feito exclusivamente pelo service-role (webhook).
CREATE TABLE IF NOT EXISTS public.comite_votos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id UUID NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  voto        TEXT NOT NULL CHECK (voto IN ('aprovar', 'reprovar')),
  canal       TEXT NOT NULL DEFAULT 'whatsapp',
  observacao  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Um voto por diretor por operação; re-voto deve ser feito via UPDATE.
  UNIQUE (operacao_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_comite_votos_operacao ON public.comite_votos (operacao_id);
CREATE INDEX IF NOT EXISTS idx_comite_votos_usuario  ON public.comite_votos (usuario_id);

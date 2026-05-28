-- ============================================================
--  FAM SEGURADORA — CRM
--  Schema completo para Supabase (PostgreSQL)
--  Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- ── Extensões ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Função auxiliar: atualiza updated_at automaticamente ─────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABELA 1: USUARIOS
-- Espelho da tabela auth.users com dados extras da empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  telefone        TEXT,
  cargo           TEXT,
  perfil          TEXT NOT NULL DEFAULT 'usuario'
                  CHECK (perfil IN ('admin', 'usuario')),
  status          TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'inativo')),
  primeiro_acesso BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER usuarios_updated_at
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELA 2: PRODUTOS
-- Produtos de seguro disponíveis na FAM
-- ============================================================
CREATE TABLE IF NOT EXISTS public.produtos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  descricao   TEXT,
  status      TEXT NOT NULL DEFAULT 'ativo'
              CHECK (status IN ('ativo', 'inativo')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER produtos_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELA 3: CORRETORAS
-- Empresas corretoras parceiras da FAM
-- ============================================================
CREATE TABLE IF NOT EXISTS public.corretoras (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social  TEXT NOT NULL,
  cnpj          TEXT NOT NULL UNIQUE,
  telefone      TEXT,
  email         TEXT,
  cidade        TEXT,
  estado        CHAR(2),
  status        TEXT NOT NULL DEFAULT 'ativo'
                CHECK (status IN ('ativo', 'inativo')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER corretoras_updated_at
  BEFORE UPDATE ON public.corretoras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELA 4: TOMADORES
-- Empresas tomadoras de seguro garantia
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tomadores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social    TEXT NOT NULL,
  cnpj            TEXT NOT NULL UNIQUE,
  corretora_id    UUID REFERENCES public.corretoras(id) ON DELETE SET NULL,
  cidade          TEXT,
  estado          CHAR(2),
  limite_aprovado NUMERIC(18,2),
  status          TEXT NOT NULL DEFAULT 'Aguardando Análise',
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tomadores_corretora ON public.tomadores(corretora_id);
CREATE INDEX IF NOT EXISTS idx_tomadores_status ON public.tomadores(status);

CREATE TRIGGER tomadores_updated_at
  BEFORE UPDATE ON public.tomadores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELA 5: OPERACOES
-- Operações / Subscrições de seguro garantia
-- premio_previsto = lmg × taxa × vigencia_anos (calculado automaticamente)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.operacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tomador_id       UUID REFERENCES public.tomadores(id) ON DELETE SET NULL,
  corretora_id     UUID REFERENCES public.corretoras(id) ON DELETE SET NULL,
  corretor         TEXT,
  produto_id       UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  modalidade       TEXT NOT NULL,
  estado           CHAR(2),
  temperatura      TEXT CHECK (temperatura IN ('Quente', 'Morno', 'Frio')),
  lmg              NUMERIC(18,2) NOT NULL DEFAULT 0,
  taxa             NUMERIC(8,6)  NOT NULL DEFAULT 0,
  vigencia_anos    NUMERIC(5,2)  NOT NULL DEFAULT 1,
  premio_previsto  NUMERIC(18,2) GENERATED ALWAYS AS
                   (ROUND(lmg * taxa * vigencia_anos, 2)) STORED,
  status           TEXT NOT NULL DEFAULT 'Em Análise',
  data_entrada     DATE,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacoes_tomador    ON public.operacoes(tomador_id);
CREATE INDEX IF NOT EXISTS idx_operacoes_corretora  ON public.operacoes(corretora_id);
CREATE INDEX IF NOT EXISTS idx_operacoes_status     ON public.operacoes(status);
CREATE INDEX IF NOT EXISTS idx_operacoes_temperatura ON public.operacoes(temperatura);

CREATE TRIGGER operacoes_updated_at
  BEFORE UPDATE ON public.operacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELA 6: DASHBOARD_CONFIG
-- Configuração personalizada do dashboard por usuário
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dashboard_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID REFERENCES public.usuarios(id) ON DELETE CASCADE,
  grafico_key TEXT NOT NULL,
  habilitado  BOOLEAN NOT NULL DEFAULT TRUE,
  posicao     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, grafico_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_config_usuario ON public.dashboard_config(usuario_id);

CREATE TRIGGER dashboard_config_updated_at
  BEFORE UPDATE ON public.dashboard_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Garante que apenas usuários autenticados acessem os dados
-- ============================================================
ALTER TABLE public.usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretoras       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tomadores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_config ENABLE ROW LEVEL SECURITY;

-- Políticas: qualquer usuário autenticado pode ler e escrever
-- (controle mais fino de permissões virá em etapas futuras)

CREATE POLICY "Autenticados — leitura" ON public.usuarios
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Autenticados — escrita" ON public.usuarios
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Autenticados — leitura" ON public.produtos
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Autenticados — escrita" ON public.produtos
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Autenticados — leitura" ON public.corretoras
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Autenticados — escrita" ON public.corretoras
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Autenticados — leitura" ON public.tomadores
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Autenticados — escrita" ON public.tomadores
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Autenticados — leitura" ON public.operacoes
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Autenticados — escrita" ON public.operacoes
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Autenticados — leitura" ON public.dashboard_config
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Autenticados — escrita" ON public.dashboard_config
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- DADOS INICIAIS: Gráficos do Dashboard (configuração padrão)
-- (Inseridos por usuário no primeiro login via código da aplicação)
-- ============================================================

-- Nomes dos gráficos disponíveis no dashboard:
-- 'top_corretoras_limite'   → Top Corretoras por Limite Aprovado
-- 'distribuicao_status_tom' → Distribuição por Status (Tomadores)
-- 'top_corretores_premio'   → Top Corretores por Prêmio Previsto
-- 'status_operacoes'        → Status das Operações
-- 'premio_modalidade'       → Prêmio Previsto por Modalidade

-- ── Tabela: anexos ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anexos (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entidade_tipo  TEXT        NOT NULL CHECK (entidade_tipo IN ('tomador', 'operacao', 'corretora')),
  entidade_id    UUID        NOT NULL,
  tomador_id     UUID        REFERENCES public.tomadores(id) ON DELETE SET NULL,
  nome_original  TEXT        NOT NULL,
  storage_path   TEXT        NOT NULL,
  tipo_mime      TEXT,
  tamanho_bytes  NUMERIC,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler anexos"
  ON public.anexos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem inserir anexos"
  ON public.anexos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados podem deletar anexos"
  ON public.anexos FOR DELETE TO authenticated USING (true);

-- Storage bucket: fam-anexos (privado, 5 MB por arquivo)
-- Criar manualmente no Supabase Dashboard → Storage → New Bucket
-- Nome: fam-anexos | Public: false | File size limit: 5242880

-- ============================================================
--  FIM DO SCHEMA — FAM SEGURADORA CRM v1.0
-- ============================================================

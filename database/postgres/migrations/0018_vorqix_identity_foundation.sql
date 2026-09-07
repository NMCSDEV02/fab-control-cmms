BEGIN;

-- Tipos de conta do cliente. COMANDO_INTERNO e reservado a operacao interna
-- auditada e nunca substitui as duas contas comerciais do produto.
ALTER TABLE iam.users
  ADD COLUMN account_type text;

UPDATE iam.users AS user_account
SET account_type = CASE
  WHEN EXISTS (
    SELECT 1
    FROM iam.user_roles user_role
    JOIN iam.roles role
      ON role.tenant_id = user_role.tenant_id
     AND role.id = user_role.role_id
    WHERE user_role.tenant_id = user_account.tenant_id
      AND user_role.user_id = user_account.id
      AND role.role_type = 'ADMIN'
  ) THEN 'COMANDO_INTERNO'
  WHEN EXISTS (
    SELECT 1
    FROM iam.user_roles user_role
    JOIN iam.roles role
      ON role.tenant_id = user_role.tenant_id
     AND role.id = user_role.role_id
    WHERE user_role.tenant_id = user_account.tenant_id
      AND user_role.user_id = user_account.id
      AND role.role_type = 'OPERATOR'
  ) THEN 'OPERADOR'
  ELSE 'TECNICO_MANUTENCAO'
END
WHERE account_type IS NULL;

ALTER TABLE iam.users
  ALTER COLUMN account_type SET NOT NULL,
  ALTER COLUMN account_type SET DEFAULT 'OPERADOR',
  ADD CONSTRAINT users_account_type_check
    CHECK (account_type IN ('OPERADOR', 'TECNICO_MANUTENCAO', 'COMANDO_INTERNO'));

CREATE INDEX users_account_type_idx
  ON iam.users (tenant_id, account_type)
  WHERE deleted_at IS NULL;

CREATE TABLE iam.technical_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  protected boolean NOT NULL DEFAULT false,
  requires_technical_account boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT technical_personas_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'RETIRED'))
);

CREATE TABLE iam.user_technical_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  persona_id uuid NOT NULL REFERENCES iam.technical_personas(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE',
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz,
  assigned_by uuid,
  justification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT user_technical_personas_scope_key UNIQUE (tenant_id, user_id, persona_id),
  CONSTRAINT user_technical_personas_user_fk
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES iam.users(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT user_technical_personas_assigned_by_fk
    FOREIGN KEY (tenant_id, assigned_by)
    REFERENCES iam.users(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT user_technical_personas_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'EXPIRED')),
  CONSTRAINT user_technical_personas_period_check
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT user_technical_personas_justification_check
    CHECK (length(btrim(justification)) BETWEEN 3 AND 1000)
);

CREATE INDEX user_technical_personas_active_idx
  ON iam.user_technical_personas (tenant_id, user_id, valid_until)
  WHERE status = 'ACTIVE';

CREATE TABLE iam.user_operational_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  scope_type text NOT NULL,
  scope_id uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz,
  assigned_by uuid,
  justification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT user_operational_scopes_scope_key UNIQUE (tenant_id, user_id, scope_type, scope_id),
  CONSTRAINT user_operational_scopes_user_fk
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES iam.users(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT user_operational_scopes_assigned_by_fk
    FOREIGN KEY (tenant_id, assigned_by)
    REFERENCES iam.users(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT user_operational_scopes_type_check
    CHECK (scope_type IN ('UNIDADE', 'SETOR', 'LINHA', 'ATIVO', 'COMPONENTE')),
  CONSTRAINT user_operational_scopes_period_check
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT user_operational_scopes_justification_check
    CHECK (length(btrim(justification)) BETWEEN 3 AND 1000)
);

CREATE INDEX user_operational_scopes_active_idx
  ON iam.user_operational_scopes (tenant_id, user_id, scope_type, scope_id, valid_until);

INSERT INTO iam.technical_personas (
  code, name, description, protected, requires_technical_account
) VALUES
  ('PCM', 'PCM', 'Autoridade operacional de planejamento e controle da manutencao.', true, true),
  ('MECANICA', 'Mecanica', 'Execucao tecnica de manutencao mecanica.', false, true),
  ('ELETRICA', 'Eletrica', 'Execucao tecnica de manutencao eletrica.', false, true),
  ('AUTOMACAO', 'Automacao', 'Execucao tecnica de automacao industrial.', false, true),
  ('INSTRUMENTACAO', 'Instrumentacao', 'Execucao tecnica de instrumentacao.', false, true),
  ('UTILIDADES', 'Utilidades', 'Execucao tecnica de utilidades industriais.', false, true),
  ('QUALIDADE', 'Qualidade', 'Participacao documental e parecer sob demanda.', false, true),
  ('SEGURANCA', 'Seguranca', 'Participacao documental e parecer sob demanda.', false, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  protected = EXCLUDED.protected,
  requires_technical_account = EXCLUDED.requires_technical_account,
  status = 'ACTIVE',
  updated_at = clock_timestamp();

-- O backfill preserva acesso ja existente: gestores recebem PCM, enquanto
-- atribuicoes tecnicas existentes passam a refletir a area como persona.
INSERT INTO iam.user_technical_personas (
  tenant_id, user_id, persona_id, assigned_by, justification
)
SELECT
  user_account.tenant_id,
  user_account.id,
  persona.id,
  NULL,
  'Migracao aditiva da identidade operacional VORQIX.'
FROM iam.users user_account
JOIN iam.user_roles user_role
  ON user_role.tenant_id = user_account.tenant_id
 AND user_role.user_id = user_account.id
JOIN iam.roles role
  ON role.tenant_id = user_role.tenant_id
 AND role.id = user_role.role_id
JOIN iam.technical_personas persona
  ON persona.code = 'PCM'
WHERE user_account.account_type = 'TECNICO_MANUTENCAO'
  AND role.role_type = 'MANAGER'
ON CONFLICT (tenant_id, user_id, persona_id) DO NOTHING;

INSERT INTO iam.user_technical_personas (
  tenant_id, user_id, persona_id, assigned_by, justification
)
SELECT DISTINCT
  assignment.tenant_id,
  assignment.user_id,
  persona.id,
  assignment.assigned_by,
  'Migracao da atribuicao tecnica existente para persona VORQIX.'
FROM iam.user_technical_assignments assignment
JOIN iam.technical_areas area
  ON area.tenant_id = assignment.tenant_id
 AND area.id = assignment.technical_area_id
JOIN iam.technical_personas persona
  ON persona.code = CASE upper(area.code)
    WHEN 'QUALITY' THEN 'QUALIDADE'
    WHEN 'QUALIDADE' THEN 'QUALIDADE'
    WHEN 'SAFETY' THEN 'SEGURANCA'
    WHEN 'SEGURANCA' THEN 'SEGURANCA'
    WHEN 'MAINTENANCE' THEN 'MECANICA'
    WHEN 'MECANICA' THEN 'MECANICA'
    WHEN 'ELETRICA' THEN 'ELETRICA'
    WHEN 'ELECTRICAL' THEN 'ELETRICA'
    WHEN 'AUTOMACAO' THEN 'AUTOMACAO'
    WHEN 'AUTOMATION' THEN 'AUTOMACAO'
    WHEN 'INSTRUMENTACAO' THEN 'INSTRUMENTACAO'
    WHEN 'INSTRUMENTATION' THEN 'INSTRUMENTACAO'
    WHEN 'UTILIDADES' THEN 'UTILIDADES'
    WHEN 'UTILITIES' THEN 'UTILIDADES'
    ELSE 'MECANICA'
  END
WHERE assignment.status = 'ACTIVE'
ON CONFLICT (tenant_id, user_id, persona_id) DO NOTHING;

CREATE TRIGGER technical_personas_touch_updated_at
BEFORE UPDATE ON iam.technical_personas
FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TRIGGER user_technical_personas_touch_updated_at
BEFORE UPDATE ON iam.user_technical_personas
FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TRIGGER user_operational_scopes_touch_updated_at
BEFORE UPDATE ON iam.user_operational_scopes
FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

ALTER TABLE iam.user_technical_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_technical_personas FORCE ROW LEVEL SECURITY;
CREATE POLICY user_technical_personas_tenant_isolation
  ON iam.user_technical_personas
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE iam.user_operational_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_operational_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY user_operational_scopes_tenant_isolation
  ON iam.user_operational_scopes
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON iam.technical_personas TO fab_control_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.user_technical_personas TO fab_control_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.user_operational_scopes TO fab_control_runtime;

COMMIT;

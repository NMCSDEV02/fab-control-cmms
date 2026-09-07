BEGIN;

ALTER TABLE maintenance.checklist_template_versions
  DROP CONSTRAINT IF EXISTS checklist_template_versions_signature_policy_check;

ALTER TABLE maintenance.checklist_template_versions
  ADD CONSTRAINT checklist_template_versions_signature_policy_check
  CHECK (
    signature_policy IN (
      'NONE',
      'QUALIDADE_OU_SEGURANCA',
      'QUALIDADE',
      'SEGURANCA',
      'QUALIDADE_E_SEGURANCA',
      'PERSONALIZADA'
    )
  );

ALTER TABLE workflow.technical_demands
  DROP CONSTRAINT IF EXISTS technical_demands_signature_policy_check;

ALTER TABLE workflow.technical_demands
  ADD CONSTRAINT technical_demands_signature_policy_check
  CHECK (
    signature_policy IN (
      'NONE',
      'QUALIDADE_OU_SEGURANCA',
      'QUALIDADE',
      'SEGURANCA',
      'QUALIDADE_E_SEGURANCA',
      'PERSONALIZADA'
    )
  );

COMMIT;

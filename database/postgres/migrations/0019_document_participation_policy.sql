BEGIN;

-- Qualidade e Seguranca continuam aptas a assinar documentos quando forem
-- convidadas, mas sua area nao transforma toda manutencao em validacao obrigatoria.
UPDATE iam.technical_areas
SET
  default_signature_required = false,
  validation_area = false,
  updated_at = clock_timestamp()
WHERE upper(code) IN ('QUALITY', 'QUALIDADE', 'SAFETY', 'SEGURANCA', 'SEGURANÇA');

COMMIT;

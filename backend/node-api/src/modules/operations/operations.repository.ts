import type { PoolClient, QueryResultRow } from 'pg';

import type {
  CompletionInput,
  EvidenceInput,
  ExecutionResponseInput,
  RequestAuditMetadata,
  ReviewSubmissionInput,
  WorkOrderInput,
  WorkOrderCorrectionInput,
  WorkOrderListQuery,
} from './operations.types.js';

export interface OperationsRow extends QueryResultRow {
  [column: string]: unknown;
  id: string;
}

function required<T extends QueryResultRow>(rows: readonly T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

export class OperationsRepository {
  async findPublishedPlanContext(
    client: PoolClient,
    versionId: string,
  ): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `
        SELECT version.id, version.status, version.maintenance_stop_mode,
               version.technical_analysis, version.checklist_template_version_id,
               version.estimated_duration_minutes, plan.asset_id, plan.component_id,
               plan.plan_type, plan.lifecycle_status, asset.lifecycle_status AS asset_status,
               checklist.status AS checklist_status,
               (SELECT count(*)::integer FROM maintenance.checklist_items item
                WHERE item.checklist_template_version_id = checklist.id AND item.status = 'ACTIVE') AS total_items
        FROM maintenance.maintenance_plan_versions version
        JOIN maintenance.maintenance_plans plan ON plan.id = version.maintenance_plan_id
        JOIN cmms.assets asset ON asset.id = plan.asset_id
        JOIN maintenance.checklist_template_versions checklist
          ON checklist.id = version.checklist_template_version_id
        WHERE version.id = $1 AND plan.deleted_at IS NULL AND asset.deleted_at IS NULL
      `,
      [versionId],
    );
    return result.rows[0] ?? null;
  }

  async activeUserExists(client: PoolClient, userId: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM iam.users WHERE id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL) AS exists`,
      [userId],
    );
    return result.rows[0]?.exists ?? false;
  }

  async createWorkOrder(
    client: PoolClient,
    tenantId: string,
    id: string,
    code: string,
    userId: string,
    input: WorkOrderInput,
    context: OperationsRow,
    contentHash: string,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO maintenance.work_orders (
          id, tenant_id, code, asset_id, component_id, maintenance_plan_version_id,
          origin_type, origin_entity_id, work_type, title, description, priority,
          requester_id, responsible_id, maintenance_stop_mode, technical_analysis,
          scheduled_for, content_hash_sha256
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16::jsonb, $17, $18
        )
      `,
      [
        id,
        tenantId,
        code,
        context.asset_id,
        context.component_id,
        input.planVersionId,
        input.originType,
        input.originEntityId,
        input.workType,
        input.title,
        input.description,
        input.priority,
        userId,
        input.responsibleId,
        context.maintenance_stop_mode,
        JSON.stringify(input.technicalAnalysis),
        input.scheduledFor,
        contentHash,
      ],
    );
  }

  async correctWorkOrder(
    client: PoolClient,
    workOrderId: string,
    input: WorkOrderCorrectionInput,
    contentHash: string,
  ): Promise<void> {
    await client.query(
      `UPDATE maintenance.work_orders
       SET title = $2, description = $3, priority = $4, responsible_id = $5,
           scheduled_for = $6, technical_analysis = $7::jsonb,
           content_hash_sha256 = $8, technical_demand_id = NULL,
           status = 'DRAFT', submitted_at = NULL, updated_at = clock_timestamp()
       WHERE id = $1`,
      [
        workOrderId,
        input.title,
        input.description,
        input.priority,
        input.responsibleId,
        input.scheduledFor,
        JSON.stringify(input.technicalAnalysis),
        contentHash,
      ],
    );
  }

  async listWorkOrders(
    client: PoolClient,
    query: WorkOrderListQuery,
  ): Promise<readonly OperationsRow[]> {
    const result = await client.query<OperationsRow>(
      `
        SELECT work_order.id, work_order.code AS codigo, work_order.title AS titulo,
               work_order.priority AS prioridade, work_order.status,
               work_order.asset_id AS ativo_id, asset.tag AS ativo_tag, asset.name AS ativo_nome,
               work_order.component_id AS componente_id, work_order.scheduled_for AS programada_para,
               work_order.created_at AS criada_em, work_order.released_at AS liberada_em,
               demand.status AS validacao_status,
               demand.completed_signature_count AS assinaturas_realizadas,
               demand.required_signature_count AS assinaturas_exigidas
        FROM maintenance.work_orders work_order
        JOIN cmms.assets asset ON asset.id = work_order.asset_id
        LEFT JOIN workflow.technical_demands demand ON demand.id = work_order.technical_demand_id
        WHERE ($1 = '' OR work_order.code ILIKE '%' || $1 || '%' OR work_order.title ILIKE '%' || $1 || '%' OR asset.tag ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR work_order.status = $2)
          AND ($3::uuid IS NULL OR work_order.asset_id = $3)
        ORDER BY CASE work_order.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                 work_order.created_at DESC, work_order.id DESC
        LIMIT $4
      `,
      [query.search, query.status, query.assetId, query.limit],
    );
    return result.rows;
  }

  async findWorkOrder(client: PoolClient, id: string, lock = false): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `SELECT * FROM maintenance.work_orders WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getWorkOrderDetail(client: PoolClient, id: string): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `
        SELECT work_order.id, work_order.code AS codigo, work_order.title AS titulo,
               work_order.description AS descricao, work_order.priority AS prioridade,
               work_order.status, work_order.origin_type AS tipo_origem,
               work_order.origin_entity_id AS entidade_origem_id,
               work_order.work_type AS tipo_trabalho, work_order.asset_id AS ativo_id,
               asset.tag AS ativo_tag, asset.name AS ativo_nome,
               work_order.component_id AS componente_id, component.tag AS componente_tag,
               component.name AS componente_nome,
               work_order.maintenance_plan_version_id AS plano_versao_id,
               plan.code AS plano_codigo, plan.name AS plano_nome,
               plan_version.checklist_template_version_id AS checklist_versao_id,
               checklist_template.name AS checklist_nome,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'id', item.id, 'sequencia', item.sequence, 'titulo', item.title,
                 'instrucao', item.instruction, 'tipo_resposta', item.response_type_code,
                 'categoria', item.category, 'obrigatorio', item.required,
                 'evidencia_obrigatoria', item.evidence_required,
                 'minimo_evidencias', item.minimum_evidence_photos,
                 'bloqueia_conclusao', item.blocks_completion,
                 'parametro_id', item.parameter_definition_id,
                 'valor_esperado', item.expected_value, 'minimo', item.minimum_value,
                 'maximo', item.maximum_value, 'unidade', item.unit,
                 'opcoes', item.options
               ) ORDER BY item.sequence)
               FROM maintenance.checklist_items item
               WHERE item.checklist_template_version_id = plan_version.checklist_template_version_id
                 AND item.status = 'ACTIVE'), '[]'::jsonb) AS checklist_itens,
               work_order.maintenance_stop_mode AS modo_parada,
               work_order.technical_analysis AS analise_tecnica,
               work_order.scheduled_for AS programada_para,
               work_order.submitted_at AS enviada_validacao_em,
               work_order.released_at AS liberada_em,
               work_order.created_at AS criada_em, work_order.updated_at AS atualizada_em,
               CASE WHEN demand.id IS NULL THEN NULL ELSE jsonb_build_object(
                 'id', demand.id, 'status', demand.status,
                 'politica_assinatura', demand.signature_policy,
                 'assinaturas_exigidas', demand.required_signature_count,
                 'assinaturas_realizadas', demand.completed_signature_count,
                 'requisitos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'id', requirement.id, 'codigo', requirement.requirement_code,
                   'status', requirement.status, 'quantidade_exigida', requirement.required_count,
                   'quantidade_realizada', requirement.fulfilled_count,
                   'area_id', requirement.technical_area_id
                 ) ORDER BY requirement.requirement_code)
                 FROM workflow.demand_validator_requirements requirement
                 WHERE requirement.technical_demand_id = demand.id), '[]'::jsonb),
                 'assinaturas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'id', signature.id, 'usuario_id', signature.user_id,
                   'usuario', signer.name, 'area_id', signature.technical_area_id,
                   'significado', signature.meaning, 'assinada_em', signature.signed_at,
                   'hash', signature.signature_hash_sha256
                 ) ORDER BY signature.signed_at)
                 FROM workflow.technical_signatures signature
                 JOIN iam.users signer ON signer.id = signature.user_id
                 WHERE signature.technical_demand_id = demand.id
                   AND NOT EXISTS (SELECT 1 FROM workflow.technical_signature_revocations revocation
                                   WHERE revocation.technical_signature_id = signature.id)), '[]'::jsonb)
               ) END AS validacao,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'id', action.id, 'status', action.status, 'responsavel_id', action.responsible_id,
                 'gerada_em', action.generated_at, 'iniciada_em', action.started_at,
                 'concluida_em', action.completed_at
               ) ORDER BY action.generated_at) FROM maintenance.work_order_actions action
               WHERE action.work_order_id = work_order.id), '[]'::jsonb) AS acoes
        FROM maintenance.work_orders work_order
        JOIN cmms.assets asset ON asset.id = work_order.asset_id
        LEFT JOIN cmms.components component ON component.id = work_order.component_id
        JOIN maintenance.maintenance_plan_versions plan_version ON plan_version.id = work_order.maintenance_plan_version_id
        JOIN maintenance.maintenance_plans plan ON plan.id = plan_version.maintenance_plan_id
        JOIN maintenance.checklist_template_versions checklist_version ON checklist_version.id = plan_version.checklist_template_version_id
        JOIN maintenance.checklist_templates checklist_template ON checklist_template.id = checklist_version.checklist_template_id
        LEFT JOIN workflow.technical_demands demand ON demand.id = work_order.technical_demand_id
        WHERE work_order.id = $1
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findTechnicalAreas(client: PoolClient): Promise<readonly OperationsRow[]> {
    const result = await client.query<OperationsRow>(
      `SELECT id, code FROM iam.technical_areas WHERE code IN ('QUALITY', 'SAFETY') AND status = 'ACTIVE'`,
    );
    return result.rows;
  }

  async createDemand(
    client: PoolClient,
    tenantId: string,
    demandId: string,
    workOrder: OperationsRow,
    userId: string,
    roleSnapshot: string,
    input: ReviewSubmissionInput,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO workflow.technical_demands (
          id, tenant_id, demand_type, entity_type, entity_id, origin_type, origin_id,
          title, description, priority, status, created_by, creator_role_snapshot,
          signature_required, required_signature_count, segregation_required,
          signature_policy, first_response_due_at, resolution_due_at, payload_hash_sha256
        ) VALUES (
          $1, $2, 'WORK_ORDER_VALIDATION', 'WORK_ORDER', $3, $4, $5,
          $6, $7, $8, 'AWAITING_SIGNATURE', $9, $10,
          true, $11, true, $12, $13, $14, $15
        )
      `,
      [
        demandId,
        tenantId,
        workOrder.id,
        workOrder.origin_type,
        workOrder.origin_entity_id,
        workOrder.title,
        workOrder.description,
        workOrder.priority,
        userId,
        roleSnapshot,
        input.requiredSignatures,
        input.signaturePolicy,
        input.firstResponseDueAt,
        input.resolutionDueAt,
        workOrder.content_hash_sha256,
      ],
    );
  }

  async createRequirement(
    client: PoolClient,
    tenantId: string,
    demandId: string,
    code: string,
    areaId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO workflow.demand_validator_requirements
       (tenant_id, technical_demand_id, requirement_code, technical_area_id)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, demandId, code, areaId],
    );
  }

  async attachDemand(client: PoolClient, workOrderId: string, demandId: string): Promise<void> {
    await client.query(
      `UPDATE maintenance.work_orders
       SET technical_demand_id = $2, status = 'IN_TECHNICAL_REVIEW', submitted_at = clock_timestamp()
       WHERE id = $1`,
      [workOrderId, demandId],
    );
  }

  async findDemand(client: PoolClient, id: string, lock = false): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `SELECT * FROM workflow.technical_demands WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async validatorContext(client: PoolClient, userId: string): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `
        SELECT assignment.id, assignment.technical_area_id, assignment.technical_role_id,
               area.code AS area_code, role.code AS role_code,
               COALESCE(assignment.can_sign_override, role.can_sign, area.default_signature_required, false) AS can_sign
        FROM iam.user_technical_assignments assignment
        JOIN iam.technical_areas area ON area.id = assignment.technical_area_id
        LEFT JOIN iam.technical_roles role ON role.id = assignment.technical_role_id
        WHERE assignment.user_id = $1 AND assignment.status = 'ACTIVE'
          AND assignment.valid_from <= clock_timestamp()
          AND (assignment.valid_until IS NULL OR assignment.valid_until > clock_timestamp())
        ORDER BY assignment.is_primary DESC LIMIT 1
      `,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async matchingRequirement(
    client: PoolClient,
    demandId: string,
    areaId: string,
  ): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `SELECT * FROM workflow.demand_validator_requirements
       WHERE technical_demand_id = $1 AND technical_area_id = $2
         AND status IN ('PENDING', 'PARTIALLY_FULFILLED')
       ORDER BY created_at LIMIT 1 FOR UPDATE`,
      [demandId, areaId],
    );
    return result.rows[0] ?? null;
  }

  async insertSignature(
    client: PoolClient,
    tenantId: string,
    demand: OperationsRow,
    requirementId: string | null,
    userId: string,
    roleSnapshot: string,
    areaId: string,
    technicalRoleId: string | null,
    meaning: string,
    declaration: string,
    signatureHash: string,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO workflow.technical_signatures (
          tenant_id, technical_demand_id, validator_requirement_id, entity_type,
          entity_id, entity_version, user_id, role_snapshot, technical_area_id,
          technical_role_id, meaning, declaration, payload_hash_sha256, signature_hash_sha256
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `,
      [
        tenantId,
        demand.id,
        requirementId,
        demand.entity_type,
        demand.entity_id,
        demand.entity_version,
        userId,
        roleSnapshot,
        areaId,
        technicalRoleId,
        meaning,
        declaration,
        demand.payload_hash_sha256,
        signatureHash,
      ],
    );
  }

  async demandApprovalState(client: PoolClient, demandId: string): Promise<OperationsRow> {
    const result = await client.query<OperationsRow>(
      `
        SELECT demand.id, demand.required_signature_count, demand.completed_signature_count,
               count(requirement.id) FILTER (WHERE requirement.status NOT IN ('FULFILLED','WAIVED'))::integer AS pending_requirements
        FROM workflow.technical_demands demand
        LEFT JOIN workflow.demand_validator_requirements requirement
          ON requirement.technical_demand_id = demand.id
        WHERE demand.id = $1 GROUP BY demand.id
      `,
      [demandId],
    );
    return required(result.rows, 'A demanda desapareceu durante a validaÃ§Ã£o.');
  }

  async approveDemand(client: PoolClient, demandId: string, workOrderId: string): Promise<void> {
    await client.query(
      `UPDATE workflow.technical_demands SET status = 'TECHNICALLY_APPROVED', completed_at = clock_timestamp() WHERE id = $1`,
      [demandId],
    );
    await client.query(`UPDATE maintenance.work_orders SET status = 'APPROVED' WHERE id = $1`, [
      workOrderId,
    ]);
  }

  async requestChanges(client: PoolClient, demandId: string, workOrderId: string): Promise<void> {
    await client.query(
      `UPDATE workflow.technical_demands SET status = 'CHANGES_REQUESTED' WHERE id = $1`,
      [demandId],
    );
    await client.query(
      `UPDATE maintenance.work_orders SET status = 'CHANGES_REQUESTED' WHERE id = $1`,
      [workOrderId],
    );
  }

  async appendDemandEvent(
    client: PoolClient,
    tenantId: string,
    demandId: string,
    action: string,
    userId: string,
    decision: string | null,
    reason: string | null,
    payloadHash: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO workflow.demand_events
       (tenant_id, technical_demand_id, sequence, action, from_user_id, decision, reason, payload_hash_sha256)
       SELECT $1, $2, COALESCE(max(sequence),0)+1, $3, $4, $5, $6, $7
       FROM workflow.demand_events WHERE technical_demand_id = $2`,
      [tenantId, demandId, action, userId, decision, reason, payloadHash],
    );
  }

  async releaseWorkOrder(client: PoolClient, workOrder: OperationsRow): Promise<string> {
    await client.query(
      `UPDATE maintenance.work_orders SET status = 'RELEASED', opened_at = COALESCE(opened_at, clock_timestamp()) WHERE id = $1`,
      [workOrder.id],
    );
    const result = await client.query<OperationsRow>(
      `
        INSERT INTO maintenance.work_order_actions (
          tenant_id, work_order_id, asset_id, component_id, maintenance_plan_version_id,
          origin, action_type, title, description, priority, status, responsible_id,
          maintenance_stop_mode, technical_analysis
        ) VALUES ($1,$2,$3,$4,$5,'WORK_ORDER_RELEASE',$6,$7,$8,$9,'READY',$10,$11,$12::jsonb)
        RETURNING id
      `,
      [
        workOrder.tenant_id,
        workOrder.id,
        workOrder.asset_id,
        workOrder.component_id,
        workOrder.maintenance_plan_version_id,
        workOrder.work_type,
        workOrder.title,
        workOrder.description,
        workOrder.priority,
        workOrder.responsible_id,
        workOrder.maintenance_stop_mode,
        JSON.stringify(workOrder.technical_analysis),
      ],
    );
    return required(result.rows, 'A aÃ§Ã£o liberada nÃ£o foi retornada.').id;
  }

  async listOperatorActions(
    client: PoolClient,
    userId: string,
    limit: number,
  ): Promise<readonly OperationsRow[]> {
    const result = await client.query<OperationsRow>(
      `
        SELECT action.id, action.title AS titulo, action.description AS descricao,
               action.priority AS prioridade, action.status, action.asset_id AS ativo_id,
               asset.tag AS ativo_tag, asset.name AS ativo_nome,
               action.component_id AS componente_id, action.generated_at AS liberada_em,
               work_order.id AS ordem_id, work_order.code AS ordem_codigo,
               plan_version.estimated_duration_minutes AS duracao_estimada_minutos,
               checklist_template.name AS checklist_nome,
               (SELECT count(*)::integer FROM maintenance.checklist_items item
                WHERE item.checklist_template_version_id = plan_version.checklist_template_version_id
                  AND item.status = 'ACTIVE') AS total_itens
        FROM maintenance.work_order_actions action
        JOIN maintenance.work_orders work_order ON work_order.id = action.work_order_id
        JOIN cmms.assets asset ON asset.id = action.asset_id
        JOIN maintenance.maintenance_plan_versions plan_version ON plan_version.id = action.maintenance_plan_version_id
        JOIN maintenance.checklist_template_versions checklist_version ON checklist_version.id = plan_version.checklist_template_version_id
        JOIN maintenance.checklist_templates checklist_template ON checklist_template.id = checklist_version.checklist_template_id
        WHERE action.status IN ('READY','IN_PROGRESS','BLOCKED')
          AND (action.responsible_id IS NULL OR action.responsible_id = $1)
        ORDER BY CASE action.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                 action.generated_at, action.id LIMIT $2
      `,
      [userId, limit],
    );
    return result.rows;
  }

  async findAction(client: PoolClient, id: string, lock = false): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `SELECT * FROM maintenance.work_order_actions WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async createExecution(
    client: PoolClient,
    tenantId: string,
    executionId: string,
    action: OperationsRow,
    operatorId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO maintenance.executions
       (id, tenant_id, work_order_action_id, work_order_id, asset_id, component_id, operator_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        executionId,
        tenantId,
        action.id,
        action.work_order_id,
        action.asset_id,
        action.component_id,
        operatorId,
      ],
    );
    await client.query(
      `
        INSERT INTO maintenance.execution_checklist_items (
          tenant_id, execution_id, work_order_action_id, checklist_item_id, sequence,
          title_snapshot, instruction_snapshot, response_type_code, category_snapshot,
          required, evidence_required, minimum_evidence_photos, blocks_completion,
          parameter_definition_id, parameter_policy_id, expected_value_snapshot,
          minimum_value_snapshot, maximum_value_snapshot, unit_snapshot, options_snapshot,
          validation_rule_snapshot
        )
        SELECT item.tenant_id, $1, $2, item.id, item.sequence, item.title, item.instruction,
               item.response_type_code, item.category, item.required, item.evidence_required,
               item.minimum_evidence_photos, item.blocks_completion, item.parameter_definition_id,
               policy.id, item.expected_value, COALESCE(item.minimum_value, policy.warning_min),
               COALESCE(item.maximum_value, policy.warning_max), item.unit, item.options,
               COALESCE(rule.rule, '{}'::jsonb)
        FROM maintenance.work_order_actions action
        JOIN maintenance.maintenance_plan_versions plan_version ON plan_version.id = action.maintenance_plan_version_id
        JOIN maintenance.checklist_items item ON item.checklist_template_version_id = plan_version.checklist_template_version_id
        LEFT JOIN LATERAL (
          SELECT parameter_policy.* FROM cmms.parameter_policies parameter_policy
          WHERE parameter_policy.parameter_definition_id = item.parameter_definition_id
            AND parameter_policy.status = 'ACTIVE' ORDER BY parameter_policy.version DESC LIMIT 1
        ) policy ON true
        LEFT JOIN maintenance.checklist_validation_rules rule
          ON rule.item_type_code = item.response_type_code AND rule.code = item.validation_rule_code
        WHERE action.id = $2 AND item.status = 'ACTIVE'
        ORDER BY item.sequence
      `,
      [executionId, action.id],
    );
    await client.query(
      `UPDATE maintenance.work_order_actions SET status = 'IN_PROGRESS', responsible_id = $2 WHERE id = $1`,
      [action.id, operatorId],
    );
    await client.query(
      `UPDATE maintenance.work_orders SET status = 'IN_PROGRESS', responsible_id = $2 WHERE id = $1`,
      [action.work_order_id, operatorId],
    );
  }

  async findExecution(client: PoolClient, id: string, lock = false): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `SELECT * FROM maintenance.executions WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getExecutionDetail(client: PoolClient, id: string): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `
        SELECT execution.id, execution.status, execution.operator_id AS operador_id,
               operator.name AS operador_nome, execution.opened_at AS assumida_em,
               execution.started_at AS iniciada_em, execution.completed_at AS concluida_em,
               execution.duration_seconds AS duracao_segundos, execution.result AS resultado,
               execution.observation AS observacao, work_order.code AS ordem_codigo,
               work_order.title AS titulo, asset.tag AS ativo_tag, asset.name AS ativo_nome,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'id', item.id, 'sequencia', item.sequence, 'titulo', item.title_snapshot,
                 'instrucao', item.instruction_snapshot, 'tipo_resposta', item.response_type_code,
                 'categoria', item.category_snapshot, 'obrigatorio', item.required,
                 'evidencia_obrigatoria', item.evidence_required,
                 'minimo_evidencias', item.minimum_evidence_photos,
                 'bloqueia_conclusao', item.blocks_completion, 'status', item.status,
                 'resposta_texto', item.response_text, 'resposta_numero', item.response_number,
                 'resposta_booleano', item.response_boolean, 'resposta_opcao', item.response_option,
                 'observacao', item.observation, 'conforme', item.compliant,
                 'mensagem_validacao', item.validation_message,
                 'quantidade_evidencias', item.evidence_count,
                 'evidencias', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'id', evidence.id, 'tipo', evidence.evidence_type,
                   'objeto_armazenamento_id', evidence.storage_object_id,
                   'nome_arquivo', storage_object.original_name,
                   'tipo_midia', storage_object.media_type,
                   'tamanho_bytes', storage_object.byte_size,
                   'observacao', evidence.observation,
                   'capturada_em', evidence.captured_at,
                   'registrada_em', evidence.created_at
                 ) ORDER BY evidence.created_at)
                 FROM maintenance.evidence evidence
                 JOIN platform.storage_objects storage_object
                   ON storage_object.id = evidence.storage_object_id
                 WHERE evidence.execution_checklist_item_id = item.id), '[]'::jsonb),
                 'minimo', item.minimum_value_snapshot, 'maximo', item.maximum_value_snapshot,
                 'unidade', item.unit_snapshot, 'opcoes', item.options_snapshot
               ) ORDER BY item.sequence) FROM maintenance.execution_checklist_items item
               WHERE item.execution_id = execution.id), '[]'::jsonb) AS itens
        FROM maintenance.executions execution
        JOIN iam.users operator ON operator.id = execution.operator_id
        JOIN maintenance.work_orders work_order ON work_order.id = execution.work_order_id
        JOIN cmms.assets asset ON asset.id = execution.asset_id
        WHERE execution.id = $1
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findExecutionItem(
    client: PoolClient,
    executionId: string,
    itemId: string,
    lock = false,
  ): Promise<OperationsRow | null> {
    const result = await client.query<OperationsRow>(
      `SELECT * FROM maintenance.execution_checklist_items
       WHERE id = $1 AND execution_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
      [itemId, executionId],
    );
    return result.rows[0] ?? null;
  }

  async answerExecutionItem(
    client: PoolClient,
    itemId: string,
    userId: string,
    response: ExecutionResponseInput,
    status: string,
    compliant: boolean | null,
    validationMessage: string | null,
  ): Promise<void> {
    await client.query(
      `UPDATE maintenance.execution_checklist_items SET
         response_text=$2, response_number=$3, response_boolean=$4, response_option=$5,
         observation=$6, status=$7, compliant=$8, validation_message=$9,
         answered_by=$10, answered_at=clock_timestamp()
       WHERE id=$1`,
      [
        itemId,
        response.textValue,
        response.numberValue,
        response.booleanValue,
        response.optionValue,
        response.observation,
        status,
        compliant,
        validationMessage,
        userId,
      ],
    );
  }

  async storageObjectAvailable(client: PoolClient, id: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM platform.storage_objects WHERE id=$1 AND status='AVAILABLE' AND deleted_at IS NULL) AS exists`,
      [id],
    );
    return result.rows[0]?.exists ?? false;
  }

  async insertEvidence(
    client: PoolClient,
    tenantId: string,
    execution: OperationsRow,
    itemId: string,
    userId: string,
    input: EvidenceInput,
  ): Promise<void> {
    await client.query(
      `INSERT INTO maintenance.evidence
       (tenant_id, execution_id, work_order_action_id, execution_checklist_item_id,
        asset_id, component_id, evidence_type, storage_object_id, observation, user_id, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,clock_timestamp()))`,
      [
        tenantId,
        execution.id,
        execution.work_order_action_id,
        itemId,
        execution.asset_id,
        execution.component_id,
        input.evidenceType,
        input.storageObjectId,
        input.observation,
        userId,
        input.capturedAt,
      ],
    );
  }

  async markEvidenceItemAnswered(
    client: PoolClient,
    itemId: string,
    userId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE maintenance.execution_checklist_items
       SET status='ANSWERED', compliant=true, validation_message=NULL,
           answered_by=$2, answered_at=clock_timestamp()
       WHERE id=$1 AND response_type_code='EVIDENCIA'
         AND evidence_count >= GREATEST(minimum_evidence_photos,1)`,
      [itemId, userId],
    );
  }

  async insertParameterReading(
    client: PoolClient,
    tenantId: string,
    executionId: string,
    item: OperationsRow,
    userId: string,
    value: number,
    classification: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO cmms.parameter_readings
       (tenant_id,parameter_definition_id,parameter_policy_id,numeric_value,unit,
        classification,source,source_entity_type,source_entity_id,recorded_by,recorded_at,raw_value)
       VALUES ($1,$2,$3,$4,$5,$6,'CHECKLIST','EXECUTION',$7,$8,clock_timestamp(),$9)`,
      [
        tenantId,
        item.parameter_definition_id,
        item.parameter_policy_id,
        value,
        item.unit_snapshot,
        classification,
        executionId,
        userId,
        String(value),
      ],
    );
  }

  async startExecution(client: PoolClient, executionId: string, stopMode: string): Promise<void> {
    await client.query(
      `UPDATE maintenance.executions SET status='IN_PROGRESS', started_at=COALESCE(started_at,clock_timestamp()), execution_stop_mode=$2 WHERE id=$1`,
      [executionId, stopMode],
    );
  }

  async blockingExecutionItems(client: PoolClient, executionId: string): Promise<OperationsRow> {
    const result = await client.query<OperationsRow>(
      `SELECT $1::uuid AS id,
              count(*) FILTER (WHERE required AND status NOT IN ('ANSWERED','NOT_APPLICABLE'))::integer AS pendentes,
              count(*) FILTER (WHERE evidence_required AND evidence_count < GREATEST(minimum_evidence_photos,1))::integer AS evidencias_pendentes,
              count(*) FILTER (WHERE blocks_completion AND status='NONCOMPLIANT')::integer AS nao_conformes_bloqueantes
       FROM maintenance.execution_checklist_items WHERE execution_id=$1`,
      [executionId],
    );
    return required(result.rows, 'NÃ£o foi possÃ­vel validar os itens da execuÃ§Ã£o.');
  }

  async completeExecution(
    client: PoolClient,
    execution: OperationsRow,
    input: CompletionInput,
  ): Promise<void> {
    await client.query(
      `UPDATE maintenance.executions SET status='COMPLETED', result=$2, observation=$3,
       execution_stop_mode=$4, completed_at=clock_timestamp() WHERE id=$1`,
      [execution.id, input.result, input.observation, input.stopMode],
    );
    await client.query(
      `UPDATE maintenance.work_order_actions SET status='COMPLETED', completed_at=clock_timestamp() WHERE id=$1`,
      [execution.work_order_action_id],
    );
    await client.query(
      `UPDATE maintenance.work_orders SET status='COMPLETED', completed_at=clock_timestamp() WHERE id=$1`,
      [execution.work_order_id],
    );
  }

  async writeAudit(
    client: PoolClient,
    tenantId: string,
    userId: string,
    metadata: RequestAuditMetadata,
    action: string,
    entityType: string,
    entityId: string,
    afterData: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.events
       (tenant_id,user_id,role_snapshot,action,entity_type,entity_id,after_data,
        redacted_fields,trace_id,source,user_agent,ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,ARRAY[]::text[],$8,'APPLICATION',$9,$10)`,
      [
        tenantId,
        userId,
        metadata.roleSnapshot,
        action,
        entityType,
        entityId,
        JSON.stringify(afterData),
        metadata.traceId,
        metadata.userAgent,
        metadata.ipAddress,
      ],
    );
  }
}

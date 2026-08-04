import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool, type PoolClient } from 'pg';

import { buildApp } from '../src/app.js';
import { createTestEnvironment } from './helpers/environment.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationEnabled = Boolean(databaseUrl);
const tenantId = randomUUID();

const ids = {
  admin: randomUUID(),
  quality: randomUUID(),
  safety: randomUUID(),
  operator: randomUUID(),
  adminRole: randomUUID(),
  validatorRole: randomUUID(),
  operatorRole: randomUUID(),
  qualityArea: randomUUID(),
  safetyArea: randomUUID(),
  qualityTechnicalRole: randomUUID(),
  safetyTechnicalRole: randomUUID(),
  plant: randomUUID(),
  sector: randomUUID(),
  line: randomUUID(),
  asset: randomUUID(),
  component: randomUUID(),
  parameter: randomUUID(),
  policy: randomUUID(),
  checklist: randomUUID(),
  checklistVersion: randomUUID(),
  confirmationItem: randomUUID(),
  parameterItem: randomUUID(),
  evidenceItem: randomUUID(),
  plan: randomUUID(),
  planVersion: randomUUID(),
  storageObject: randomUUID(),
} as const;

interface Identities {
  readonly admin: string;
  readonly quality: string;
  readonly safety: string;
  readonly operator: string;
}

function token(): { readonly raw: string; readonly hash: string } {
  const raw = `fcs_${randomBytes(32).toString('base64url')}`;
  return { raw, hash: createHash('sha256').update(raw, 'utf8').digest('hex') };
}

function bearer(raw: string) {
  return { authorization: `Bearer ${raw}` };
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true)`,
      [tenantId, ids.admin],
    );
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  } finally {
    client.release();
  }
}

async function seed(pool: Pool): Promise<Identities> {
  const admin = token();
  const quality = token();
  const safety = token();
  const operator = token();
  await transaction(pool, async (client) => {
    await client.query(
      `INSERT INTO platform.tenants (id,legal_name,display_name,slug,environment,status)
      VALUES ($1,'Operações Testes','Operações Testes',$2,'DEVELOPMENT','ACTIVE')`,
      [tenantId, `operations-${randomUUID()}`],
    );
    await client.query(
      `INSERT INTO iam.roles (id,tenant_id,code,name,description,role_type,protected) VALUES
      ($1,$4,'OPS_ADMIN','Administrador','Administra o fluxo.','ADMIN',true),
      ($2,$4,'OPS_VALIDATOR','Validador','Valida o fluxo.','MANAGER',true),
      ($3,$4,'OPS_OPERATOR','Operador','Executa o fluxo.','OPERATOR',true)`,
      [ids.adminRole, ids.validatorRole, ids.operatorRole, tenantId],
    );
    await client.query(
      `INSERT INTO iam.users (id,tenant_id,employee_number,name,email,first_access_required) VALUES
      ($1,$5,'USR-OPS-ADM','Admin Operações','ops.admin@fabcontrol.local',false),
      ($2,$5,'USR-OPS-QUA','Qualidade Operações','ops.quality@fabcontrol.local',false),
      ($3,$5,'USR-OPS-SEG','Segurança Operações','ops.safety@fabcontrol.local',false),
      ($4,$5,'USR-OPS-OPE','Operador Operações','ops.operator@fabcontrol.local',false)`,
      [ids.admin, ids.quality, ids.safety, ids.operator, tenantId],
    );
    await client.query(
      `INSERT INTO iam.user_roles (tenant_id,user_id,role_id) VALUES
      ($1,$2,$6),($1,$3,$7),($1,$4,$7),($1,$5,$8)`,
      [
        tenantId,
        ids.admin,
        ids.quality,
        ids.safety,
        ids.operator,
        ids.adminRole,
        ids.validatorRole,
        ids.operatorRole,
      ],
    );
    await client.query(
      `INSERT INTO iam.role_capabilities (tenant_id,role_id,capability_id,effect)
      SELECT $1,$2,id,'ALLOW' FROM iam.capabilities WHERE code=ANY($3::text[])`,
      [
        tenantId,
        ids.adminRole,
        [
          'maintenance.work-orders.read',
          'maintenance.work-orders.manage',
          'maintenance.work-orders.release',
          'maintenance.executions.read',
        ],
      ],
    );
    await client.query(
      `INSERT INTO iam.role_capabilities (tenant_id,role_id,capability_id,effect)
      SELECT $1,$2,id,'ALLOW' FROM iam.capabilities WHERE code=ANY($3::text[])`,
      [
        tenantId,
        ids.validatorRole,
        [
          'maintenance.work-orders.read',
          'maintenance.work-orders.review',
          'maintenance.executions.read',
        ],
      ],
    );
    await client.query(
      `INSERT INTO iam.role_capabilities (tenant_id,role_id,capability_id,effect)
      SELECT $1,$2,id,'ALLOW' FROM iam.capabilities WHERE code=ANY($3::text[])`,
      [
        tenantId,
        ids.operatorRole,
        ['maintenance.executions.read', 'maintenance.executions.perform'],
      ],
    );
    await client.query(
      `INSERT INTO iam.technical_areas
      (id,tenant_id,code,name,description,validation_area,default_signature_required,created_by) VALUES
      ($1,$3,'QUALITY','Qualidade','Validação de qualidade.',true,true,$4),
      ($2,$3,'SAFETY','Segurança','Validação de segurança.',true,true,$4)`,
      [ids.qualityArea, ids.safetyArea, tenantId, ids.admin],
    );
    await client.query(
      `INSERT INTO iam.technical_roles
      (id,tenant_id,technical_area_id,code,name,description,can_sign,created_by) VALUES
      ($1,$3,$4,'QUALITY_INSPECTOR','Inspetor','Assinante.',true,$6),
      ($2,$3,$5,'SAFETY_TECHNICIAN','Técnico de segurança','Assinante.',true,$6)`,
      [
        ids.qualityTechnicalRole,
        ids.safetyTechnicalRole,
        tenantId,
        ids.qualityArea,
        ids.safetyArea,
        ids.admin,
      ],
    );
    await client.query(
      `INSERT INTO iam.user_technical_assignments
      (tenant_id,user_id,technical_area_id,technical_role_id,is_primary,assigned_by) VALUES
      ($1,$2,$4,$5,true,$6),($1,$3,$7,$8,true,$6)`,
      [
        tenantId,
        ids.quality,
        ids.safety,
        ids.qualityArea,
        ids.qualityTechnicalRole,
        ids.admin,
        ids.safetyArea,
        ids.safetyTechnicalRole,
      ],
    );
    for (const [userId, session] of [
      [ids.admin, admin],
      [ids.quality, quality],
      [ids.safety, safety],
      [ids.operator, operator],
    ] as const) {
      await client.query(
        `INSERT INTO iam.sessions
        (tenant_id,user_id,token_hash_sha256,environment,scope,ip_address,expires_at)
        VALUES ($1,$2,$3,'DEVELOPMENT','{"purpose":"APPLICATION"}'::jsonb,'127.0.0.1',clock_timestamp()+interval '1 hour')`,
        [tenantId, userId, session.hash],
      );
    }
    await client.query(
      `INSERT INTO cmms.plants (id,tenant_id,tag,name) VALUES ($1,$2,'PLT-OPS','Planta Operações')`,
      [ids.plant, tenantId],
    );
    await client.query(
      `INSERT INTO cmms.sectors (id,tenant_id,plant_id,tag,name) VALUES ($1,$2,$3,'SET-OPS','Manutenção')`,
      [ids.sector, tenantId, ids.plant],
    );
    await client.query(
      `INSERT INTO cmms.lines (id,tenant_id,sector_id,tag,name) VALUES ($1,$2,$3,'LIN-OPS','Linha Operações')`,
      [ids.line, tenantId, ids.sector],
    );
    await client.query(
      `INSERT INTO cmms.assets
      (id,tenant_id,line_id,tag,qr_payload,name,asset_type,manufacturer,model,serial_number,criticality,lifecycle_status,technical_location)
      VALUES ($1,$2,$3,'EQ-OPS-001','FAB:ASSET:EQ-OPS-001','Prensa de teste','PRESS','Fab','P1','OPS001','HIGH','ACTIVE','Linha Operações')`,
      [ids.asset, tenantId, ids.line],
    );
    await client.query(
      `INSERT INTO cmms.components
      (id,tenant_id,asset_id,tag,qr_payload,name,component_type,criticality,lifecycle_status)
      VALUES ($1,$2,$3,'MOT-OPS-001','FAB:COMPONENT:MOT-OPS-001','Motor principal','MOTOR','HIGH','ACTIVE')`,
      [ids.component, tenantId, ids.asset],
    );
    await client.query(
      `INSERT INTO cmms.parameter_definitions
      (id,tenant_id,asset_id,component_id,code,name,unit,value_type,source_type,status)
      VALUES ($1,$2,$3,$4,'TEMP-OPS','Temperatura','°C','DECIMAL','MANUAL','ACTIVE')`,
      [ids.parameter, tenantId, ids.asset, ids.component],
    );
    await client.query(
      `INSERT INTO cmms.parameter_policies
      (id,tenant_id,parameter_definition_id,version,warning_min,warning_max,critical_min,critical_max,effective_from,status,content_hash_sha256,created_by,approved_by,approved_at)
      VALUES ($1,$2,$3,1,150,170,140,180,clock_timestamp(),'ACTIVE',$4,$5,$5,clock_timestamp())`,
      [ids.policy, tenantId, ids.parameter, 'a'.repeat(64), ids.admin],
    );
    await client.query(
      `INSERT INTO maintenance.checklist_templates
      (id,tenant_id,code,name,asset_id,component_id,checklist_type,criticality,created_by)
      VALUES ($1,$2,'CHK-OPS-001','Checklist operacional completo',$3,$4,'PREVENTIVE','HIGH',$5)`,
      [ids.checklist, tenantId, ids.asset, ids.component, ids.admin],
    );
    await client.query(
      `INSERT INTO maintenance.checklist_template_versions
      (id,tenant_id,checklist_template_id,revision,status,signature_policy,required_signatures,segregation_required,content_hash_sha256,created_by,submitted_at)
      VALUES ($1,$2,$3,1,'DRAFT','QUALIDADE_E_SEGURANCA',2,true,$4,$5,clock_timestamp())`,
      [ids.checklistVersion, tenantId, ids.checklist, 'b'.repeat(64), ids.admin],
    );
    await client.query(
      `INSERT INTO maintenance.checklist_items
      (id,tenant_id,checklist_template_version_id,sequence,title,instruction,response_type_code,category,required,evidence_required,minimum_evidence_photos,blocks_completion,parameter_definition_id,minimum_value,maximum_value,unit)
      VALUES
      ($1,$4,$5,1,'Confirmar bloqueio','Confirme o bloqueio seguro.','CONFIRMACAO','SEGURANCA',true,false,0,true,NULL,NULL,NULL,NULL),
      ($2,$4,$5,2,'Medir temperatura','Registre a temperatura.','PARAMETRO','TECNICO',true,false,0,true,$6,150,170,'°C'),
      ($3,$4,$5,3,'Fotografar condição','Registre evidência.','EVIDENCIA','TECNICO',true,true,1,true,NULL,NULL,NULL,NULL)`,
      [
        ids.confirmationItem,
        ids.parameterItem,
        ids.evidenceItem,
        tenantId,
        ids.checklistVersion,
        ids.parameter,
      ],
    );
    await client.query(
      `UPDATE maintenance.checklist_template_versions SET status='APPROVED' WHERE id=$1`,
      [ids.checklistVersion],
    );
    await client.query(
      `UPDATE maintenance.checklist_template_versions SET status='PUBLISHED',published_at=clock_timestamp() WHERE id=$1`,
      [ids.checklistVersion],
    );
    await client.query(
      `INSERT INTO maintenance.maintenance_plans
      (id,tenant_id,code,name,asset_id,component_id,plan_type,created_by)
      VALUES ($1,$2,'PLN-OPS-001','Plano operacional completo',$3,$4,'PREVENTIVE',$5)`,
      [ids.plan, tenantId, ids.asset, ids.component, ids.admin],
    );
    await client.query(
      `INSERT INTO maintenance.maintenance_plan_versions
      (id,tenant_id,maintenance_plan_id,checklist_template_version_id,revision,status,criticality,trigger_type,recurrence_days,
       estimated_duration_minutes,lockout_required,evidence_required,maintenance_stop_mode,technical_analysis,content_hash_sha256,created_by,published_at)
      VALUES ($1,$2,$3,$4,1,'PUBLISHED','HIGH','PERIODICITY',30,45,true,true,'MANDATORY_STOP',
       '{"objetivo":"Validar fluxo completo"}'::jsonb,$5,$6,clock_timestamp())`,
      [ids.planVersion, tenantId, ids.plan, ids.checklistVersion, 'c'.repeat(64), ids.admin],
    );
    await client.query(
      `INSERT INTO platform.storage_objects
      (id,tenant_id,provider,bucket,object_key,original_name,media_type,byte_size,checksum_sha256,status,created_by)
      VALUES ($1,$2,'LOCAL_TEST','operations','evidence/test.jpg','teste.jpg','image/jpeg',128,$3,'AVAILABLE',$4)`,
      [ids.storageObject, tenantId, 'd'.repeat(64), ids.operator],
    );
  });
  return { admin: admin.raw, quality: quality.raw, safety: safety.raw, operator: operator.raw };
}

test(
  'fluxo operacional: OS, dupla assinatura permanente, liberação, checklist, evidência e conclusão',
  { skip: !integrationEnabled },
  async (context) => {
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl, max: 4 });
    const identities = await seed(pool);
    const app = await buildApp({ environment: createTestEnvironment(databaseUrl, tenantId) });
    context.after(async () => {
      await app.close();
      await pool.end();
    });

    const correctionDraft = await app.inject({
      method: 'POST',
      url: '/v1/maintenance/work-orders',
      headers: bearer(identities.admin),
      payload: {
        plano_versao_id: ids.planVersion,
        tipo_origem: 'ADMIN',
        entidade_origem_id: null,
        tipo_trabalho: 'PREVENTIVE',
        titulo: 'OS destinada ao teste de correção',
        descricao: 'Conteúdo inicial que será devolvido pela Qualidade.',
        prioridade: 'MEDIUM',
        responsavel_id: null,
        programada_para: null,
        analise_tecnica: { situacao: 'Análise inicial' },
      },
    });
    assert.equal(correctionDraft.statusCode, 200, correctionDraft.body);
    const correctionWorkOrderId: string = correctionDraft.json().data.id;

    const correctionSubmitted = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/work-orders/${correctionWorkOrderId}/submit-review`,
      headers: bearer(identities.admin),
      payload: {
        politica_assinatura: 'QUALIDADE',
        assinaturas_exigidas: 1,
        primeira_resposta_ate: null,
        resolucao_ate: null,
      },
    });
    assert.equal(correctionSubmitted.statusCode, 200, correctionSubmitted.body);
    const previousDemandId: string = correctionSubmitted.json().data.validacao.id;

    const changesRequested = await app.inject({
      method: 'POST',
      url: `/v1/workflow/technical-demands/${previousDemandId}/request-changes`,
      headers: bearer(identities.quality),
      payload: { motivo: 'Detalhar os riscos e o resultado técnico esperado antes da aprovação.' },
    });
    assert.equal(changesRequested.statusCode, 200, changesRequested.body);
    assert.equal(changesRequested.json().data.status, 'CHANGES_REQUESTED');

    const corrected = await app.inject({
      method: 'PATCH',
      url: `/v1/maintenance/work-orders/${correctionWorkOrderId}`,
      headers: bearer(identities.admin),
      payload: {
        titulo: 'OS corrigida após revisão da Qualidade',
        descricao: 'Riscos, bloqueio e resultado técnico foram detalhados para nova validação.',
        prioridade: 'HIGH',
        responsavel_id: null,
        programada_para: null,
        analise_tecnica: {
          situacao: 'Revisão preventiva',
          riscos: ['energia residual'],
          resultado_esperado: 'Equipamento seguro e liberado',
        },
      },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    assert.equal(corrected.json().data.status, 'DRAFT');
    assert.equal(corrected.json().data.validacao, null);

    const correctionResubmitted = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/work-orders/${correctionWorkOrderId}/submit-review`,
      headers: bearer(identities.admin),
      payload: {
        politica_assinatura: 'QUALIDADE',
        assinaturas_exigidas: 1,
        primeira_resposta_ate: null,
        resolucao_ate: null,
      },
    });
    assert.equal(correctionResubmitted.statusCode, 200, correctionResubmitted.body);
    assert.notEqual(correctionResubmitted.json().data.validacao.id, previousDemandId);

    await transaction(pool, async (client) => {
      const history = await client.query(
        `SELECT
          (SELECT status FROM workflow.technical_demands WHERE id=$1) AS previous_status,
          (SELECT count(*) FROM workflow.technical_demands WHERE entity_id=$2) AS review_count`,
        [previousDemandId, correctionWorkOrderId],
      );
      assert.equal(history.rows[0]!.previous_status, 'CHANGES_REQUESTED');
      assert.equal(Number(history.rows[0]!.review_count), 2);
    });

    const created = await app.inject({
      method: 'POST',
      url: '/v1/maintenance/work-orders',
      headers: bearer(identities.admin),
      payload: {
        plano_versao_id: ids.planVersion,
        tipo_origem: 'ADMIN',
        entidade_origem_id: null,
        tipo_trabalho: 'PREVENTIVE',
        titulo: 'Preventiva integral da prensa',
        descricao: 'Executar checklist validado.',
        prioridade: 'HIGH',
        responsavel_id: null,
        programada_para: null,
        analise_tecnica: {
          situacao: 'Manutenção programada',
          resultado_esperado: 'Equipamento seguro',
        },
      },
    });
    assert.equal(created.statusCode, 200, created.body);
    const workOrderId: string = created.json().data.id;

    const submitted = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/work-orders/${workOrderId}/submit-review`,
      headers: bearer(identities.admin),
      payload: {
        politica_assinatura: 'QUALIDADE_E_SEGURANCA',
        assinaturas_exigidas: 2,
        primeira_resposta_ate: null,
        resolucao_ate: null,
      },
    });
    assert.equal(submitted.statusCode, 200, submitted.body);
    const demandId: string = submitted.json().data.validacao.id;
    assert.equal(submitted.json().data.checklist_itens.length, 3);

    const qualitySigned = await app.inject({
      method: 'POST',
      url: `/v1/workflow/technical-demands/${demandId}/sign`,
      headers: bearer(identities.quality),
      payload: {
        declaracao: 'Confirmo a conformidade técnica e a rastreabilidade desta ordem.',
        significado: 'Aprovação de Qualidade',
      },
    });
    assert.equal(qualitySigned.statusCode, 200, qualitySigned.body);
    assert.equal(qualitySigned.json().data.status, 'IN_TECHNICAL_REVIEW');

    const prematureRelease = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/work-orders/${workOrderId}/release`,
      headers: bearer(identities.admin),
    });
    assert.equal(prematureRelease.statusCode, 409, prematureRelease.body);

    const safetySigned = await app.inject({
      method: 'POST',
      url: `/v1/workflow/technical-demands/${demandId}/sign`,
      headers: bearer(identities.safety),
      payload: {
        declaracao: 'Confirmo os requisitos de segurança, bloqueio e evidências da ordem.',
        significado: 'Aprovação de Segurança',
      },
    });
    assert.equal(safetySigned.statusCode, 200, safetySigned.body);
    assert.equal(safetySigned.json().data.status, 'APPROVED');
    assert.equal(safetySigned.json().data.validacao.assinaturas.length, 2);

    const released = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/work-orders/${workOrderId}/release`,
      headers: bearer(identities.admin),
    });
    assert.equal(released.statusCode, 200, released.body);
    assert.equal(released.json().data.status, 'RELEASED');

    const queue = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/operator-actions',
      headers: bearer(identities.operator),
    });
    assert.equal(queue.statusCode, 200, queue.body);
    assert.equal(queue.json().data.itens.length, 1);
    const actionId: string = queue.json().data.itens[0].id;

    const assumed = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/operator-actions/${actionId}/assume`,
      headers: bearer(identities.operator),
    });
    assert.equal(assumed.statusCode, 200, assumed.body);
    const executionId: string = assumed.json().data.id;
    assert.equal(assumed.json().data.itens.length, 3);

    const started = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/executions/${executionId}/start`,
      headers: bearer(identities.operator),
      payload: { modo_parada: 'STOPPED' },
    });
    assert.equal(started.statusCode, 200, started.body);

    const executionItems: readonly { id: string; tipo_resposta: string }[] =
      started.json().data.itens;
    const confirmation = executionItems.find((item) => item.tipo_resposta === 'CONFIRMACAO')!;
    const parameter = executionItems.find((item) => item.tipo_resposta === 'PARAMETRO')!;
    const evidence = executionItems.find((item) => item.tipo_resposta === 'EVIDENCIA')!;

    for (const [itemId, payload] of [
      [
        confirmation.id,
        {
          resposta_texto: null,
          resposta_numero: null,
          resposta_booleano: true,
          resposta_opcao: null,
          observacao: null,
          nao_aplicavel: false,
        },
      ],
      [
        parameter.id,
        {
          resposta_texto: null,
          resposta_numero: 160,
          resposta_booleano: null,
          resposta_opcao: null,
          observacao: 'Dentro da faixa.',
          nao_aplicavel: false,
        },
      ],
    ] as const) {
      const answered = await app.inject({
        method: 'PUT',
        url: `/v1/maintenance/executions/${executionId}/items/${itemId}/response`,
        headers: bearer(identities.operator),
        payload,
      });
      assert.equal(answered.statusCode, 200, answered.body);
    }

    const blockedCompletion = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/executions/${executionId}/complete`,
      headers: bearer(identities.operator),
      payload: {
        resultado: 'Preventiva concluída com sucesso.',
        observacao: null,
        modo_parada: 'STOPPED',
      },
    });
    assert.equal(blockedCompletion.statusCode, 409, blockedCompletion.body);
    assert.equal(blockedCompletion.json().error.code, 'EXECUTION_HAS_BLOCKERS');

    const evidenced = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/executions/${executionId}/items/${evidence.id}/evidence`,
      headers: bearer(identities.operator),
      payload: {
        objeto_armazenamento_id: ids.storageObject,
        tipo: 'PHOTO',
        observacao: 'Condição final segura.',
        capturada_em: null,
      },
    });
    assert.equal(evidenced.statusCode, 200, evidenced.body);
    const evidenceItems = evidenced.json().data.itens as readonly {
      readonly id: string;
      readonly quantidade_evidencias: number;
      readonly evidencias: readonly { readonly nome_arquivo: string }[];
    }[];
    const evidenceDetails = evidenceItems.find((item) => item.id === evidence.id);
    assert.ok(evidenceDetails);
    assert.equal(evidenceDetails.quantidade_evidencias, 1);
    const evidenceFile = evidenceDetails.evidencias.at(0);
    assert.ok(evidenceFile);
    assert.equal(evidenceFile.nome_arquivo, 'teste.jpg');

    const completed = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/executions/${executionId}/complete`,
      headers: bearer(identities.operator),
      payload: {
        resultado: 'Preventiva concluída com sucesso.',
        observacao: 'Equipamento liberado.',
        modo_parada: 'STOPPED',
      },
    });
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal(completed.json().data.status, 'COMPLETED');

    const emptyQueue = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/operator-actions',
      headers: bearer(identities.operator),
    });
    assert.equal(emptyQueue.statusCode, 200, emptyQueue.body);
    assert.equal(emptyQueue.json().data.itens.length, 0);

    await transaction(pool, async (client) => {
      const persisted = await client.query(
        `SELECT
      (SELECT count(*) FROM workflow.technical_signatures WHERE technical_demand_id=$1) AS signatures,
      (SELECT count(*) FROM cmms.parameter_readings WHERE source_entity_id=$2) AS readings,
      (SELECT status FROM maintenance.work_orders WHERE id=$3) AS work_order_status`,
        [demandId, executionId, workOrderId],
      );
      assert.equal(Number(persisted.rows[0]!.signatures), 2);
      assert.equal(Number(persisted.rows[0]!.readings), 1);
      assert.equal(persisted.rows[0]!.work_order_status, 'COMPLETED');
    });
  },
);

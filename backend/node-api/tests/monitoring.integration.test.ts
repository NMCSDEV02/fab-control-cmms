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
  manager: randomUUID(),
  operator: randomUUID(),
  adminRole: randomUUID(),
  managerRole: randomUUID(),
  operatorRole: randomUUID(),
  technicalArea: randomUUID(),
  technicalRole: randomUUID(),
  plant: randomUUID(),
  sector: randomUUID(),
  line: randomUUID(),
  asset: randomUUID(),
  alert: randomUUID(),
} as const;

interface Tokens {
  readonly admin: string;
  readonly manager: string;
  readonly operator: string;
}

function sessionToken(): { readonly raw: string; readonly hash: string } {
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
      `SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)`,
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

async function seed(pool: Pool): Promise<Tokens> {
  const admin = sessionToken();
  const manager = sessionToken();
  const operator = sessionToken();
  await transaction(pool, async (client) => {
    await client.query(
      `INSERT INTO platform.tenants (id,legal_name,display_name,slug,environment,status)
       VALUES ($1,'Monitoramento Testes','Monitoramento Testes',$2,'DEVELOPMENT','ACTIVE')`,
      [tenantId, `monitoring-${randomUUID()}`],
    );
    await client.query(
      `INSERT INTO iam.roles (id,tenant_id,code,name,description,role_type,protected) VALUES
       ($1,$4,'MON_ADMIN','Administrador','Administra monitoramento.','ADMIN',true),
       ($2,$4,'MON_MANAGER','Gestor técnico','Trata eventos técnicos.','MANAGER',true),
       ($3,$4,'MON_OPERATOR','Operador','Registra ocorrências.','OPERATOR',true)`,
      [ids.adminRole, ids.managerRole, ids.operatorRole, tenantId],
    );
    await client.query(
      `INSERT INTO iam.users (id,tenant_id,employee_number,name,email,first_access_required) VALUES
       ($1,$4,'USR-MON-ADM','Admin Monitoramento','mon.admin@fabcontrol.local',false),
       ($2,$4,'USR-MON-GES','Gestor Monitoramento','mon.manager@fabcontrol.local',false),
       ($3,$4,'USR-MON-OPE','Operador Monitoramento','mon.operator@fabcontrol.local',false)`,
      [ids.admin, ids.manager, ids.operator, tenantId],
    );
    await client.query(
      `INSERT INTO iam.user_roles (tenant_id,user_id,role_id) VALUES
       ($1,$2,$5),($1,$3,$6),($1,$4,$7)`,
      [
        tenantId,
        ids.admin,
        ids.manager,
        ids.operator,
        ids.adminRole,
        ids.managerRole,
        ids.operatorRole,
      ],
    );

    for (const [roleId, capabilities] of [
      [
        ids.adminRole,
        [
          'maintenance.occurrences.read',
          'maintenance.stops.read',
          'maintenance.alerts.read',
          'workflow.notifications.read',
          'analytics.technical.read',
        ],
      ],
      [
        ids.managerRole,
        [
          'maintenance.occurrences.read',
          'maintenance.occurrences.report',
          'maintenance.occurrences.triage',
          'maintenance.stops.read',
          'maintenance.stops.manage',
          'maintenance.alerts.read',
          'maintenance.alerts.manage',
          'workflow.notifications.read',
          'analytics.technical.read',
        ],
      ],
      [
        ids.operatorRole,
        [
          'maintenance.occurrences.read',
          'maintenance.occurrences.report',
          'maintenance.stops.read',
          'workflow.notifications.read',
        ],
      ],
    ] as const) {
      await client.query(
        `INSERT INTO iam.role_capabilities (tenant_id,role_id,capability_id,effect)
         SELECT $1,$2,id,'ALLOW' FROM iam.capabilities WHERE code=ANY($3::text[])`,
        [tenantId, roleId, capabilities],
      );
    }

    await client.query(
      `INSERT INTO iam.technical_areas
       (id,tenant_id,code,name,description,validation_area,default_signature_required,created_by)
       VALUES ($1,$2,'MAINTENANCE','Manutenção','Análise e confiabilidade.',false,false,$3)`,
      [ids.technicalArea, tenantId, ids.admin],
    );
    await client.query(
      `INSERT INTO iam.technical_roles
       (id,tenant_id,technical_area_id,code,name,description,can_sign,created_by)
       VALUES ($1,$2,$3,'MAINTENANCE_TECHNICIAN','Técnico de manutenção','Emite análise.',false,$4)`,
      [ids.technicalRole, tenantId, ids.technicalArea, ids.admin],
    );
    await client.query(
      `INSERT INTO iam.user_technical_assignments
       (tenant_id,user_id,technical_area_id,technical_role_id,is_primary,assigned_by)
       VALUES ($1,$2,$3,$4,true,$5)`,
      [tenantId, ids.manager, ids.technicalArea, ids.technicalRole, ids.admin],
    );

    for (const [userId, session] of [
      [ids.admin, admin],
      [ids.manager, manager],
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
      `INSERT INTO cmms.plants (id,tenant_id,tag,name) VALUES ($1,$2,'PLT-MON','Planta Monitoramento')`,
      [ids.plant, tenantId],
    );
    await client.query(
      `INSERT INTO cmms.sectors (id,tenant_id,plant_id,tag,name) VALUES ($1,$2,$3,'SET-MON','Manutenção')`,
      [ids.sector, tenantId, ids.plant],
    );
    await client.query(
      `INSERT INTO cmms.lines (id,tenant_id,sector_id,tag,name) VALUES ($1,$2,$3,'LIN-MON','Linha Monitoramento')`,
      [ids.line, tenantId, ids.sector],
    );
    await client.query(
      `INSERT INTO cmms.assets
       (id,tenant_id,line_id,tag,qr_payload,name,asset_type,criticality,lifecycle_status,operational_status)
       VALUES ($1,$2,$3,'EQ-MON-001','FAB:ASSET:EQ-MON-001','Virador de tambor','MACHINE','CRITICAL','ACTIVE','OPERATING')`,
      [ids.asset, tenantId, ids.line],
    );
  });
  return { admin: admin.raw, manager: manager.raw, operator: operator.raw };
}

test(
  'monitoramento: ocorrência, parada, análise, notificação persistente, alerta e indicadores',
  { skip: !integrationEnabled },
  async (context) => {
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl, max: 4 });
    const tokens = await seed(pool);
    const app = await buildApp({ environment: createTestEnvironment(databaseUrl, tenantId) });
    context.after(async () => {
      await app.close();
      await pool.end();
    });

    const occurrenceResponse = await app.inject({
      method: 'POST',
      url: '/v1/maintenance/occurrences',
      headers: bearer(tokens.operator),
      payload: {
        ativo_id: ids.asset,
        componente_id: null,
        tipo: 'FALHA_OPERACIONAL',
        titulo: 'Ruído anormal e equipamento parado',
        descricao: 'O equipamento apresentou ruído anormal e interrompeu a operação.',
        severidade: 'CRITICAL',
        equipamento_parado: true,
        tipo_parada: 'NAO_PLANEJADA',
        motivo_parada: 'Falha mecânica sob investigação.',
        ocorrida_em: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    assert.equal(occurrenceResponse.statusCode, 200, occurrenceResponse.body);
    const occurrence = occurrenceResponse.json().data;
    const occurrenceId: string = occurrence.id;
    const stopId: string = occurrence.parada.id;
    assert.equal(occurrence.status, 'OPEN');

    const assetStopped = await transaction(pool, async (client) =>
      client.query(`SELECT operational_status FROM cmms.assets WHERE id=$1`, [ids.asset]),
    );
    assert.equal(assetStopped.rows[0]!.operational_status, 'STOPPED');

    const notifications = await app.inject({
      method: 'GET',
      url: '/v1/notifications?somente_nao_lidas=true',
      headers: bearer(tokens.manager),
    });
    assert.equal(notifications.statusCode, 200, notifications.body);
    assert.equal(notifications.json().data.contadores.nao_lidas, 1);
    const notificationId: string = notifications.json().data.itens[0].id;
    assert.equal(notifications.json().data.itens[0].entidade_id, occurrenceId);

    const read = await app.inject({
      method: 'PATCH',
      url: `/v1/notifications/${notificationId}/read`,
      headers: bearer(tokens.manager),
    });
    assert.equal(read.statusCode, 200, read.body);
    const unreadAfterRead = await app.inject({
      method: 'GET',
      url: '/v1/notifications?somente_nao_lidas=true',
      headers: bearer(tokens.manager),
    });
    assert.equal(unreadAfterRead.json().data.contadores.nao_lidas, 0);
    assert.equal(unreadAfterRead.json().data.itens.length, 0);

    const analysis = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/occurrences/${occurrenceId}/technical-analysis`,
      headers: bearer(tokens.manager),
      payload: {
        titulo: 'Análise do ruído anormal',
        diagnostico: 'Inspeção preliminar indica desgaste no conjunto mecânico do acionamento.',
        risco: 'Risco de dano progressivo e parada prolongada.',
        causa_provavel: 'Desgaste de rolamento',
        recomendacao: 'Criar checklist de inspeção mecânica e plano de correção.',
        recomenda_checklist: true,
        recomenda_ordem_servico: true,
        prioridade: 'CRITICAL',
        relatorio: { origem: 'inspeção local', bloqueio_recomendado: true },
      },
    });
    assert.equal(analysis.statusCode, 200, analysis.body);
    assert.equal(analysis.json().data.status, 'IN_TREATMENT');
    assert.equal(analysis.json().data.tratamento_status, 'CHECKLIST_REQUESTED');

    const adminNotifications = await app.inject({
      method: 'GET',
      url: '/v1/notifications?somente_nao_lidas=true&contexto=TECHNICAL_ANALYSIS',
      headers: bearer(tokens.admin),
    });
    assert.equal(adminNotifications.statusCode, 200, adminNotifications.body);
    assert.equal(adminNotifications.json().data.itens.length, 1);

    for (const status of ['IN_MAINTENANCE', 'WAITING_OPERATIONAL_RETURN', 'COMPLETED'] as const) {
      const transition = await app.inject({
        method: 'POST',
        url: `/v1/maintenance/stops/${stopId}/transition`,
        headers: bearer(tokens.manager),
        payload: {
          status,
          categoria_retorno: status === 'COMPLETED' ? 'REPARO_CONFIRMADO' : null,
          justificativa_divergencia: null,
        },
      });
      assert.equal(transition.statusCode, 200, transition.body);
      assert.equal(transition.json().data.status, status);
    }

    const assetOperating = await transaction(pool, async (client) =>
      client.query(
        `SELECT asset.operational_status,
                (SELECT status FROM maintenance.operational_occurrences WHERE id=$2) AS occurrence_status
         FROM cmms.assets asset WHERE asset.id=$1`,
        [ids.asset, occurrenceId],
      ),
    );
    assert.equal(assetOperating.rows[0]!.operational_status, 'OPERATING');
    assert.equal(assetOperating.rows[0]!.occurrence_status, 'RESOLVED');

    await transaction(pool, async (client) => {
      await client.query(
        `INSERT INTO maintenance.operational_alerts
         (id,tenant_id,asset_id,alert_type,severity,title,message,status,deduplication_key,first_detected_at,last_detected_at)
         VALUES ($1,$2,$3,'PARAMETER_OUT_OF_RANGE','HIGH','Temperatura elevada',
                 'Temperatura acima do limite técnico.','OPEN',$4,clock_timestamp(),clock_timestamp())`,
        [ids.alert, tenantId, ids.asset, `alert-${ids.alert}`],
      );
    });

    const acknowledged = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/alerts/${ids.alert}/acknowledge`,
      headers: bearer(tokens.manager),
    });
    assert.equal(acknowledged.statusCode, 200, acknowledged.body);
    assert.equal(acknowledged.json().data.status, 'ACKNOWLEDGED');

    const alertOccurrence = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/alerts/${ids.alert}/create-occurrence`,
      headers: bearer(tokens.manager),
      payload: { equipamento_parado: false },
    });
    assert.equal(alertOccurrence.statusCode, 200, alertOccurrence.body);
    assert.equal(alertOccurrence.json().data.titulo, 'Temperatura elevada');

    const analytics = await app.inject({
      method: 'GET',
      url: `/v1/analytics/technical-summary?inicio=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&fim=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}&ativo_id=${ids.asset}`,
      headers: bearer(tokens.manager),
    });
    assert.equal(analytics.statusCode, 200, analytics.body);
    assert.equal(analytics.json().data.resumo.total_assets, 1);
    assert.equal(analytics.json().data.resumo.falhas_nao_planejadas, 1);
    assert.equal(analytics.json().data.ranking_ativos.length, 1);
    assert.equal('oee' in analytics.json().data.resumo, false);

    const invalidTransition = await app.inject({
      method: 'POST',
      url: `/v1/maintenance/stops/${stopId}/transition`,
      headers: bearer(tokens.manager),
      payload: {
        status: 'IN_MAINTENANCE',
        categoria_retorno: null,
        justificativa_divergencia: null,
      },
    });
    assert.equal(invalidTransition.statusCode, 409, invalidTransition.body);
    assert.equal(invalidTransition.json().error.code, 'INVALID_STOP_TRANSITION');
  },
);

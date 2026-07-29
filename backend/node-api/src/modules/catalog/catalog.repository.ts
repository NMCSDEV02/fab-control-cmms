import type { PoolClient, QueryResultRow } from 'pg';

import type {
  AssetInput,
  AssetListQuery,
  ComponentInput,
  MaterialInput,
  MaterialListQuery,
  ParameterDefinitionInput,
  ParameterPolicyInput,
  ParameterReadingInput,
  ReadingListQuery,
  RequestAuditMetadata,
} from './catalog.types.js';

interface CountRow extends QueryResultRow {
  count: string;
}

interface CatalogRow extends QueryResultRow {
  [column: string]: unknown;
  id: string;
}

export interface AssetCursorRow extends CatalogRow {
  created_at: Date;
}

interface ParameterContextRow extends QueryResultRow {
  id: string;
  asset_id: string;
  component_id: string | null;
  code: string;
  name: string;
  unit: string;
  value_type: 'DECIMAL' | 'INTEGER' | 'BOOLEAN' | 'TEXT';
  source_type: string;
  status: string;
  policy_id: string | null;
  policy_version: number | null;
  warning_min: string | null;
  warning_max: string | null;
  critical_min: string | null;
  critical_max: string | null;
}

interface ReadingRow extends CatalogRow {
  classificacao:
    | 'NORMAL'
    | 'WARNING_LOW'
    | 'WARNING_HIGH'
    | 'CRITICAL_LOW'
    | 'CRITICAL_HIGH'
    | 'UNCLASSIFIED';
}

function requireRow<T extends QueryResultRow>(rows: readonly T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

export class CatalogRepository {
  async listPlants(client: PoolClient, status: string | null): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT id, tag, name AS nome, status, created_at, updated_at
        FROM cmms.plants
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
        ORDER BY name, id
      `,
      [status],
    );
    return result.rows;
  }

  async listSectors(client: PoolClient, status: string | null): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT id, plant_id AS planta_id, tag, name AS nome, status, created_at, updated_at
        FROM cmms.sectors
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
        ORDER BY name, id
      `,
      [status],
    );
    return result.rows;
  }

  async listLines(client: PoolClient, status: string | null): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT id, sector_id AS setor_id, tag, name AS nome, status, created_at, updated_at
        FROM cmms.lines
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR status = $1)
        ORDER BY name, id
      `,
      [status],
    );
    return result.rows;
  }

  async findPlant(client: PoolClient, id: string, lock = false): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT id, tag, name AS nome, status, created_at, updated_at
        FROM cmms.plants
        WHERE id = $1 AND deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findSector(client: PoolClient, id: string, lock = false): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT id, plant_id AS planta_id, tag, name AS nome, status, created_at, updated_at
        FROM cmms.sectors
        WHERE id = $1 AND deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findLine(client: PoolClient, id: string, lock = false): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT id, sector_id AS setor_id, tag, name AS nome, status, created_at, updated_at
        FROM cmms.lines
        WHERE id = $1 AND deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async createPlant(
    client: PoolClient,
    tenantId: string,
    id: string,
    tag: string,
    name: string,
  ): Promise<CatalogRow> {
    const result = await client.query<CatalogRow>(
      `
        INSERT INTO cmms.plants (id, tenant_id, tag, name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, tag, name AS nome, status, created_at, updated_at
      `,
      [id, tenantId, tag, name],
    );
    return requireRow(result.rows, 'O PostgreSQL não retornou a planta criada.');
  }

  async updatePlant(
    client: PoolClient,
    id: string,
    tag: string,
    name: string,
    status: string,
  ): Promise<CatalogRow> {
    const result = await client.query<CatalogRow>(
      `
        UPDATE cmms.plants
        SET tag = $2, name = $3, status = $4
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, tag, name AS nome, status, created_at, updated_at
      `,
      [id, tag, name, status],
    );
    return requireRow(result.rows, 'O PostgreSQL não retornou a planta alterada.');
  }

  async countActiveSectors(client: PoolClient, plantId: string): Promise<number> {
    const result = await client.query<CountRow>(
      `
        SELECT count(*)::text AS count
        FROM cmms.sectors
        WHERE plant_id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL
      `,
      [plantId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async createSector(
    client: PoolClient,
    tenantId: string,
    id: string,
    plantId: string,
    tag: string,
    name: string,
  ): Promise<CatalogRow> {
    const result = await client.query<CatalogRow>(
      `
        INSERT INTO cmms.sectors (id, tenant_id, plant_id, tag, name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, plant_id AS planta_id, tag, name AS nome, status, created_at, updated_at
      `,
      [id, tenantId, plantId, tag, name],
    );
    return requireRow(result.rows, 'O PostgreSQL não retornou o setor criado.');
  }

  async updateSector(
    client: PoolClient,
    id: string,
    plantId: string,
    tag: string,
    name: string,
    status: string,
  ): Promise<CatalogRow> {
    const result = await client.query<CatalogRow>(
      `
        UPDATE cmms.sectors
        SET plant_id = $2, tag = $3, name = $4, status = $5
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, plant_id AS planta_id, tag, name AS nome, status, created_at, updated_at
      `,
      [id, plantId, tag, name, status],
    );
    return requireRow(result.rows, 'O PostgreSQL não retornou o setor alterado.');
  }

  async countActiveLines(client: PoolClient, sectorId: string): Promise<number> {
    const result = await client.query<CountRow>(
      `
        SELECT count(*)::text AS count
        FROM cmms.lines
        WHERE sector_id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL
      `,
      [sectorId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async createLine(
    client: PoolClient,
    tenantId: string,
    id: string,
    sectorId: string,
    tag: string,
    name: string,
  ): Promise<CatalogRow> {
    const result = await client.query<CatalogRow>(
      `
        INSERT INTO cmms.lines (id, tenant_id, sector_id, tag, name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, sector_id AS setor_id, tag, name AS nome, status, created_at, updated_at
      `,
      [id, tenantId, sectorId, tag, name],
    );
    return requireRow(result.rows, 'O PostgreSQL não retornou a linha criada.');
  }

  async updateLine(
    client: PoolClient,
    id: string,
    sectorId: string,
    tag: string,
    name: string,
    status: string,
  ): Promise<CatalogRow> {
    const result = await client.query<CatalogRow>(
      `
        UPDATE cmms.lines
        SET sector_id = $2, tag = $3, name = $4, status = $5
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, sector_id AS setor_id, tag, name AS nome, status, created_at, updated_at
      `,
      [id, sectorId, tag, name, status],
    );
    return requireRow(result.rows, 'O PostgreSQL não retornou a linha alterada.');
  }

  async countActiveAssets(client: PoolClient, lineId: string): Promise<number> {
    const result = await client.query<CountRow>(
      `
        SELECT count(*)::text AS count
        FROM cmms.assets
        WHERE line_id = $1 AND lifecycle_status = 'ACTIVE' AND deleted_at IS NULL
      `,
      [lineId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async listAssets(client: PoolClient, query: AssetListQuery): Promise<readonly AssetCursorRow[]> {
    const searchPattern = query.search ? `%${query.search}%` : null;
    const result = await client.query<AssetCursorRow>(
      `
        SELECT
          asset.id,
          asset.tag,
          asset.name AS nome,
          asset.asset_type AS tipo,
          asset.criticality AS criticidade,
          asset.operational_status AS status_operacional,
          asset.lifecycle_status AS status_ciclo_vida,
          asset.health_percent AS saude_percentual,
          asset.current_hour_meter AS horimetro_atual,
          asset.technical_location AS localizacao_tecnica,
          asset.created_at,
          asset.updated_at,
          line.id AS linha_id,
          line.name AS linha_nome,
          sector.id AS setor_id,
          sector.name AS setor_nome,
          plant.id AS planta_id,
          plant.name AS planta_nome
        FROM cmms.assets asset
        JOIN cmms.lines line ON line.id = asset.line_id
        JOIN cmms.sectors sector ON sector.id = line.sector_id
        JOIN cmms.plants plant ON plant.id = sector.plant_id
        WHERE asset.deleted_at IS NULL
          AND (
            $1::text IS NULL
            OR asset.tag ILIKE $1
            OR asset.name ILIKE $1
            OR asset.asset_type ILIKE $1
            OR asset.technical_location ILIKE $1
            OR line.name ILIKE $1
            OR sector.name ILIKE $1
            OR plant.name ILIKE $1
          )
          AND ($2::uuid IS NULL OR plant.id = $2)
          AND ($3::uuid IS NULL OR sector.id = $3)
          AND ($4::uuid IS NULL OR line.id = $4)
          AND ($5::text IS NULL OR asset.operational_status = $5)
          AND ($6::text IS NULL OR asset.lifecycle_status = $6)
          AND (
            $7::timestamptz IS NULL
            OR (asset.created_at, asset.id) < ($7, $8::uuid)
          )
        ORDER BY asset.created_at DESC, asset.id DESC
        LIMIT $9
      `,
      [
        searchPattern,
        query.plantId,
        query.sectorId,
        query.lineId,
        query.operationalStatus,
        query.lifecycleStatus,
        query.cursorCreatedAt,
        query.cursorId,
        query.limit + 1,
      ],
    );
    return result.rows;
  }

  async findAsset(client: PoolClient, id: string, lock = false): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          asset.id,
          asset.line_id AS linha_id,
          asset.tag,
          asset.qr_payload,
          asset.name AS nome,
          asset.asset_type AS tipo,
          asset.criticality AS criticidade,
          asset.operational_status AS status_operacional,
          asset.lifecycle_status AS status_ciclo_vida,
          asset.health_percent AS saude_percentual,
          asset.current_hour_meter AS horimetro_atual,
          asset.hour_meter_mode AS modo_horimetro,
          asset.manufacturer AS fabricante,
          asset.model AS modelo,
          asset.serial_number AS numero_serie,
          asset.technical_location AS localizacao_tecnica,
          asset.metadata AS metadados,
          asset.created_at,
          asset.updated_at
        FROM cmms.assets asset
        WHERE asset.id = $1 AND asset.deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async createAsset(
    client: PoolClient,
    tenantId: string,
    id: string,
    qrPayload: string,
    input: AssetInput,
  ): Promise<CatalogRow> {
    await client.query(
      `
        INSERT INTO cmms.assets (
          id, tenant_id, line_id, tag, qr_payload, name, asset_type, criticality,
          operational_status, lifecycle_status, health_percent, current_hour_meter,
          hour_meter_mode, hour_meter_updated_at, manufacturer, model, serial_number,
          technical_location, metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          CASE WHEN $12::numeric IS NULL THEN NULL ELSE clock_timestamp() END,
          $14, $15, $16, $17, $18
        )
      `,
      [
        id,
        tenantId,
        input.lineId,
        input.tag,
        qrPayload,
        input.name,
        input.assetType,
        input.criticality,
        input.operationalStatus,
        input.lifecycleStatus,
        input.healthPercent,
        input.currentHourMeter,
        input.hourMeterMode,
        input.manufacturer,
        input.model,
        input.serialNumber,
        input.technicalLocation,
        JSON.stringify(input.metadata),
      ],
    );
    const created = await this.findAsset(client, id);
    if (!created) throw new Error('O ativo criado não foi encontrado.');
    return created;
  }

  async updateAsset(client: PoolClient, id: string, input: AssetInput): Promise<CatalogRow> {
    await client.query(
      `
        UPDATE cmms.assets
        SET
          line_id = $2,
          tag = $3,
          name = $4,
          asset_type = $5,
          criticality = $6,
          operational_status = $7,
          lifecycle_status = $8,
          health_percent = $9,
          current_hour_meter = $10,
          hour_meter_mode = $11,
          hour_meter_updated_at = CASE
            WHEN current_hour_meter IS DISTINCT FROM $10 THEN clock_timestamp()
            ELSE hour_meter_updated_at
          END,
          manufacturer = $12,
          model = $13,
          serial_number = $14,
          technical_location = $15,
          metadata = $16
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        id,
        input.lineId,
        input.tag,
        input.name,
        input.assetType,
        input.criticality,
        input.operationalStatus,
        input.lifecycleStatus,
        input.healthPercent,
        input.currentHourMeter,
        input.hourMeterMode,
        input.manufacturer,
        input.model,
        input.serialNumber,
        input.technicalLocation,
        JSON.stringify(input.metadata),
      ],
    );
    const updated = await this.findAsset(client, id);
    if (!updated) throw new Error('O ativo alterado não foi encontrado.');
    return updated;
  }

  async countActiveComponents(client: PoolClient, assetId: string): Promise<number> {
    const result = await client.query<CountRow>(
      `
        SELECT count(*)::text AS count
        FROM cmms.components
        WHERE asset_id = $1 AND lifecycle_status = 'ACTIVE' AND deleted_at IS NULL
      `,
      [assetId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async listComponents(client: PoolClient, assetId: string): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          id, asset_id AS ativo_id, tag, qr_payload, name AS nome,
          component_type AS tipo, criticality AS criticidade,
          operational_status AS status_operacional,
          lifecycle_status AS status_ciclo_vida,
          useful_life_hours AS vida_util_horas,
          useful_life_days AS vida_util_dias,
          accumulated_hours AS horas_acumuladas,
          installed_at AS instalado_em,
          manufacturer AS fabricante,
          model AS modelo,
          serial_number AS numero_serie,
          technical_location AS localizacao_tecnica,
          metadata AS metadados,
          created_at,
          updated_at
        FROM cmms.components
        WHERE asset_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
      `,
      [assetId],
    );
    return result.rows;
  }

  async findComponent(client: PoolClient, id: string, lock = false): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          id, asset_id AS ativo_id, tag, qr_payload, name AS nome,
          component_type AS tipo, criticality AS criticidade,
          operational_status AS status_operacional,
          lifecycle_status AS status_ciclo_vida,
          useful_life_hours AS vida_util_horas,
          useful_life_days AS vida_util_dias,
          accumulated_hours AS horas_acumuladas,
          installed_at AS instalado_em,
          manufacturer AS fabricante,
          model AS modelo,
          serial_number AS numero_serie,
          technical_location AS localizacao_tecnica,
          metadata AS metadados,
          created_at,
          updated_at
        FROM cmms.components
        WHERE id = $1 AND deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async createComponent(
    client: PoolClient,
    tenantId: string,
    id: string,
    qrPayload: string,
    input: ComponentInput,
  ): Promise<CatalogRow> {
    await client.query(
      `
        INSERT INTO cmms.components (
          id, tenant_id, asset_id, tag, qr_payload, name, component_type,
          criticality, operational_status, lifecycle_status, useful_life_hours,
          useful_life_days, accumulated_hours, installed_at, manufacturer, model,
          serial_number, technical_location, metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19
        )
      `,
      [
        id,
        tenantId,
        input.assetId,
        input.tag,
        qrPayload,
        input.name,
        input.componentType,
        input.criticality,
        input.operationalStatus,
        input.lifecycleStatus,
        input.usefulLifeHours,
        input.usefulLifeDays,
        input.accumulatedHours,
        input.installedAt,
        input.manufacturer,
        input.model,
        input.serialNumber,
        input.technicalLocation,
        JSON.stringify(input.metadata),
      ],
    );
    const created = await this.findComponent(client, id);
    if (!created) throw new Error('O componente criado não foi encontrado.');
    return created;
  }

  async updateComponent(
    client: PoolClient,
    id: string,
    input: ComponentInput,
  ): Promise<CatalogRow> {
    await client.query(
      `
        UPDATE cmms.components
        SET
          asset_id = $2,
          tag = $3,
          name = $4,
          component_type = $5,
          criticality = $6,
          operational_status = $7,
          lifecycle_status = $8,
          useful_life_hours = $9,
          useful_life_days = $10,
          accumulated_hours = $11,
          installed_at = $12,
          manufacturer = $13,
          model = $14,
          serial_number = $15,
          technical_location = $16,
          metadata = $17
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        id,
        input.assetId,
        input.tag,
        input.name,
        input.componentType,
        input.criticality,
        input.operationalStatus,
        input.lifecycleStatus,
        input.usefulLifeHours,
        input.usefulLifeDays,
        input.accumulatedHours,
        input.installedAt,
        input.manufacturer,
        input.model,
        input.serialNumber,
        input.technicalLocation,
        JSON.stringify(input.metadata),
      ],
    );
    const updated = await this.findComponent(client, id);
    if (!updated) throw new Error('O componente alterado não foi encontrado.');
    return updated;
  }

  async listMaterials(
    client: PoolClient,
    query: MaterialListQuery,
  ): Promise<readonly AssetCursorRow[]> {
    const result = await client.query<AssetCursorRow>(
      `
        SELECT
          id, sku, name AS nome, unit AS unidade,
          current_stock AS estoque_atual,
          minimum_stock AS estoque_minimo,
          current_stock <= minimum_stock AS abaixo_minimo,
          status, created_at, updated_at
        FROM cmms.materials
        WHERE deleted_at IS NULL
          AND (
            $1::text = ''
            OR sku ILIKE '%' || $1 || '%'
            OR name ILIKE '%' || $1 || '%'
          )
          AND ($2::text IS NULL OR status = $2)
          AND (
            $3::boolean IS NULL
            OR (current_stock <= minimum_stock) = $3
          )
          AND (
            $4::timestamptz IS NULL
            OR (created_at, id) < ($4, $5::uuid)
          )
        ORDER BY created_at DESC, id DESC
        LIMIT $6
      `,
      [
        query.search,
        query.status,
        query.belowMinimum,
        query.cursorCreatedAt,
        query.cursorId,
        query.limit + 1,
      ],
    );
    return result.rows;
  }

  async findMaterial(client: PoolClient, id: string, lock = false): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          id, sku, name AS nome, unit AS unidade,
          current_stock AS estoque_atual,
          minimum_stock AS estoque_minimo,
          current_stock <= minimum_stock AS abaixo_minimo,
          status, created_at, updated_at
        FROM cmms.materials
        WHERE id = $1 AND deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async createMaterial(
    client: PoolClient,
    tenantId: string,
    id: string,
    input: MaterialInput,
  ): Promise<CatalogRow> {
    await client.query(
      `
        INSERT INTO cmms.materials (
          id, tenant_id, sku, name, unit, current_stock, minimum_stock, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        tenantId,
        input.sku,
        input.name,
        input.unit,
        input.currentStock,
        input.minimumStock,
        input.status,
      ],
    );
    const created = await this.findMaterial(client, id);
    if (!created) throw new Error('O material criado não foi encontrado.');
    return created;
  }

  async updateMaterial(client: PoolClient, id: string, input: MaterialInput): Promise<CatalogRow> {
    await client.query(
      `
        UPDATE cmms.materials
        SET
          sku = $2,
          name = $3,
          unit = $4,
          current_stock = $5,
          minimum_stock = $6,
          status = $7
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id, input.sku, input.name, input.unit, input.currentStock, input.minimumStock, input.status],
    );
    const updated = await this.findMaterial(client, id);
    if (!updated) throw new Error('O material alterado não foi encontrado.');
    return updated;
  }

  async findParameter(client: PoolClient, id: string, lock = false): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          id, asset_id AS ativo_id, component_id AS componente_id, code AS codigo,
          name AS nome, unit AS unidade, value_type AS tipo_valor,
          source_type AS tipo_origem, description AS descricao, status,
          metadata AS metadados, created_at, updated_at
        FROM cmms.parameter_definitions
        WHERE id = $1 AND deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async createParameter(
    client: PoolClient,
    tenantId: string,
    id: string,
    input: ParameterDefinitionInput,
  ): Promise<CatalogRow> {
    await client.query(
      `
        INSERT INTO cmms.parameter_definitions (
          id, tenant_id, asset_id, component_id, code, name, unit, value_type,
          source_type, description, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        id,
        tenantId,
        input.assetId,
        input.componentId,
        input.code,
        input.name,
        input.unit,
        input.valueType,
        input.sourceType,
        input.description,
        JSON.stringify(input.metadata),
      ],
    );
    const created = await this.findParameter(client, id);
    if (!created) throw new Error('O parâmetro criado não foi encontrado.');
    return created;
  }

  async updateParameter(
    client: PoolClient,
    id: string,
    input: ParameterDefinitionInput & { readonly status: string },
  ): Promise<CatalogRow> {
    await client.query(
      `
        UPDATE cmms.parameter_definitions
        SET
          code = $2,
          name = $3,
          unit = $4,
          value_type = $5,
          source_type = $6,
          description = $7,
          status = $8,
          metadata = $9
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        id,
        input.code,
        input.name,
        input.unit,
        input.valueType,
        input.sourceType,
        input.description,
        input.status,
        JSON.stringify(input.metadata),
      ],
    );
    const updated = await this.findParameter(client, id);
    if (!updated) throw new Error('O parâmetro alterado não foi encontrado.');
    return updated;
  }

  async getParameterContext(
    client: PoolClient,
    parameterId: string,
    lock = false,
  ): Promise<ParameterContextRow | null> {
    const result = await client.query<ParameterContextRow>(
      `
        SELECT
          definition.id,
          definition.asset_id,
          definition.component_id,
          definition.code,
          definition.name,
          definition.unit,
          definition.value_type,
          definition.source_type,
          definition.status,
          policy.id AS policy_id,
          policy.version AS policy_version,
          policy.warning_min,
          policy.warning_max,
          policy.critical_min,
          policy.critical_max
        FROM cmms.parameter_definitions definition
        LEFT JOIN cmms.parameter_policies policy
          ON policy.parameter_definition_id = definition.id
         AND policy.status = 'ACTIVE'
        WHERE definition.id = $1
          AND definition.deleted_at IS NULL
        ${lock ? 'FOR UPDATE OF definition' : ''}
      `,
      [parameterId],
    );
    return result.rows[0] ?? null;
  }

  async publishPolicy(
    client: PoolClient,
    tenantId: string,
    parameter: ParameterContextRow,
    userId: string,
    contentHash: string,
    input: ParameterPolicyInput,
  ): Promise<CatalogRow> {
    await client.query(
      `
        UPDATE cmms.parameter_policies
        SET
          status = 'SUPERSEDED',
          effective_until = clock_timestamp()
        WHERE parameter_definition_id = $1
          AND status = 'ACTIVE'
      `,
      [parameter.id],
    );
    const result = await client.query<CatalogRow>(
      `
        INSERT INTO cmms.parameter_policies (
          tenant_id, parameter_definition_id, version, warning_min, warning_max,
          critical_min, critical_max, validation_rule, effective_from, status,
          content_hash_sha256, created_by, approved_by, approved_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp(), 'ACTIVE',
          $9, $10, $10, clock_timestamp()
        )
        RETURNING
          id, parameter_definition_id AS parametro_id, version AS versao,
          warning_min AS alerta_minimo, warning_max AS alerta_maximo,
          critical_min AS critico_minimo, critical_max AS critico_maximo,
          validation_rule AS regra_validacao, effective_from AS vigente_desde,
          status, content_hash_sha256, approved_at AS aprovado_em
      `,
      [
        tenantId,
        parameter.id,
        (parameter.policy_version ?? 0) + 1,
        input.warningMin,
        input.warningMax,
        input.criticalMin,
        input.criticalMax,
        JSON.stringify(input.validationRule),
        contentHash,
        userId,
      ],
    );
    return requireRow(result.rows, 'O PostgreSQL não retornou a política publicada.');
  }

  async createReading(
    client: PoolClient,
    tenantId: string,
    userId: string,
    parameter: ParameterContextRow,
    input: ParameterReadingInput,
  ): Promise<{ readonly reading: ReadingRow; readonly created: boolean }> {
    const inserted = await client.query<ReadingRow>(
      `
        INSERT INTO cmms.parameter_readings (
          tenant_id, parameter_definition_id, parameter_policy_id, numeric_value,
          text_value, boolean_value, unit, source, source_entity_type,
          source_entity_id, recorded_by, recorded_at, raw_value, idempotency_key, metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (tenant_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING
          id, parameter_definition_id AS parametro_id, parameter_policy_id AS politica_id,
          numeric_value AS valor_numerico, text_value AS valor_texto,
          boolean_value AS valor_booleano, unit AS unidade, classification AS classificacao,
          source AS origem, recorded_by AS registrado_por, recorded_at AS registrado_em,
          raw_value AS valor_bruto, idempotency_key AS chave_idempotencia,
          metadata AS metadados, created_at
      `,
      [
        tenantId,
        parameter.id,
        parameter.policy_id,
        input.numericValue,
        input.textValue,
        input.booleanValue,
        parameter.unit,
        input.source,
        input.sourceEntityType,
        input.sourceEntityId,
        userId,
        input.recordedAt,
        input.rawValue,
        input.idempotencyKey,
        JSON.stringify(input.metadata),
      ],
    );
    if (inserted.rows[0]) return { reading: inserted.rows[0], created: true };

    const existing = await client.query<ReadingRow>(
      `
        SELECT
          id, parameter_definition_id AS parametro_id, parameter_policy_id AS politica_id,
          numeric_value AS valor_numerico, text_value AS valor_texto,
          boolean_value AS valor_booleano, unit AS unidade, classification AS classificacao,
          source AS origem, recorded_by AS registrado_por, recorded_at AS registrado_em,
          raw_value AS valor_bruto, idempotency_key AS chave_idempotencia,
          metadata AS metadados, created_at
        FROM cmms.parameter_readings
        WHERE idempotency_key = $1
      `,
      [input.idempotencyKey],
    );
    return {
      reading: requireRow(existing.rows, 'A leitura idempotente não foi encontrada.'),
      created: false,
    };
  }

  async createOrRefreshParameterAlert(
    client: PoolClient,
    tenantId: string,
    parameter: ParameterContextRow,
    reading: ReadingRow,
  ): Promise<void> {
    if (reading.classificacao === 'NORMAL' || reading.classificacao === 'UNCLASSIFIED') return;

    const critical = reading.classificacao.startsWith('CRITICAL');
    const direction = reading.classificacao.endsWith('LOW') ? 'LOW' : 'HIGH';
    const severity = critical ? 'CRITICAL' : 'MEDIUM';
    const deduplicationKey = `parameter:${parameter.id}:${direction}`;
    const title = `${parameter.name}: leitura ${direction === 'LOW' ? 'baixa' : 'alta'}`;

    await client.query(
      `
        INSERT INTO maintenance.operational_alerts (
          tenant_id, asset_id, component_id, parameter_reading_id, alert_type,
          severity, title, message, deduplication_key, first_detected_at,
          last_detected_at, metadata
        )
        VALUES (
          $1, $2, $3, $4, 'PARAMETER_OUT_OF_RANGE', $5, $6, $7, $8,
          clock_timestamp(), clock_timestamp(), $9
        )
        ON CONFLICT (tenant_id, deduplication_key)
          WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'IN_TREATMENT')
        DO UPDATE SET
          parameter_reading_id = EXCLUDED.parameter_reading_id,
          severity = EXCLUDED.severity,
          title = EXCLUDED.title,
          message = EXCLUDED.message,
          last_detected_at = clock_timestamp(),
          metadata = EXCLUDED.metadata
      `,
      [
        tenantId,
        parameter.asset_id,
        parameter.component_id,
        reading.id,
        severity,
        title,
        `O parâmetro ${parameter.code} registrou uma leitura ${reading.classificacao}.`,
        deduplicationKey,
        JSON.stringify({
          classification: reading.classificacao,
          parameterCode: parameter.code,
        }),
      ],
    );
  }

  async listReadings(
    client: PoolClient,
    parameterId: string,
    query: ReadingListQuery,
  ): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          reading.id,
          reading.parameter_definition_id AS parametro_id,
          reading.parameter_policy_id AS politica_id,
          reading.numeric_value AS valor_numerico,
          reading.text_value AS valor_texto,
          reading.boolean_value AS valor_booleano,
          reading.unit AS unidade,
          reading.classification AS classificacao,
          reading.source AS origem,
          reading.recorded_by AS registrado_por,
          user_account.name AS registrado_por_nome,
          reading.recorded_at AS registrado_em,
          reading.raw_value AS valor_bruto,
          reading.metadata AS metadados,
          reading.created_at
        FROM cmms.parameter_readings reading
        LEFT JOIN iam.users user_account ON user_account.id = reading.recorded_by
        WHERE reading.parameter_definition_id = $1
          AND ($2::timestamptz IS NULL OR reading.recorded_at < $2)
          AND ($3::text IS NULL OR reading.classification = $3)
        ORDER BY reading.recorded_at DESC, reading.id DESC
        LIMIT $4
      `,
      [parameterId, query.before, query.classification, query.limit],
    );
    return result.rows;
  }

  async resolveCode(client: PoolClient, code: string): Promise<CatalogRow | null> {
    const result = await client.query<CatalogRow>(
      `
        SELECT *
        FROM (
          SELECT
            asset.id,
            'ASSET'::text AS tipo_registro,
            asset.id AS ativo_id,
            NULL::uuid AS componente_id,
            asset.tag,
            asset.qr_payload,
            asset.name AS nome,
            asset.operational_status AS status_operacional,
            asset.lifecycle_status AS status_ciclo_vida
          FROM cmms.assets asset
          WHERE asset.deleted_at IS NULL
            AND (upper(asset.tag) = upper($1) OR asset.qr_payload = $1)

          UNION ALL

          SELECT
            component.id,
            'COMPONENT'::text AS tipo_registro,
            component.asset_id AS ativo_id,
            component.id AS componente_id,
            component.tag,
            component.qr_payload,
            component.name AS nome,
            component.operational_status AS status_operacional,
            component.lifecycle_status AS status_ciclo_vida
          FROM cmms.components component
          WHERE component.deleted_at IS NULL
            AND (upper(component.tag) = upper($1) OR component.qr_payload = $1)
        ) resolved
        LIMIT 1
      `,
      [code],
    );
    return result.rows[0] ?? null;
  }

  async getAssetParameters(client: PoolClient, assetId: string): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          definition.id,
          definition.asset_id AS ativo_id,
          definition.component_id AS componente_id,
          component.name AS componente_nome,
          definition.code AS codigo,
          definition.name AS nome,
          definition.unit AS unidade,
          definition.value_type AS tipo_valor,
          definition.source_type AS tipo_origem,
          definition.status,
          policy.id AS politica_id,
          policy.version AS politica_versao,
          policy.warning_min AS alerta_minimo,
          policy.warning_max AS alerta_maximo,
          policy.critical_min AS critico_minimo,
          policy.critical_max AS critico_maximo,
          latest.numeric_value AS ultimo_valor_numerico,
          latest.text_value AS ultimo_valor_texto,
          latest.boolean_value AS ultimo_valor_booleano,
          latest.classification AS ultima_classificacao,
          latest.recorded_at AS ultima_leitura_em
        FROM cmms.parameter_definitions definition
        LEFT JOIN cmms.components component ON component.id = definition.component_id
        LEFT JOIN cmms.parameter_policies policy
          ON policy.parameter_definition_id = definition.id
         AND policy.status = 'ACTIVE'
        LEFT JOIN LATERAL (
          SELECT
            reading.numeric_value,
            reading.text_value,
            reading.boolean_value,
            reading.classification,
            reading.recorded_at
          FROM cmms.parameter_readings reading
          WHERE reading.parameter_definition_id = definition.id
          ORDER BY reading.recorded_at DESC, reading.id DESC
          LIMIT 1
        ) latest ON true
        WHERE definition.asset_id = $1
          AND definition.deleted_at IS NULL
        ORDER BY definition.name, definition.id
      `,
      [assetId],
    );
    return result.rows;
  }

  async getAssetHistory(client: PoolClient, assetId: string): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          history.id,
          history.component_id AS componente_id,
          history.event_type AS tipo_evento,
          history.description AS descricao,
          history.user_id AS usuario_id,
          user_account.name AS usuario_nome,
          history.role_snapshot AS perfil,
          history.payload AS dados,
          history.occurred_at AS ocorrido_em
        FROM maintenance.history_events history
        LEFT JOIN iam.users user_account ON user_account.id = history.user_id
        WHERE history.asset_id = $1
        ORDER BY history.occurred_at DESC, history.id DESC
        LIMIT 100
      `,
      [assetId],
    );
    return result.rows;
  }

  async getAssetAlerts(client: PoolClient, assetId: string): Promise<readonly CatalogRow[]> {
    const result = await client.query<CatalogRow>(
      `
        SELECT
          id, component_id AS componente_id, parameter_reading_id AS leitura_id,
          alert_type AS tipo, severity AS severidade, title AS titulo, message AS mensagem,
          status, first_detected_at AS detectado_em,
          last_detected_at AS ultima_deteccao_em, metadata AS metadados
        FROM maintenance.operational_alerts
        WHERE asset_id = $1
          AND status IN ('OPEN', 'ACKNOWLEDGED', 'IN_TREATMENT')
        ORDER BY
          CASE severity
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4
            ELSE 5
          END,
          last_detected_at DESC
      `,
      [assetId],
    );
    return result.rows;
  }

  async writeHistory(
    client: PoolClient,
    tenantId: string,
    userId: string,
    roleSnapshot: string,
    assetId: string,
    componentId: string | null,
    eventType: string,
    description: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO maintenance.history_events (
          tenant_id, asset_id, component_id, event_type, description,
          user_id, role_snapshot, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        tenantId,
        assetId,
        componentId,
        eventType,
        description,
        userId,
        roleSnapshot,
        JSON.stringify(payload),
      ],
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
    beforeData: Readonly<Record<string, unknown>> | null,
    afterData: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO audit.events (
          tenant_id, user_id, role_snapshot, action, entity_type, entity_id,
          before_data, after_data, redacted_fields, trace_id, source,
          user_agent, ip_address
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, ARRAY[]::text[],
          $9, 'APPLICATION', $10, $11
        )
      `,
      [
        tenantId,
        userId,
        metadata.roleSnapshot,
        action,
        entityType,
        entityId,
        beforeData ? JSON.stringify(beforeData) : null,
        JSON.stringify(afterData),
        metadata.traceId,
        metadata.userAgent,
        metadata.ipAddress,
      ],
    );
  }
}

export type { CatalogRow, ParameterContextRow, ReadingRow };

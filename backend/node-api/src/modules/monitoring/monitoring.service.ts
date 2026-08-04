import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { AppError } from '../../core/errors/app-error.js';
import type { Database } from '../../infrastructure/database/database.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { MonitoringRepository, type MonitoringRow } from './monitoring.repository.js';
import type {
  AlertListQuery,
  AnalyticsQuery,
  CreateOccurrenceInput,
  CreateStopInput,
  NotificationListQuery,
  OccurrenceListQuery,
  RequestAuditMetadata,
  StopListQuery,
  StopStatus,
  TechnicalAnalysisInput,
  TransitionStopInput,
} from './monitoring.types.js';

function appError(code: string, message: string, statusCode: number, details?: unknown): AppError {
  return new AppError({ code, message, statusCode, ...(details === undefined ? {} : { details }) });
}

function text(row: MonitoringRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Campo ${key} ausente no contrato de monitoramento.`);
  }
  return value;
}

function dateTime(row: MonitoringRow, key: string): string {
  const value = row[key];
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) {
    return new Date(value).toISOString();
  }
  throw new Error(`Campo temporal ${key} ausente no contrato de monitoramento.`);
}

function nullableText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized.length > 0 ? normalized : null;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function isoDate(value: string | null, fallback: Date): string {
  const date = value === null ? fallback : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw appError('INVALID_DATE_TIME', 'A data informada não é válida.', 422);
  }
  return date.toISOString();
}

function roleSnapshot(user: AuthenticatedUser): string {
  return user.roles.join(',') || user.profile;
}

const stopTransitions: Readonly<Record<StopStatus, readonly StopStatus[]>> = {
  OPEN: ['WAITING_MAINTENANCE', 'IN_MAINTENANCE', 'CANCELLED'],
  WAITING_MAINTENANCE: ['IN_MAINTENANCE', 'CANCELLED'],
  IN_MAINTENANCE: ['WAITING_OPERATIONAL_RETURN', 'CANCELLED'],
  WAITING_OPERATIONAL_RETURN: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class MonitoringService {
  private readonly repository = new MonitoringRepository();

  constructor(private readonly database: Database) {}

  async listOccurrences(user: AuthenticatedUser, query: OccurrenceListQuery) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id, readOnly: true },
      async (client) => ({
        itens: await this.repository.listOccurrences(client, query),
        limite: query.limit,
      }),
    );
  }

  async getOccurrence(user: AuthenticatedUser, occurrenceId: string) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id, readOnly: true },
      async (client) => this.requiredOccurrenceDetail(client, occurrenceId),
    );
  }

  async createOccurrence(
    user: AuthenticatedUser,
    rawInput: CreateOccurrenceInput,
    audit: RequestAuditMetadata,
  ) {
    const input: CreateOccurrenceInput = {
      ...rawInput,
      occurrenceType: normalize(rawInput.occurrenceType).toUpperCase(),
      title: normalize(rawInput.title),
      description: rawInput.description.trim(),
      stopType: nullableText(rawInput.stopType)?.toUpperCase() ?? null,
      stopReason: nullableText(rawInput.stopReason),
      occurredAt: isoDate(rawInput.occurredAt, new Date()),
    };
    if (input.equipmentStopped && (!input.stopType || !input.stopReason)) {
      throw appError(
        'STOP_CONTEXT_REQUIRED',
        'Uma ocorrência com equipamento parado exige tipo e motivo da parada.',
        422,
      );
    }

    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        await this.requireActiveAssetContext(client, input.assetId, input.componentId);
        const occurrenceId = randomUUID();
        await this.repository.createOccurrence(
          client,
          user.tenantId,
          occurrenceId,
          user.id,
          roleSnapshot(user),
          input,
        );

        let stopId: string | null = null;
        if (input.equipmentStopped) {
          const existingStop = await this.repository.findOpenStopForAsset(
            client,
            input.assetId,
            true,
          );
          if (existingStop) {
            stopId = text(existingStop, 'id');
          } else {
            stopId = randomUUID();
            await this.repository.createStop(client, user.tenantId, stopId, user.id, {
              assetId: input.assetId,
              componentId: input.componentId,
              origin: 'OCCURRENCE',
              stopType: input.stopType ?? 'UNPLANNED',
              reason: input.stopReason ?? input.description,
              startedAt: input.occurredAt ?? new Date().toISOString(),
              returnToleranceMinutes: 10,
            });
          }
          await this.repository.attachStopToOccurrence(client, occurrenceId, stopId);
        }

        const detail = await this.requiredOccurrenceDetail(client, occurrenceId);
        await this.repository.writeHistory(
          client,
          user.tenantId,
          input.assetId,
          input.componentId,
          user.id,
          roleSnapshot(user),
          'OCCURRENCE_REPORTED',
          `Ocorrência registrada: ${input.title}`,
          { occurrenceId, stopId, severity: input.severity },
        );
        await this.repository.writeAudit(
          client,
          user.tenantId,
          user.id,
          audit,
          'OPERATIONAL_OCCURRENCE_CREATED',
          'OPERATIONAL_OCCURRENCE',
          occurrenceId,
          detail,
        );
        await this.notifyRoles(client, user, {
          type: 'OCCURRENCE_REPORTED',
          title: input.title,
          message: input.description,
          entityType: 'OPERATIONAL_OCCURRENCE',
          entityId: occurrenceId,
          priority: input.severity,
          actionRoute: `/maintenance/occurrences/${occurrenceId}`,
          deduplicationKey: `occurrence:${occurrenceId}:reported`,
          roles: ['ADMIN', 'MANAGER'],
        });
        return detail;
      },
    );
  }

  async createTechnicalAnalysis(
    user: AuthenticatedUser,
    occurrenceId: string,
    rawInput: TechnicalAnalysisInput,
    audit: RequestAuditMetadata,
  ) {
    const input: TechnicalAnalysisInput = {
      ...rawInput,
      title: normalize(rawInput.title),
      diagnosis: rawInput.diagnosis.trim(),
      risk: rawInput.risk.trim(),
      probableCause: nullableText(rawInput.probableCause),
      recommendation: rawInput.recommendation.trim(),
    };
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        const occurrence = await this.repository.findOccurrence(client, occurrenceId, true);
        if (!occurrence) {
          throw appError('OCCURRENCE_NOT_FOUND', 'Ocorrência não encontrada.', 404);
        }
        const status = text(occurrence, 'status');
        if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(status)) {
          throw appError(
            'OCCURRENCE_ALREADY_CLOSED',
            'A ocorrência encerrada não aceita uma nova análise.',
            409,
          );
        }
        if (occurrence.technical_analysis_id !== null) {
          throw appError(
            'TECHNICAL_ANALYSIS_ALREADY_EXISTS',
            'A ocorrência já possui análise técnica encaminhada.',
            409,
          );
        }
        const context = await this.repository.technicalContext(client, user.id);
        if (!context) {
          throw appError(
            'TECHNICAL_ASSIGNMENT_REQUIRED',
            'O usuário precisa de uma atribuição técnica ativa para emitir a análise.',
            403,
          );
        }
        const analysisId = randomUUID();
        await this.repository.createTechnicalAnalysis(
          client,
          user.tenantId,
          analysisId,
          occurrence,
          user.id,
          text(context, 'technical_area_id'),
          typeof context.technical_role_id === 'string' ? context.technical_role_id : null,
          input,
        );
        const detail = await this.requiredOccurrenceDetail(client, occurrenceId);
        await this.repository.writeHistory(
          client,
          user.tenantId,
          text(occurrence, 'asset_id'),
          typeof occurrence.component_id === 'string' ? occurrence.component_id : null,
          user.id,
          roleSnapshot(user),
          'TECHNICAL_ANALYSIS_SENT',
          `Análise técnica enviada ao Administrador: ${input.title}`,
          { occurrenceId, analysisId, recommendsChecklist: input.recommendsChecklist },
        );
        await this.repository.writeAudit(
          client,
          user.tenantId,
          user.id,
          audit,
          'TECHNICAL_ANALYSIS_SENT_TO_ADMIN',
          'TECHNICAL_ANALYSIS',
          analysisId,
          detail,
        );
        await this.notifyRoles(client, user, {
          type: 'TECHNICAL_ANALYSIS_SENT',
          title: input.title,
          message: input.recommendation,
          entityType: 'TECHNICAL_ANALYSIS',
          entityId: analysisId,
          priority: input.priority,
          actionRoute: `/workflow/technical-analyses/${analysisId}`,
          deduplicationKey: `technical-analysis:${analysisId}:sent`,
          roles: ['ADMIN'],
        });
        return detail;
      },
    );
  }

  async listStops(user: AuthenticatedUser, query: StopListQuery) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id, readOnly: true },
      async (client) => ({
        itens: await this.repository.listStops(client, query),
        limite: query.limit,
      }),
    );
  }

  async getStop(user: AuthenticatedUser, stopId: string) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id, readOnly: true },
      async (client) => this.requiredStopDetail(client, stopId),
    );
  }

  async createStop(
    user: AuthenticatedUser,
    rawInput: CreateStopInput,
    audit: RequestAuditMetadata,
  ) {
    const input: CreateStopInput = {
      ...rawInput,
      origin: normalize(rawInput.origin).toUpperCase(),
      stopType: normalize(rawInput.stopType).toUpperCase(),
      reason: rawInput.reason.trim(),
      startedAt: isoDate(rawInput.startedAt, new Date()),
    };
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        await this.requireActiveAssetContext(client, input.assetId, input.componentId);
        const existing = await this.repository.findOpenStopForAsset(client, input.assetId, true);
        if (existing) {
          throw appError('ASSET_ALREADY_STOPPED', 'O ativo já possui uma parada aberta.', 409, {
            stopId: existing.id,
          });
        }
        const stopId = randomUUID();
        await this.repository.createStop(client, user.tenantId, stopId, user.id, input);
        const detail = await this.requiredStopDetail(client, stopId);
        await this.repository.writeHistory(
          client,
          user.tenantId,
          input.assetId,
          input.componentId,
          user.id,
          roleSnapshot(user),
          'EQUIPMENT_STOP_OPENED',
          `Parada técnica aberta: ${input.reason}`,
          { stopId, origin: input.origin, stopType: input.stopType },
        );
        await this.repository.writeAudit(
          client,
          user.tenantId,
          user.id,
          audit,
          'EQUIPMENT_STOP_CREATED',
          'EQUIPMENT_STOP',
          stopId,
          detail,
        );
        await this.notifyRoles(client, user, {
          type: 'EQUIPMENT_STOP_OPENED',
          title: 'Equipamento indisponível',
          message: input.reason,
          entityType: 'EQUIPMENT_STOP',
          entityId: stopId,
          priority: 'CRITICAL',
          actionRoute: `/maintenance/stops/${stopId}`,
          deduplicationKey: `equipment-stop:${stopId}:opened`,
          roles: ['ADMIN', 'MANAGER'],
        });
        return detail;
      },
    );
  }

  async transitionStop(
    user: AuthenticatedUser,
    stopId: string,
    rawInput: TransitionStopInput,
    audit: RequestAuditMetadata,
  ) {
    const input: TransitionStopInput = {
      ...rawInput,
      returnCategory: nullableText(rawInput.returnCategory)?.toUpperCase() ?? null,
      divergenceJustification: nullableText(rawInput.divergenceJustification),
    };
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        const stop = await this.repository.findStop(client, stopId, true);
        if (!stop) throw appError('STOP_NOT_FOUND', 'Parada não encontrada.', 404);
        const current = text(stop, 'status') as StopStatus;
        if (!stopTransitions[current].includes(input.status)) {
          throw appError(
            'INVALID_STOP_TRANSITION',
            `A transição ${current} → ${input.status} não é permitida.`,
            409,
          );
        }
        if (input.status === 'COMPLETED' && !input.returnCategory) {
          throw appError(
            'RETURN_CATEGORY_REQUIRED',
            'A conclusão da parada exige a categoria do retorno operacional.',
            422,
          );
        }
        await this.repository.transitionStop(client, stopId, user.id, input);
        if (input.status === 'COMPLETED') {
          await this.repository.resolveEntitiesLinkedToStop(client, stopId, user.id);
        }
        const detail = await this.requiredStopDetail(client, stopId);
        await this.repository.writeHistory(
          client,
          user.tenantId,
          text(stop, 'asset_id'),
          typeof stop.component_id === 'string' ? stop.component_id : null,
          user.id,
          roleSnapshot(user),
          'EQUIPMENT_STOP_TRANSITIONED',
          `Parada técnica movimentada de ${current} para ${input.status}.`,
          { stopId, previousStatus: current, status: input.status },
        );
        await this.repository.writeAudit(
          client,
          user.tenantId,
          user.id,
          audit,
          'EQUIPMENT_STOP_TRANSITIONED',
          'EQUIPMENT_STOP',
          stopId,
          detail,
        );
        if (input.status === 'COMPLETED') {
          await this.notifyRoles(client, user, {
            type: 'EQUIPMENT_RETURNED_TO_OPERATION',
            title: 'Equipamento liberado para operação',
            message: `A parada ${stopId} foi concluída com retorno operacional confirmado.`,
            entityType: 'EQUIPMENT_STOP',
            entityId: stopId,
            priority: 'INFO',
            actionRoute: `/maintenance/stops/${stopId}`,
            deduplicationKey: `equipment-stop:${stopId}:completed`,
            roles: ['ADMIN', 'MANAGER'],
          });
        }
        return detail;
      },
    );
  }

  async listAlerts(user: AuthenticatedUser, query: AlertListQuery) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id, readOnly: true },
      async (client) => ({
        itens: await this.repository.listAlerts(client, query),
        limite: query.limit,
      }),
    );
  }

  async acknowledgeAlert(user: AuthenticatedUser, alertId: string, audit: RequestAuditMetadata) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        const alert = await this.repository.findAlert(client, alertId, true);
        if (!alert) throw appError('ALERT_NOT_FOUND', 'Alerta não encontrado.', 404);
        if (text(alert, 'status') !== 'OPEN') {
          throw appError('ALERT_NOT_OPEN', 'Somente um alerta aberto pode ser reconhecido.', 409);
        }
        await this.repository.acknowledgeAlert(client, alertId, user.id);
        const after = await this.repository.findAlert(client, alertId);
        if (!after) throw appError('ALERT_NOT_FOUND', 'Alerta não encontrado.', 404);
        await this.repository.writeAudit(
          client,
          user.tenantId,
          user.id,
          audit,
          'OPERATIONAL_ALERT_ACKNOWLEDGED',
          'OPERATIONAL_ALERT',
          alertId,
          after,
        );
        return after;
      },
    );
  }

  async createOccurrenceFromAlert(
    user: AuthenticatedUser,
    alertId: string,
    input: {
      readonly title?: string;
      readonly description?: string;
      readonly equipmentStopped: boolean;
    },
    audit: RequestAuditMetadata,
  ) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        const alert = await this.repository.findAlert(client, alertId, true);
        if (!alert) throw appError('ALERT_NOT_FOUND', 'Alerta não encontrado.', 404);
        if (alert.occurrence_id !== null) {
          throw appError(
            'ALERT_ALREADY_LINKED',
            'O alerta já está vinculado a uma ocorrência.',
            409,
            { occurrenceId: alert.occurrence_id },
          );
        }
        if (['RESOLVED', 'DISMISSED'].includes(text(alert, 'status'))) {
          throw appError(
            'ALERT_ALREADY_CLOSED',
            'O alerta encerrado não pode gerar ocorrência.',
            409,
          );
        }
        const occurrenceId = randomUUID();
        const occurrenceInput: CreateOccurrenceInput = {
          assetId: text(alert, 'asset_id'),
          componentId: typeof alert.component_id === 'string' ? alert.component_id : null,
          occurrenceType: `ALERT_${text(alert, 'alert_type')}`,
          title: normalize(input.title ?? text(alert, 'title')),
          description: (input.description ?? text(alert, 'message')).trim(),
          severity:
            text(alert, 'severity') === 'INFO'
              ? 'LOW'
              : (text(alert, 'severity') as CreateOccurrenceInput['severity']),
          equipmentStopped: input.equipmentStopped,
          stopType: input.equipmentStopped ? 'TECHNICAL_ALERT' : null,
          stopReason: input.equipmentStopped ? text(alert, 'message') : null,
          occurredAt: dateTime(alert, 'first_detected_at'),
        };
        await this.repository.createOccurrence(
          client,
          user.tenantId,
          occurrenceId,
          user.id,
          roleSnapshot(user),
          occurrenceInput,
        );
        let stopId: string | null = null;
        if (input.equipmentStopped) {
          const existing = await this.repository.findOpenStopForAsset(
            client,
            occurrenceInput.assetId,
            true,
          );
          if (existing) {
            stopId = text(existing, 'id');
          } else {
            stopId = randomUUID();
            await this.repository.createStop(client, user.tenantId, stopId, user.id, {
              assetId: occurrenceInput.assetId,
              componentId: occurrenceInput.componentId,
              origin: 'ALERT',
              stopType: 'TECHNICAL_ALERT',
              reason: occurrenceInput.stopReason ?? occurrenceInput.description,
              startedAt: occurrenceInput.occurredAt ?? new Date().toISOString(),
              returnToleranceMinutes: 10,
            });
          }
          await this.repository.attachStopToOccurrence(client, occurrenceId, stopId);
        }
        await this.repository.linkAlertOccurrence(client, alertId, occurrenceId, stopId);
        const detail = await this.requiredOccurrenceDetail(client, occurrenceId);
        await this.repository.writeHistory(
          client,
          user.tenantId,
          occurrenceInput.assetId,
          occurrenceInput.componentId,
          user.id,
          roleSnapshot(user),
          'ALERT_CONVERTED_TO_OCCURRENCE',
          `Alerta convertido em ocorrência: ${occurrenceInput.title}`,
          { alertId, occurrenceId, stopId },
        );
        await this.repository.writeAudit(
          client,
          user.tenantId,
          user.id,
          audit,
          'OPERATIONAL_ALERT_CONVERTED',
          'OPERATIONAL_ALERT',
          alertId,
          detail,
        );
        await this.notifyRoles(client, user, {
          type: 'ALERT_CONVERTED_TO_OCCURRENCE',
          title: occurrenceInput.title,
          message: occurrenceInput.description,
          entityType: 'OPERATIONAL_OCCURRENCE',
          entityId: occurrenceId,
          priority: occurrenceInput.severity,
          actionRoute: `/maintenance/occurrences/${occurrenceId}`,
          deduplicationKey: `alert:${alertId}:occurrence`,
          roles: ['ADMIN', 'MANAGER'],
        });
        return detail;
      },
    );
  }

  async listNotifications(user: AuthenticatedUser, query: NotificationListQuery) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id, readOnly: true },
      async (client) => ({
        itens: await this.repository.listNotifications(client, user.id, query),
        contadores: await this.repository.notificationCounters(client, user.id),
        limite: query.limit,
      }),
    );
  }

  async markNotificationRead(user: AuthenticatedUser, notificationId: string) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        const updated = await this.repository.markNotificationRead(client, notificationId, user.id);
        if (!updated) {
          throw appError(
            'NOTIFICATION_NOT_FOUND',
            'Notificação não encontrada para o usuário.',
            404,
          );
        }
        return { notificacao_id: notificationId, lida: true };
      },
    );
  }

  async dismissNotification(user: AuthenticatedUser, notificationId: string) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => {
        const updated = await this.repository.dismissNotification(client, notificationId, user.id);
        if (!updated) {
          throw appError(
            'NOTIFICATION_NOT_FOUND',
            'Notificação não encontrada para o usuário.',
            404,
          );
        }
        return { notificacao_id: notificationId, dispensada: true };
      },
    );
  }

  async markAllNotificationsRead(user: AuthenticatedUser) {
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id },
      async (client) => ({
        atualizadas: await this.repository.markAllNotificationsRead(client, user.id),
      }),
    );
  }

  async technicalSummary(user: AuthenticatedUser, query: AnalyticsQuery) {
    const start = new Date(query.startAt);
    const end = new Date(query.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw appError('INVALID_ANALYTICS_PERIOD', 'O período dos indicadores é inválido.', 422);
    }
    const maximumWindowMs = 5 * 366 * 24 * 60 * 60 * 1_000;
    if (end.getTime() - start.getTime() > maximumWindowMs) {
      throw appError('ANALYTICS_PERIOD_TOO_LONG', 'O período máximo é de cinco anos.', 422);
    }
    const normalizedQuery = { ...query, startAt: start.toISOString(), endAt: end.toISOString() };
    return this.database.withTransaction(
      { tenantId: user.tenantId, userId: user.id, readOnly: true },
      async (client) => {
        if (query.assetId) await this.requireActiveAssetContext(client, query.assetId, null);
        return {
          periodo: { inicio: normalizedQuery.startAt, fim: normalizedQuery.endAt },
          resumo: await this.repository.technicalSummary(client, normalizedQuery),
          ranking_ativos: await this.repository.assetRanking(client, normalizedQuery),
        };
      },
    );
  }

  private async requireActiveAssetContext(
    client: PoolClient,
    assetId: string,
    componentId: string | null,
  ): Promise<MonitoringRow> {
    const context = await this.repository.findAssetContext(client, assetId, componentId);
    if (context?.asset_lifecycle_status !== 'ACTIVE') {
      throw appError('ASSET_NOT_ACTIVE', 'O ativo informado não existe ou não está ativo.', 422);
    }
    if (componentId && context.component_id !== componentId) {
      throw appError(
        'COMPONENT_ASSET_MISMATCH',
        'O componente informado não pertence ao ativo selecionado.',
        422,
      );
    }
    if (componentId && context.component_lifecycle_status !== 'ACTIVE') {
      throw appError('COMPONENT_NOT_ACTIVE', 'O componente informado não está ativo.', 422);
    }
    return context;
  }

  private async requiredOccurrenceDetail(
    client: PoolClient,
    occurrenceId: string,
  ): Promise<MonitoringRow> {
    const detail = await this.repository.getOccurrenceDetail(client, occurrenceId);
    if (!detail) throw appError('OCCURRENCE_NOT_FOUND', 'Ocorrência não encontrada.', 404);
    return detail;
  }

  private async requiredStopDetail(client: PoolClient, stopId: string): Promise<MonitoringRow> {
    const detail = await this.repository.getStopDetail(client, stopId);
    if (!detail) throw appError('STOP_NOT_FOUND', 'Parada não encontrada.', 404);
    return detail;
  }

  private async notifyRoles(
    client: PoolClient,
    user: AuthenticatedUser,
    input: {
      readonly type: string;
      readonly title: string;
      readonly message: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly priority: string;
      readonly actionRoute: string;
      readonly deduplicationKey: string;
      readonly roles: readonly string[];
    },
  ): Promise<void> {
    const notificationId = await this.repository.createNotification(client, user.tenantId, {
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      priority: input.priority,
      actionRoute: input.actionRoute,
      actionPayload: { entityType: input.entityType, entityId: input.entityId },
      audience: { roleTypes: input.roles },
      deduplicationKey: input.deduplicationKey,
    });
    await this.repository.attachNotificationToRoleTypes(
      client,
      user.tenantId,
      notificationId,
      input.roles,
      user.id,
    );
  }
}

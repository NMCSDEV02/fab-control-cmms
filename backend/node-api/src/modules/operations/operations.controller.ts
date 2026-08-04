import type { FastifyRequest } from 'fastify';

import { AppError } from '../../core/errors/app-error.js';
import { successEnvelope } from '../../core/http/envelope.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { OperationsService } from './operations.service.js';
import type {
  EvidenceType,
  ExecutionStopMode,
  Priority,
  SignaturePolicy,
} from './operations.types.js';

interface Params {
  readonly workOrderId?: string;
  readonly demandId?: string;
  readonly actionId?: string;
  readonly executionId?: string;
  readonly itemId?: string;
}
interface WorkOrderQuery {
  readonly busca?: string;
  readonly status?: string;
  readonly ativo_id?: string;
  readonly limite?: number;
}
interface WorkOrderBody {
  readonly plano_versao_id: string;
  readonly tipo_origem: string;
  readonly entidade_origem_id: string | null;
  readonly tipo_trabalho: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly prioridade: Priority;
  readonly responsavel_id: string | null;
  readonly programada_para: string | null;
  readonly analise_tecnica: Readonly<Record<string, unknown>>;
}
interface WorkOrderCorrectionBody {
  readonly titulo: string;
  readonly descricao: string;
  readonly prioridade: Priority;
  readonly responsavel_id: string | null;
  readonly programada_para: string | null;
  readonly analise_tecnica: Readonly<Record<string, unknown>>;
}
interface SubmitBody {
  readonly politica_assinatura: SignaturePolicy;
  readonly assinaturas_exigidas: number;
  readonly primeira_resposta_ate: string | null;
  readonly resolucao_ate: string | null;
}
interface SignatureBody {
  readonly declaracao: string;
  readonly significado: string;
}
interface ChangesBody {
  readonly motivo: string;
}
interface ResponseBody {
  readonly resposta_texto: string | null;
  readonly resposta_numero: number | null;
  readonly resposta_booleano: boolean | null;
  readonly resposta_opcao: string | null;
  readonly observacao: string | null;
  readonly nao_aplicavel: boolean;
}
interface EvidenceBody {
  readonly objeto_armazenamento_id: string;
  readonly tipo: EvidenceType;
  readonly observacao: string | null;
  readonly capturada_em: string | null;
}
interface StartBody {
  readonly modo_parada: ExecutionStopMode;
}
interface CompleteBody {
  readonly resultado: string;
  readonly observacao: string | null;
  readonly modo_parada: ExecutionStopMode;
}

function user(request: FastifyRequest): AuthenticatedUser {
  if (request.auth) return request.auth.user;
  throw new AppError({
    code: 'AUTH_CONTEXT_MISSING',
    message: 'A sessão autenticada não está disponível.',
    statusCode: 401,
  });
}

function id(params: Params, key: keyof Params): string {
  const value = params[key];
  if (value) return value;
  throw new AppError({
    code: 'ROUTE_IDENTIFIER_MISSING',
    message: 'Identificador obrigatório ausente.',
    statusCode: 400,
  });
}

function audit(request: FastifyRequest) {
  const authenticated = user(request);
  const agent = request.headers['user-agent'];
  return {
    traceId: request.id,
    ipAddress: request.ip,
    userAgent: typeof agent === 'string' ? agent.slice(0, 2_048) : null,
    roleSnapshot: authenticated.roles.join(',') || authenticated.profile,
  };
}

export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  listWorkOrders = async (request: FastifyRequest<{ Querystring: WorkOrderQuery }>) =>
    successEnvelope(
      request,
      'maintenance.work-orders.list',
      await this.service.listWorkOrders(user(request), {
        search: request.query.busca?.trim() ?? '',
        status: request.query.status ?? null,
        assetId: request.query.ativo_id ?? null,
        limit: request.query.limite ?? 50,
      }),
    );

  getWorkOrder = async (request: FastifyRequest<{ Params: Params }>) =>
    successEnvelope(
      request,
      'maintenance.work-orders.get',
      await this.service.getWorkOrder(user(request), id(request.params, 'workOrderId')),
    );

  createWorkOrder = async (request: FastifyRequest<{ Body: WorkOrderBody }>) =>
    successEnvelope(
      request,
      'maintenance.work-orders.create',
      await this.service.createWorkOrder(
        user(request),
        {
          planVersionId: request.body.plano_versao_id,
          originType: request.body.tipo_origem,
          originEntityId: request.body.entidade_origem_id,
          workType: request.body.tipo_trabalho,
          title: request.body.titulo,
          description: request.body.descricao,
          priority: request.body.prioridade,
          responsibleId: request.body.responsavel_id,
          scheduledFor: request.body.programada_para,
          technicalAnalysis: request.body.analise_tecnica,
        },
        audit(request),
      ),
    );

  correctWorkOrder = async (
    request: FastifyRequest<{ Params: Params; Body: WorkOrderCorrectionBody }>,
  ) =>
    successEnvelope(
      request,
      'maintenance.work-orders.correct',
      await this.service.correctWorkOrder(
        user(request),
        id(request.params, 'workOrderId'),
        {
          title: request.body.titulo,
          description: request.body.descricao,
          priority: request.body.prioridade,
          responsibleId: request.body.responsavel_id,
          scheduledFor: request.body.programada_para,
          technicalAnalysis: request.body.analise_tecnica,
        },
        audit(request),
      ),
    );

  submitReview = async (request: FastifyRequest<{ Params: Params; Body: SubmitBody }>) =>
    successEnvelope(
      request,
      'maintenance.work-orders.submit-review',
      await this.service.submitForReview(
        user(request),
        id(request.params, 'workOrderId'),
        {
          signaturePolicy: request.body.politica_assinatura,
          requiredSignatures: request.body.assinaturas_exigidas,
          firstResponseDueAt: request.body.primeira_resposta_ate,
          resolutionDueAt: request.body.resolucao_ate,
        },
        audit(request),
      ),
    );

  signDemand = async (request: FastifyRequest<{ Params: Params; Body: SignatureBody }>) =>
    successEnvelope(
      request,
      'workflow.technical-demands.sign',
      await this.service.signDemand(
        user(request),
        id(request.params, 'demandId'),
        {
          declaration: request.body.declaracao,
          meaning: request.body.significado,
        },
        audit(request),
      ),
    );

  requestChanges = async (request: FastifyRequest<{ Params: Params; Body: ChangesBody }>) =>
    successEnvelope(
      request,
      'workflow.technical-demands.request-changes',
      await this.service.requestChanges(
        user(request),
        id(request.params, 'demandId'),
        request.body.motivo,
        audit(request),
      ),
    );

  releaseWorkOrder = async (request: FastifyRequest<{ Params: Params }>) =>
    successEnvelope(
      request,
      'maintenance.work-orders.release',
      await this.service.releaseWorkOrder(
        user(request),
        id(request.params, 'workOrderId'),
        audit(request),
      ),
    );

  listOperatorActions = async (
    request: FastifyRequest<{ Querystring: { readonly limite?: number } }>,
  ) =>
    successEnvelope(
      request,
      'maintenance.operator-actions.list',
      await this.service.listOperatorActions(user(request), request.query.limite ?? 50),
    );

  assumeAction = async (request: FastifyRequest<{ Params: Params }>) =>
    successEnvelope(
      request,
      'maintenance.operator-actions.assume',
      await this.service.assumeAction(
        user(request),
        id(request.params, 'actionId'),
        audit(request),
      ),
    );

  getExecution = async (request: FastifyRequest<{ Params: Params }>) =>
    successEnvelope(
      request,
      'maintenance.executions.get',
      await this.service.getExecution(user(request), id(request.params, 'executionId')),
    );

  startExecution = async (request: FastifyRequest<{ Params: Params; Body: StartBody }>) =>
    successEnvelope(
      request,
      'maintenance.executions.start',
      await this.service.startExecution(
        user(request),
        id(request.params, 'executionId'),
        request.body.modo_parada,
        audit(request),
      ),
    );

  answerItem = async (request: FastifyRequest<{ Params: Params; Body: ResponseBody }>) =>
    successEnvelope(
      request,
      'maintenance.executions.items.answer',
      await this.service.answerItem(
        user(request),
        id(request.params, 'executionId'),
        id(request.params, 'itemId'),
        {
          textValue: request.body.resposta_texto,
          numberValue: request.body.resposta_numero,
          booleanValue: request.body.resposta_booleano,
          optionValue: request.body.resposta_opcao,
          observation: request.body.observacao,
          notApplicable: request.body.nao_aplicavel,
        },
        audit(request),
      ),
    );

  addEvidence = async (request: FastifyRequest<{ Params: Params; Body: EvidenceBody }>) =>
    successEnvelope(
      request,
      'maintenance.executions.items.evidence',
      await this.service.addEvidence(
        user(request),
        id(request.params, 'executionId'),
        id(request.params, 'itemId'),
        {
          storageObjectId: request.body.objeto_armazenamento_id,
          evidenceType: request.body.tipo,
          observation: request.body.observacao,
          capturedAt: request.body.capturada_em,
        },
        audit(request),
      ),
    );

  completeExecution = async (request: FastifyRequest<{ Params: Params; Body: CompleteBody }>) =>
    successEnvelope(
      request,
      'maintenance.executions.complete',
      await this.service.completeExecution(
        user(request),
        id(request.params, 'executionId'),
        {
          result: request.body.resultado,
          observation: request.body.observacao,
          stopMode: request.body.modo_parada,
        },
        audit(request),
      ),
    );
}

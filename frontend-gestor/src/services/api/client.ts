import type { ApiEnvelope } from "../../types/api";
import { getApiTransport, getApiUrl, getLegacyApiUrl } from "./config";

export const API_TIMEOUT_MS = {
  FAST_READ: 15_000,
  DETAIL_READ: 30_000,
  SAVE: 45_000,
  CRITICAL_WRITE: 60_000,
  EVIDENCE_UPLOAD: 90_000,
} as const;

export interface ApiCallOptions {
  timeoutMs?: number;
  dedupe?: boolean;
  dedupeKey?: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code = "API_REQUEST_FAILED",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const inFlightReads = new Map<string, Promise<ApiEnvelope<unknown>>>();

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(",")}}`;
}

async function executeAppsScriptCall<T>(
  apiUrl: string,
  action: string,
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) throw error;
      if (timedOut) {
        const timeoutSeconds = Math.round(timeoutMs / 1000);
        throw new ApiRequestError(
          `A API excedeu ${timeoutSeconds} segundos. Os dados salvos permanecem disponíveis; tente atualizar novamente.`,
          "API_TIMEOUT",
          { action, timeoutMs },
        );
      }
      throw new ApiRequestError(
        "A requisição foi cancelada.",
        "API_ABORTED",
        error,
      );
    }
    throw new ApiRequestError(
      "Não foi possível alcançar a API. Verifique internet, URL e publicação do Apps Script.",
      "NETWORK_ERROR",
      error,
    );
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!response.ok) {
    throw new ApiRequestError(
      `A API respondeu com HTTP ${response.status}.`,
      "HTTP_ERROR",
      { status: response.status },
    );
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch (error) {
    throw new ApiRequestError(
      "A API não retornou JSON válido.",
      "INVALID_JSON",
      error,
    );
  }

  if (!envelope.ok) {
    throw new ApiRequestError(
      envelope.error?.message ?? "A API rejeitou a operação.",
      envelope.error?.code ?? "API_ERROR",
      envelope.error?.details,
    );
  }

  return envelope;
}

interface NodeActionRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  token?: string;
  transform?: (data: Record<string, unknown>) => unknown;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function queryPath(
  path: string,
  values: Readonly<Record<string, unknown>>,
): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

const actionStatusToNode: Readonly<Record<string, string>> = {
  PENDENTE: "READY",
  EM_EXECUCAO: "IN_PROGRESS",
  AGUARDANDO_VALIDACAO: "PENDING",
  BLOQUEADA: "BLOCKED",
  CONCLUIDA: "COMPLETED",
  CANCELADA: "CANCELLED",
};

const actionStatusFromNode: Readonly<Record<string, string>> = {
  PENDING: "AGUARDANDO_VALIDACAO",
  READY: "PENDENTE",
  IN_PROGRESS: "EM_EXECUCAO",
  BLOCKED: "BLOQUEADA",
  COMPLETED: "CONCLUIDA",
  CANCELLED: "CANCELADA",
  QUARANTINED: "BLOQUEADA",
};

const demandStatusToNode: Readonly<Record<string, string>> = {
  ABERTA: "OPEN",
  EM_TRIAGEM: "TRIAGE",
  EM_VALIDACAO_TECNICA: "IN_TECHNICAL_REVIEW",
  AGUARDANDO_ASSINATURA: "AWAITING_SIGNATURE",
  ENCAMINHADA: "FORWARDED",
  DEVOLVIDA_ADMIN: "CHANGES_REQUESTED",
  APROVADA_TECNICAMENTE: "TECHNICALLY_APPROVED",
  LIBERADA_OPERACAO: "RELEASED_TO_OPERATION",
  CONCLUIDA: "COMPLETED",
  CANCELADA: "CANCELLED",
};

const demandStatusFromNode = Object.fromEntries(
  Object.entries(demandStatusToNode).map(([legacy, node]) => [node, legacy]),
) as Readonly<Record<string, string>>;

const stopStatusFromNode: Readonly<Record<string, string>> = {
  OPEN: "PARADA_ABERTA",
  WAITING_MAINTENANCE: "PARADA_ABERTA",
  IN_MAINTENANCE: "MANUTENCAO_EM_EXECUCAO",
  WAITING_OPERATIONAL_RETURN: "AGUARDANDO_RETORNO_OPERACIONAL",
  COMPLETED: "CONCLUIDA",
  CANCELLED: "CANCELADA",
};

function mappedCsv(
  value: unknown,
  mapping: Readonly<Record<string, string>>,
): string {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .map((item) => mapping[item] ?? item)
    .join(",");
}

function mapAction(value: unknown): JsonRecord {
  const item = record(value);
  const status = String(item.status ?? "").toUpperCase();
  return { ...item, status: actionStatusFromNode[status] ?? status };
}

function mapDemand(value: unknown): JsonRecord {
  const item = record(value);
  const status = String(item.status ?? "").toUpperCase();
  return { ...item, status: demandStatusFromNode[status] ?? status };
}

const checklistStatusFromNode: Readonly<Record<string, string>> = {
  DRAFT: "RASCUNHO",
  IN_REVIEW: "EM_VALIDACAO_GESTAO",
  CHANGES_REQUESTED: "DEVOLVIDO_CORRECAO",
  APPROVED: "VALIDADO",
  PUBLISHED: "ATIVO",
  SUPERSEDED: "OBSOLETO",
  REJECTED: "DEVOLVIDO_CORRECAO",
};

const criticalityFromNode: Readonly<Record<string, string>> = {
  LOW: "BAIXA",
  MEDIUM: "MEDIA",
  HIGH: "ALTA",
  CRITICAL: "CRITICA",
};

const criticalityToNode: Readonly<Record<string, string>> = {
  BAIXA: "LOW",
  MEDIA: "MEDIUM",
  ALTA: "HIGH",
  CRITICA: "CRITICAL",
};

function yes(value: unknown): boolean {
  return value === true || String(value ?? "").toUpperCase() === "SIM";
}

function nullableNumber(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function checklistPlan(value: unknown): JsonRecord {
  const item = record(value);
  const version = record(item.versao_atual);
  const status = String(version.status ?? item.status ?? "DRAFT").toUpperCase();
  return {
    ...item,
    ...version,
    criticidade:
      criticalityFromNode[
        String(item.criticidade ?? version.criticidade ?? "").toUpperCase()
      ] ??
      item.criticidade ??
      version.criticidade,
    workflow_status: checklistStatusFromNode[status] ?? status,
    status: status === "PUBLISHED" ? "ATIVO" : "INATIVO",
    itens_count: Number(item.total_itens ?? records(item.itens).length),
    operacional: status === "PUBLISHED",
    atualizado_em: item.updated_at,
    gatilho_tipo: item.gatilho_tipo ?? "DIAS",
    gatilho_valor: item.gatilho_valor ?? 30,
    unidade: item.unidade ?? "dias",
    recorrencia_dias: item.recorrencia_dias ?? 30,
    tempo_estimado_min: item.tempo_estimado_min ?? 60,
    requer_bloqueio: item.requer_bloqueio ?? "SIM",
    requer_evidencia: item.requer_evidencia ?? "NAO",
    max_sessoes: item.max_sessoes ?? 1,
    modo_parada_manutencao: item.modo_parada_manutencao ?? "DECISAO_EXECUTOR",
  };
}

function checklistItemFromNode(value: unknown): JsonRecord {
  const item = record(value);
  return {
    ...item,
    ordem: Number(item.sequencia ?? item.ordem ?? 0),
    obrigatorio: item.obrigatoria === true ? "SIM" : "NAO",
    evidencia_obrigatoria: item.exige_evidencia === true ? "SIM" : "NAO",
    evidencia_min_fotos: Number(item.minimo_fotos ?? 0),
    bloqueia_finalizacao: item.bloqueia_conclusao === true ? "SIM" : "NAO",
    limite_min: item.valor_minimo ?? "",
    limite_max: item.valor_maximo ?? "",
    opcoes_json: JSON.stringify(Array.isArray(item.opcoes) ? item.opcoes : []),
  };
}

function adminChecklistDetail(data: JsonRecord): JsonRecord {
  const reviews = records(data.revisoes_tecnicas);
  const current = record(data.versao_atual);
  const plan = checklistPlan(data);
  return {
    plano: plan,
    ativo: data.ativo_id
      ? { id: data.ativo_id, tag: data.ativo_tag, nome: data.ativo_nome }
      : null,
    componente: data.componente_id
      ? {
          id: data.componente_id,
          tag: data.componente_tag,
          nome: data.componente_nome,
        }
      : null,
    itens: records(data.itens).map(checklistItemFromNode),
    validacoes: reviews,
    ultimo_parecer: reviews[0] ?? null,
    correcoes_pendentes: current.status === "CHANGES_REQUESTED",
    operacional: current.status === "PUBLISHED",
  };
}

function checklistAggregateBody(payload: JsonRecord): JsonRecord {
  const plan = record(payload.plano);
  const policy = String(plan.politica_assinatura ?? "QUALIDADE_OU_SEGURANCA");
  const requiredByPolicy: Readonly<Record<string, number>> = {
    QUALIDADE: 1,
    SEGURANCA: 1,
    QUALIDADE_OU_SEGURANCA: 1,
    QUALIDADE_E_SEGURANCA: 2,
  };
  const items = records(payload.itens);
  const code = String(
    plan.codigo ??
      `CHK-${String(plan.nome ?? "MODELO")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/gu, "")
        .replace(/[^a-zA-Z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "")
        .slice(0, 45)
        .toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
  );
  return {
    checklist_id: plan.id || null,
    analise_tecnica_origem_id: payload.analise_id || null,
    checklist: {
      codigo: code,
      nome: plan.nome,
      ativo_id: plan.ativo_id,
      componente_id: plan.componente_id || null,
      tipo: plan.tipo || "INSPECAO",
      criticidade:
        criticalityToNode[String(plan.criticidade ?? "MEDIA").toUpperCase()] ??
        "MEDIUM",
      area_tecnica_id: plan.area_tecnica_id || null,
      cargo_tecnico_id: plan.cargo_tecnico_id || null,
      politica_assinatura: policy,
      assinaturas_exigidas:
        requiredByPolicy[policy] ??
        Math.max(1, Number(plan.assinaturas_exigidas ?? 1)),
      segregacao_exigida:
        plan.segregacao_exigida === undefined
          ? true
          : yes(plan.segregacao_exigida),
      orientacao_gestor: plan.orientacao_gestor || null,
      requisitos_seguranca: Array.isArray(plan.requisitos_seguranca)
        ? plan.requisitos_seguranca
        : [],
    },
    itens: items.map((item) => ({
      id: item.id || null,
      parametro_nome: item.parametro_nome || null,
      titulo: item.titulo,
      instrucao: item.instrucao || null,
      tipo_resposta: item.tipo_resposta,
      categoria: item.categoria || "OPERACIONAL",
      obrigatoria: yes(item.obrigatorio ?? item.obrigatoria),
      exige_evidencia: yes(item.evidencia_obrigatoria ?? item.exige_evidencia),
      minimo_fotos: Math.max(
        0,
        Number(item.evidencia_min_fotos ?? item.minimo_fotos ?? 0),
      ),
      bloqueia_conclusao: yes(
        item.bloqueia_finalizacao ?? item.bloqueia_conclusao,
      ),
      parametro_id: item.parametro_id || null,
      valor_esperado: item.valor_esperado || null,
      valor_minimo: nullableNumber(item.limite_min ?? item.valor_minimo),
      valor_maximo: nullableNumber(item.limite_max ?? item.valor_maximo),
      unidade: item.unidade || null,
      opcoes: (() => {
        try {
          const parsed = JSON.parse(String(item.opcoes_json || "[]"));
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      })(),
      regra_validacao: item.regra_validacao || null,
      peso: Math.max(0, Number(item.peso ?? 1)),
    })),
  };
}

function mapNotification(value: unknown): JsonRecord {
  const item = record(value);
  const entityTypes: Record<string, string> = {
    OPERATIONAL_OCCURRENCE: "OCORRENCIAS_OPERACIONAIS",
    EQUIPMENT_STOP: "PARADAS_EQUIPAMENTO",
    TECHNICAL_ANALYSIS: "ANALISES_TECNICAS",
    TECHNICAL_DEMAND: "DEMANDAS_TECNICAS",
    WORK_ORDER: "ORDENS_SERVICO",
  };
  const notificationTypes: Record<string, string> = {
    OCCURRENCE_REPORTED: "OCORRENCIA_CRITICA",
    EQUIPMENT_STOP_OPENED: "PARADA_TECNICA",
    EQUIPMENT_RETURNED_TO_OPERATION: "RETORNO_OPERACIONAL",
    TECHNICAL_ANALYSIS_SENT: "ANALISE_TECNICA",
  };
  const entityType = String(item.entidade_tipo ?? "").toUpperCase();
  const notificationType = String(item.tipo ?? "").toUpperCase();
  return {
    ...item,
    tipo: notificationTypes[notificationType] ?? notificationType,
    entidade_tipo: entityTypes[entityType] ?? entityType,
    status: item.nao_lida === true ? "NAO_LIDA" : "LIDA",
    criado_em: item.criada_em,
  };
}

function mapTechnicalSummary(value: JsonRecord): JsonRecord {
  const period = record(value.periodo);
  const summary = record(value.resumo);
  const start = String(period.inicio ?? "");
  const end = String(period.fim ?? "");
  const assetCount = Number(summary.total_assets ?? 0);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const observed =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(
          0,
          Math.round((endMs - startMs) / 1_000) * Math.max(assetCount, 1),
        )
      : 0;
  const stopped = Number(summary.indisponibilidade_segundos ?? 0);
  return {
    ativo_id: "",
    inicio_em: start,
    fim_em: end,
    ativos_considerados: assetCount,
    disponibilidade_pct: summary.disponibilidade_percentual ?? null,
    tempo_observado_segundos: observed,
    tempo_operacao_segundos: Math.max(0, observed - stopped),
    tempo_parada_segundos: stopped,
    falhas_nao_planejadas: Number(summary.falhas_nao_planejadas ?? 0),
    mttr_segundos: summary.mttr_segundos ?? null,
    mtbf_segundos: summary.mtbf_segundos ?? null,
    lead_time_os_segundos: summary.tempo_medio_execucao_segundos ?? null,
    lead_time_demanda_segundos:
      summary.primeira_resposta_media_segundos ?? null,
    sla_resposta_pct: summary.sla_resolucao_percentual ?? null,
    sla_resolucao_pct: summary.sla_resolucao_percentual ?? null,
    sla_resposta_amostra: Number(summary.demandas_com_sla ?? 0),
    sla_resolucao_amostra: Number(summary.demandas_com_sla ?? 0),
    oee_disponivel: false,
    oee_pct: null,
    oee_disponibilidade_pct: null,
    oee_performance_pct: null,
    oee_qualidade_pct: null,
    producao_amostra: 0,
    metodologia:
      "Indicadores calculados exclusivamente a partir de eventos tÃ©cnicos reais.",
    ranking_ativos: records(value.ranking_ativos),
  };
}

function defaultAnalyticsPeriod(payload: JsonRecord): {
  inicio: string;
  fim: string;
} {
  const end =
    typeof payload.fim_em === "string" && payload.fim_em
      ? new Date(payload.fim_em)
      : new Date();
  const start =
    typeof payload.inicio_em === "string" && payload.inicio_em
      ? new Date(payload.inicio_em)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1_000);
  return { inicio: start.toISOString(), fim: end.toISOString() };
}

function mapActionDetail(value: JsonRecord): JsonRecord {
  const rawAction = record(value.acao);
  const execution = record(value.execucao);
  const items = records(execution.itens ?? rawAction.checklist_itens);
  const evidence = items.flatMap((item) => records(item.evidencias));
  return {
    acao: mapAction(rawAction),
    os: {
      id: rawAction.ordem_id,
      codigo: rawAction.ordem_codigo,
      status: rawAction.ordem_status,
      programada_para: rawAction.programada_para,
    },
    ativo: {
      id: rawAction.ativo_id,
      tag: rawAction.ativo_tag,
      nome: rawAction.ativo_nome,
      tipo: rawAction.ativo_tipo,
      criticidade: rawAction.ativo_criticidade,
      status: rawAction.ativo_status,
    },
    componente: rawAction.componente_id
      ? {
          id: rawAction.componente_id,
          tag: rawAction.componente_tag,
          nome: rawAction.componente_nome,
          tipo: rawAction.componente_tipo,
          criticidade: rawAction.componente_criticidade,
          status: rawAction.componente_status,
        }
      : null,
    execucoes: Object.keys(execution).length > 0 ? [execution] : [],
    checklist: items,
    evidencias: evidence,
    materiais: [],
    locks: [],
    historico: [],
  };
}

function nodeActionRequest(
  action: string,
  payload: Record<string, unknown>,
): NodeActionRequest | null {
  const token = typeof payload.token === "string" ? payload.token : undefined;
  switch (action) {
    case "auth.login":
      return {
        method: "POST",
        path: "/v1/auth/login",
        body: { matricula: payload.matricula, senha: payload.senha },
      };
    case "auth.first_access.complete":
      return {
        method: "POST",
        path: "/v1/auth/first-access",
        body: {
          change_token: payload.change_token,
          senha_atual: payload.senha_atual,
          nova_senha: payload.nova_senha,
        },
      };
    case "auth.recovery.request":
      return {
        method: "POST",
        path: "/v1/auth/recovery",
        body: { matricula: payload.matricula },
      };
    case "auth.logout":
      return { method: "POST", path: "/v1/auth/logout", body: {}, token };
    case "sistema.health":
      return { method: "GET", path: "/health/ready" };
    case "sistema.warmup":
      return {
        method: "GET",
        path: "/v1/auth/session",
        token,
        transform: (data) => {
          const user = data.user as Record<string, unknown> | undefined;
          return {
            warmed: true,
            version: data.release_version,
            perfil: user?.perfil ?? "",
            usuario_id: user?.id ?? "",
            elapsed_internal_ms: 0,
            loaded_tables: 0,
          };
        },
      };
    case "gestor.contexto_tecnico":
      return { method: "GET", path: "/v1/workflow/technical-context", token };
    case "gestor.demandas.listar":
      return {
        method: "GET",
        path: queryPath("/v1/workflow/technical-demands", {
          busca: payload.busca,
          status: mappedCsv(payload.status, demandStatusToNode),
          limite: payload.limite,
        }),
        token,
        transform: (data) => ({
          ...data,
          demandas: records(data.demandas).map(mapDemand),
        }),
      };
    case "gestor.demandas.assumir":
      return {
        method: "POST",
        path: `/v1/workflow/technical-demands/${encodeURIComponent(String(payload.demanda_id))}/assume`,
        body: {},
        token,
        transform: (data) => ({ ...data, demanda: mapDemand(data.demanda) }),
      };
    case "gestor.demandas.assinar":
    case "gestor.demandas.validar":
      return {
        method: "POST",
        path: `/v1/workflow/technical-demands/${encodeURIComponent(String(payload.demanda_id))}/sign`,
        body: {
          declaracao: payload.declaracao ?? payload.parecer,
          significado: "AprovaÃ§Ã£o tÃ©cnica rastreÃ¡vel",
        },
        token,
        transform: (data) => {
          const validation = record(data.validacao);
          return {
            signed: true,
            validated: true,
            completed: data.status === "APPROVED",
            assinaturas_pendentes: Math.max(
              0,
              Number(validation.assinaturas_exigidas ?? 0) -
                Number(validation.assinaturas_realizadas ?? 0),
            ),
            demanda: mapDemand({
              ...validation,
              id: validation.id,
              tipo: "WORK_ORDER_VALIDATION",
              entidade_tipo: "WORK_ORDER",
              entidade_id: data.id,
              titulo: data.titulo,
              descricao: data.descricao,
              prioridade: data.prioridade,
            }),
          };
        },
      };
    case "gestor.demandas.decidir": {
      const decision = String(payload.decisao ?? "").toUpperCase();
      if (decision === "DEVOLVER_ADMIN") {
        return {
          method: "POST",
          path: `/v1/workflow/technical-demands/${encodeURIComponent(String(payload.demanda_id))}/request-changes`,
          body: { motivo: payload.parecer },
          token,
          transform: (data) => ({
            decided: true,
            demanda: mapDemand({
              id: payload.demanda_id,
              entidade_id: data.id,
              titulo: data.titulo,
              descricao: data.descricao,
              prioridade: data.prioridade,
              status: data.status,
            }),
          }),
        };
      }
      return {
        method: "POST",
        path: `/v1/workflow/technical-demands/${encodeURIComponent(String(payload.demanda_id))}/sign`,
        body: {
          declaracao: payload.parecer,
          significado: "AprovaÃ§Ã£o tÃ©cnica rastreÃ¡vel",
        },
        token,
        transform: (data) => ({
          decided: true,
          demanda: mapDemand({
            ...record(data.validacao),
            entidade_id: data.id,
            titulo: data.titulo,
            descricao: data.descricao,
            prioridade: data.prioridade,
            status: data.status,
          }),
        }),
      };
    }
    case "gestor.listar_acoes":
      return {
        method: "GET",
        path: queryPath("/v1/maintenance/actions", {
          busca: payload.busca,
          status: mappedCsv(payload.status, actionStatusToNode),
          ativo_id: payload.ativo_id,
          limite: payload.limite,
        }),
        token,
        transform: (data) => ({
          total: Number(data.total ?? 0),
          acoes: records(data.acoes).map(mapAction),
        }),
      };
    case "gestor.detalhe_acao":
      return {
        method: "GET",
        path: `/v1/maintenance/actions/${encodeURIComponent(String(payload.acao_id))}`,
        token,
        transform: mapActionDetail,
      };
    case "gestor.auditoria_execucao_checklist":
      return {
        method: "GET",
        path: `/v1/maintenance/actions/${encodeURIComponent(String(payload.acao_id))}`,
        token,
        transform: (data) => {
          const detail = mapActionDetail(data);
          const executions = Array.isArray(detail.execucoes)
            ? detail.execucoes
            : [];
          const execution = record(executions[0]);
          return {
            acao: detail.acao,
            execucao: Object.keys(execution).length > 0 ? execution : null,
            checklist: detail.checklist,
            evidencias: detail.evidencias,
            finalizacao: { can_finalize: execution.status === "COMPLETED" },
            auditoria: { integridade_ok: true },
          };
        },
      };
    case "gestor.listar_paradas":
      return {
        method: "GET",
        path: queryPath("/v1/maintenance/stops", {
          busca: payload.busca,
          ativo_id: payload.ativo_id,
          somente_abertas: payload.somente_abertas,
          limite: Math.min(Number(payload.limite ?? 100), 100),
        }),
        token,
        transform: (data) => {
          const stops = records(data.itens).map((item) => ({
            ...item,
            status:
              stopStatusFromNode[String(item.status ?? "").toUpperCase()] ??
              item.status,
            motivo_parada: item.motivo,
            elapsed_seconds: item.duracao_atual_segundos,
            requires_return_confirmation:
              item.status === "WAITING_OPERATIONAL_RETURN",
          }));
          return { total: stops.length, paradas: stops };
        },
      };
    case "gestor.listar_ocorrencias": {
      const requestedStatus = String(payload.status ?? "").toUpperCase();
      const nodeStatus =
        requestedStatus === "AGUARDANDO_ANALISE"
          ? "OPEN"
          : requestedStatus || undefined;
      return {
        method: "GET",
        path: queryPath("/v1/maintenance/occurrences", {
          busca: payload.busca,
          status: nodeStatus,
          ativo_id: payload.ativo_id,
          limite: Math.min(Number(payload.limite ?? 100), 100),
        }),
        token,
        transform: (data) => {
          const occurrences = records(data.itens).map((item) => ({
            ...item,
            status: item.status === "OPEN" ? "AGUARDANDO_ANALISE" : item.status,
            criado_em: item.criada_em,
          }));
          return { total: occurrences.length, ocorrencias: occurrences };
        },
      };
    }
    case "gestor.notificacoes.listar":
      return {
        method: "GET",
        path: queryPath("/v1/notifications", {
          busca: payload.busca,
          somente_nao_lidas: payload.somente_nao_lidas,
          prioridade: payload.prioridade,
          contexto: payload.contexto,
          limite: Math.min(Number(payload.limite ?? 100), 100),
        }),
        token,
        transform: (data) => {
          const notifications = records(data.itens).map(mapNotification);
          return {
            total: notifications.length,
            notificacoes: notifications,
            contadores: data.contadores,
          };
        },
      };
    case "gestor.notificacoes.marcar_lida":
      return {
        method: "PATCH",
        path: `/v1/notifications/${encodeURIComponent(String(payload.notificacao_id))}/read`,
        token,
        transform: (data) => ({
          read: data.lida === true,
          notificacao_id: data.notificacao_id,
        }),
      };
    case "gestor.paradas.criar_tratamento":
      return {
        method: "POST",
        path: `/v1/maintenance/stops/${encodeURIComponent(String(payload.parada_id))}/create-treatment`,
        body: {},
        token,
        transform: (data) => ({
          ...data,
          occurrence: {
            ...record(data.occurrence),
            criado_em: record(data.occurrence).criada_em,
            parada_id: data.parada_id,
          },
        }),
      };
    case "cmms.kpis_tecnicos": {
      const period = defaultAnalyticsPeriod(payload);
      return {
        method: "GET",
        path: queryPath("/v1/analytics/technical-summary", {
          ativo_id: payload.ativo_id,
          inicio: period.inicio,
          fim: period.fim,
          limite_ranking: 10,
        }),
        token,
        transform: mapTechnicalSummary,
      };
    }
    case "gestor.modelos_em_validacao":
      return {
        method: "GET",
        path: queryPath("/v1/maintenance/checklists", {
          status: "IN_REVIEW",
          limite: Math.min(Number(payload.limite ?? 100), 100),
        }),
        token,
        transform: (data) => ({
          total: records(data.itens).length,
          modelos: records(data.itens).map((item) => ({
            ...item,
            workflow_status: item.status,
            itens_count: item.total_itens,
            atualizado_em: item.updated_at,
          })),
        }),
      };
    case "gestor.detalhe_modelo_checklist":
      return {
        method: "GET",
        path: `/v1/maintenance/checklists/${encodeURIComponent(String(payload.plano_id))}`,
        token,
        transform: (data) => ({
          plano: {
            ...data,
            ...record(data.versao_atual),
            workflow_status: record(data.versao_atual).status,
            itens_count: records(data.itens).length,
          },
          ativo: data.ativo_id
            ? { id: data.ativo_id, tag: data.ativo_tag, nome: data.ativo_nome }
            : null,
          componente: data.componente_id
            ? {
                id: data.componente_id,
                tag: data.componente_tag,
                nome: data.componente_nome,
              }
            : null,
          itens: records(data.itens),
          validacoes: records(data.revisoes_tecnicas),
          ultimo_parecer: records(data.revisoes_tecnicas)[0] ?? null,
          correcoes_pendentes:
            record(data.versao_atual).status === "CHANGES_REQUESTED",
          operacional: record(data.versao_atual).status === "PUBLISHED",
        }),
      };
    case "gestor.validar_modelo_checklist":
      return {
        method: "POST",
        path: `/v1/maintenance/checklists/${encodeURIComponent(String(payload.plano_id))}/review`,
        body: {
          decisao:
            payload.decisao === "APROVAR" ? "APPROVED" : "CHANGES_REQUESTED",
          justificativa: payload.justificativa,
        },
        token,
        transform: (data) => ({
          validated: true,
          plano_id: payload.plano_id,
          decisao: payload.decisao,
          workflow_status: record(data.versao_atual).status ?? data.status,
          status: record(data.versao_atual).status ?? data.status,
        }),
      };
    case "admin.listar_modelos_checklist":
      return {
        method: "GET",
        path: queryPath("/v1/maintenance/checklists", {
          busca: payload.busca,
          limite: Math.min(Number(payload.limite ?? 100), 100),
        }),
        token,
        transform: (data) => {
          const models = records(data.itens).map(checklistPlan);
          return { total: models.length, modelos: models };
        },
      };
    case "admin.detalhe_modelo_checklist":
      return {
        method: "GET",
        path: `/v1/maintenance/checklists/${encodeURIComponent(String(payload.plano_id))}`,
        token,
        transform: adminChecklistDetail,
      };
    case "admin.salvar_modelo_checklist":
    case "admin.analises_tecnicas.converter":
      return {
        method: "POST",
        path: "/v1/maintenance/checklists/save",
        body: checklistAggregateBody(payload),
        token,
        transform: (data) => {
          const detail = adminChecklistDetail(data);
          const plan = record(detail.plano);
          return {
            saved: true,
            plano: plan,
            itens: detail.itens,
            workflow_status: plan.workflow_status,
          };
        },
      };
    case "admin.enviar_modelo_checklist_validacao":
      return {
        method: "POST",
        path: `/v1/maintenance/checklists/${encodeURIComponent(String(payload.plano_id))}/submit-configured`,
        body: {
          politica_assinatura: payload.politica_assinatura,
          comentario: payload.comentario,
          exige_segregacao: yes(payload.exige_segregacao),
          responsavel_atual_id: payload.responsavel_atual_id || null,
          usuarios_validadores: Array.isArray(payload.usuarios_validadores)
            ? payload.usuarios_validadores
            : [],
        },
        token,
        transform: (data) => {
          const current = record(data.versao_atual);
          return {
            sent: true,
            plano_id: data.id,
            workflow_status:
              checklistStatusFromNode[String(current.status ?? "IN_REVIEW")] ??
              current.status,
            demanda_tecnica: null,
          };
        },
      };
    case "admin.criar_revisao_modelo_checklist":
      return {
        method: "POST",
        path: `/v1/maintenance/checklists/${encodeURIComponent(String(payload.plano_id))}/revisions`,
        body: {},
        token,
        transform: (data) => {
          const detail = adminChecklistDetail(data);
          const plan = record(detail.plano);
          return {
            created: true,
            plano_id: plan.id,
            revisao: Number(plan.revisao ?? 1),
            workflow_status: plan.workflow_status,
            status: plan.status,
            operacional: detail.operacional,
            itens_count: records(detail.itens).length,
            plano: plan,
            itens: detail.itens,
          };
        },
      };
    case "admin.entidade.acao":
      if (payload.entidade === "planos" && payload.acao === "EXCLUIR") {
        return {
          method: "DELETE",
          path: `/v1/maintenance/checklists/${encodeURIComponent(String(payload.id))}`,
          token,
          transform: (data) => ({
            acted: data.deleted === true,
            acao: "EXCLUIR",
            entidade: "planos",
            id: payload.id,
            deleted: data.deleted === true,
            itens_rascunho_excluidos: 0,
          }),
        };
      }
      return null;
    case "admin.usuarios.listar":
      return {
        method: "GET",
        path: queryPath("/v1/admin/users", {
          busca: payload.busca,
          perfil: payload.perfil,
          status: payload.status,
          limite: payload.limite,
        }),
        token,
      };
    case "admin.usuarios.salvar": {
      const data = record(payload.dados);
      const userId = String(data.id ?? "");
      return {
        method: userId ? "PATCH" : "POST",
        path: userId
          ? `/v1/admin/users/${encodeURIComponent(userId)}`
          : "/v1/admin/users",
        body: {
          nome: data.nome,
          email: data.email || null,
          matricula: data.matricula,
          perfil: data.perfil,
          status: data.status,
          ...(data.senha_temporaria
            ? { senha_temporaria: data.senha_temporaria }
            : {}),
          area_id: data.area_id || null,
          cargo_id: data.cargo_id || null,
          especialidades: Array.isArray(data.especialidades)
            ? data.especialidades
            : [],
          escopo_ids: Array.isArray(data.escopo_ids) ? data.escopo_ids : [],
        },
        token,
      };
    }
    case "admin.usuarios.desbloquear":
      return {
        method: "POST",
        path: `/v1/admin/users/${encodeURIComponent(String(payload.usuario_id))}/unlock`,
        body: {},
        token,
      };
    case "admin.usuarios.redefinir_senha":
      return {
        method: "POST",
        path: `/v1/admin/users/${encodeURIComponent(String(payload.usuario_id))}/reset-password`,
        body: { senha_temporaria: payload.senha_temporaria },
        token,
      };
    case "admin.usuarios.revogar_sessoes":
      return {
        method: "POST",
        path: `/v1/admin/users/${encodeURIComponent(String(payload.usuario_id))}/revoke-sessions`,
        body: {},
        token,
      };
    case "admin.areas_tecnicas.listar":
      return {
        method: "GET",
        path: queryPath("/v1/admin/technical-areas", {
          status: payload.status,
        }),
        token,
      };
    case "admin.areas_tecnicas.salvar": {
      const data = record(payload.dados);
      const areaId = String(data.id ?? "");
      return {
        method: areaId ? "PATCH" : "POST",
        path: areaId
          ? `/v1/admin/technical-areas/${encodeURIComponent(areaId)}`
          : "/v1/admin/technical-areas",
        body: {
          codigo: data.codigo,
          nome: data.nome,
          descricao: data.descricao ?? "",
          status: data.status,
          exige_assinatura_padrao:
            data.exige_assinatura_padrao === true ||
            String(data.exige_assinatura_padrao).toUpperCase() === "SIM",
        },
        token,
      };
    }
    case "admin.cargos_tecnicos.listar":
      return {
        method: "GET",
        path: queryPath("/v1/admin/technical-roles", {
          area_id: payload.area_id,
          status: payload.status,
        }),
        token,
      };
    case "admin.cargos_tecnicos.salvar": {
      const data = record(payload.dados);
      const roleId = String(data.id ?? "");
      return {
        method: roleId ? "PATCH" : "POST",
        path: roleId
          ? `/v1/admin/technical-roles/${encodeURIComponent(roleId)}`
          : "/v1/admin/technical-roles",
        body: {
          area_id: data.area_id,
          codigo: data.codigo,
          nome: data.nome,
          descricao: data.descricao ?? "",
          status: data.status,
          pode_assinar:
            data.pode_assinar === true ||
            String(data.pode_assinar).toUpperCase() === "SIM",
        },
        token,
      };
    }
    case "admin.permissoes.obter":
      return { method: "GET", path: "/v1/admin/permissions", token };
    case "admin.permissoes.salvar":
      return {
        method: "PATCH",
        path: `/v1/admin/permissions/${encodeURIComponent(String(payload.perfil))}`,
        body: { permissoes: payload.permissoes },
        token,
      };
    case "admin.empresa.obter":
      return { method: "GET", path: "/v1/admin/company", token };
    case "admin.empresa.salvar": {
      const data = record(payload.dados);
      return {
        method: "PATCH",
        path: "/v1/admin/company",
        body: {
          nome: data.nome,
          logo_data_url: data.logo_data_url ?? "",
        },
        token,
      };
    }
    case "admin.acesso.estado":
      return { method: "GET", path: "/v1/admin/commercial-access", token };
    case "admin.configuracao.estado":
      return { method: "GET", path: "/v1/admin/configuration", token };
    case "admin.configuracao.validar":
      return {
        method: "POST",
        path: "/v1/admin/configuration/validate",
        body: { configuracao: payload.configuracao },
        token,
      };
    case "admin.configuracao.rascunho.salvar":
      return {
        method: "POST",
        path: "/v1/admin/configuration/drafts",
        body: {
          configuracao: payload.configuracao,
          base_versao_id: payload.base_versao_id ?? "",
        },
        token,
      };
    case "admin.configuracao.versoes":
      return {
        method: "GET",
        path: queryPath("/v1/admin/configuration/versions", {
          limite: payload.limite,
        }),
        token,
      };
    case "admin.configuracao.publicar":
      return {
        method: "POST",
        path: "/v1/admin/configuration/publish",
        body: { rascunho_id: payload.rascunho_id },
        token,
      };
    case "admin.configuracao.rollback":
      return {
        method: "POST",
        path: "/v1/admin/configuration/rollback",
        body: {
          versao_id: payload.versao_id,
          base_versao_id: payload.base_versao_id ?? "",
          motivo: payload.motivo,
        },
        token,
      };
    case "platform.motor.catalogo":
      return { method: "GET", path: "/v1/platform/motor/catalog", token };
    case "platform.motor.catalogo.validar":
      return {
        method: "POST",
        path: "/v1/platform/motor/catalog/validate",
        body: { planos: payload.planos },
        token,
      };
    case "platform.motor.catalogo.rascunho.salvar":
      return {
        method: "POST",
        path: "/v1/platform/motor/catalog/drafts",
        body: {
          planos: payload.planos,
          base_versao_id: payload.base_versao_id ?? "",
        },
        token,
      };
    case "platform.motor.catalogo.versoes":
      return {
        method: "GET",
        path: queryPath("/v1/platform/motor/catalog/versions", {
          limite: payload.limite,
        }),
        token,
      };
    case "platform.motor.catalogo.publicar":
      return {
        method: "POST",
        path: "/v1/platform/motor/catalog/publish",
        body: { rascunho_id: payload.rascunho_id },
        token,
      };
    case "platform.motor.catalogo.rollback":
      return {
        method: "POST",
        path: "/v1/platform/motor/catalog/rollback",
        body: {
          versao_id: payload.versao_id,
          base_versao_id: payload.base_versao_id ?? "",
          motivo: payload.motivo,
        },
        token,
      };
    case "admin.auditoria.listar":
      return {
        method: "GET",
        path: queryPath("/v1/admin/audit", {
          busca: payload.busca,
          grupo_acao: payload.grupo_acao,
          entidade: payload.entidade,
          responsavel_id: payload.responsavel_id,
          limite: payload.limite,
        }),
        token,
      };
    case "admin.analises_tecnicas.listar":
      return {
        method: "GET",
        path: "/v1/admin/technical-analyses",
        token,
      };
    case "admin.demandas_tecnicas.listar":
      return {
        method: "GET",
        path: queryPath("/v1/admin/technical-demands", {
          limite: payload.limite,
        }),
        token,
        transform: (data) => ({
          ...data,
          demandas: records(data.demandas).map(mapDemand),
        }),
      };
    case "admin.listar": {
      if (payload.entidade === "componentes") {
        return {
          method: "GET",
          path: queryPath("/v1/cmms/components", {
            busca: payload.busca,
            ativo_id: payload.ativo_id,
            limite: Math.min(Number(payload.limite ?? 300), 300),
          }),
          token,
          transform: (data) => ({
            entidade: "componentes",
            total: records(data.itens).length,
            rows: records(data.itens),
          }),
        };
      }
      if (payload.entidade !== "ativos") return null;
      return {
        method: "GET",
        path: queryPath("/v1/cmms/assets", {
          busca: payload.busca,
          limite: Math.min(Number(payload.limite ?? 100), 100),
        }),
        token,
        transform: (data) => ({
          entidade: "ativos",
          total: records(data.itens).length,
          rows: records(data.itens),
        }),
      };
    }
    case "gestor.dossie_ativo":
      return {
        method: "GET",
        path: `/v1/cmms/qr-context/${encodeURIComponent(String(payload.qr_payload))}`,
        token,
        transform: (data) => ({
          ...data,
          found: data.encontrado === true,
          parametros_recentes: data.parametros_atuais,
          parametros_analisados: data.parametros_atuais,
          regras_parametros: records(data.parametros_atuais).map((item) =>
            record(item.politica),
          ),
          historico_manutencao: data.historico_recente,
          consulta_registrada_em: data.servidor_em,
        }),
      };
    case "gestor.registrar_parametro":
      return {
        method: "POST",
        path: `/v1/cmms/assets/${encodeURIComponent(String(payload.ativo_id))}/readings`,
        body: {
          componente_id: payload.componente_id ?? null,
          parametro: payload.parametro,
          valor: payload.valor,
          unidade: payload.unidade,
          origem: "MANUAL",
          chave_idempotencia: `gestor-${crypto.randomUUID()}`,
        },
        token,
        transform: (data) => ({ saved: true, parametro: data.parametro }),
      };
    case "gestor.analises.salvar": {
      const analysis = record(payload.analise);
      return {
        method: "POST",
        path: `/v1/maintenance/occurrences/${encodeURIComponent(String(analysis.ocorrencia_id))}/technical-analysis`,
        body: {
          titulo: analysis.titulo,
          diagnostico: analysis.diagnostico,
          risco: analysis.risco,
          causa_provavel: analysis.causa_provavel || null,
          recomendacao: analysis.recomendacao,
          recomenda_checklist: analysis.recomenda_checklist,
          recomenda_ordem_servico: analysis.recomenda_os,
          prioridade: analysis.prioridade,
          relatorio: analysis.relatorio_tecnico ?? {},
        },
        token,
        transform: (data) => ({
          saved: true,
          sent: true,
          analise: {
            id: record(data.analise_tecnica).id ?? data.technical_analysis_id,
          },
        }),
      };
    }
    default:
      return null;
  }
}

function nodeBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function isAppsScriptUrl(apiUrl: string): boolean {
  return /script\.google\.com|script\.googleusercontent\.com/i.test(apiUrl);
}

async function executeNodeCall<T>(
  apiUrl: string,
  action: string,
  request: NodeActionRequest,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (request.body) headers["Content-Type"] = "application/json";
    if (request.token) headers.Authorization = `Bearer ${request.token}`;
    const response = await fetch(`${nodeBaseUrl(apiUrl)}${request.path}`, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: controller.signal,
    });
    const envelope = (await response.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    if (!response.ok || !envelope.ok) {
      throw new ApiRequestError(
        envelope.error?.message ??
          `A API respondeu com HTTP ${response.status}.`,
        envelope.error?.code ?? "HTTP_ERROR",
        envelope.error?.details ?? { status: response.status },
      );
    }
    const data = envelope.data ?? {};
    return {
      ...envelope,
      data: (request.transform ? request.transform(data) : data) as T,
    };
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) throw error;
      throw new ApiRequestError(
        timedOut
          ? `A API excedeu ${Math.round(timeoutMs / 1000)} segundos.`
          : "A requisição foi cancelada.",
        timedOut ? "API_TIMEOUT" : "API_ABORTED",
        { action, timeoutMs },
      );
    }
    throw new ApiRequestError(
      "Não foi possível alcançar a API Node. Verifique a rede e a configuração do endpoint.",
      "NETWORK_ERROR",
      error,
    );
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function callApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
  options: ApiCallOptions = {},
): Promise<ApiEnvelope<T>> {
  const apiUrl = getApiUrl();

  if (!apiUrl) {
    return Promise.reject(
      new ApiRequestError(
        "URL da API não configurada. Abra Configurações e informe o endpoint.",
        "API_URL_MISSING",
      ),
    );
  }

  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS.DETAIL_READ;
  const canDedupe = options.dedupe === true && signal === undefined;
  const dedupeKey = canDedupe
    ? (options.dedupeKey ?? `${apiUrl}|${action}|${stableSerialize(payload)}`)
    : "";

  if (dedupeKey) {
    const existing = inFlightReads.get(dedupeKey);
    if (existing) return existing as Promise<ApiEnvelope<T>>;
  }

  const transport = getApiTransport();
  const useNode =
    transport === "node" || (transport === "auto" && !isAppsScriptUrl(apiUrl));
  const nodeRequest = useNode ? nodeActionRequest(action, payload) : null;
  let request: Promise<ApiEnvelope<T>>;
  if (nodeRequest) {
    request = executeNodeCall<T>(
      apiUrl,
      action,
      nodeRequest,
      signal,
      timeoutMs,
    );
  } else if (useNode) {
    const legacyUrl = getLegacyApiUrl();
    request = legacyUrl
      ? executeAppsScriptCall<T>(legacyUrl, action, payload, signal, timeoutMs)
      : Promise.reject(
          new ApiRequestError(
            `A ação ${action} ainda não possui adaptador Node e o fallback legado não está configurado.`,
            "NODE_ACTION_NOT_MIGRATED",
            { action },
          ),
        );
  } else {
    request = executeAppsScriptCall<T>(
      apiUrl,
      action,
      payload,
      signal,
      timeoutMs,
    );
  }

  if (!dedupeKey) return request;

  const sharedRequest = request.finally(() => {
    if (inFlightReads.get(dedupeKey) === sharedRequest) {
      inFlightReads.delete(dedupeKey);
    }
  });

  inFlightReads.set(dedupeKey, sharedRequest as Promise<ApiEnvelope<unknown>>);
  return sharedRequest;
}

import { useEffect, useMemo, useState } from 'react'
import {
  getGestorActionAudit,
  getGestorActionDetail,
  isGestorAuthenticationError,
  validateGestorAction,
} from '../services/api/gestor'
import type {
  GestorAction,
  GestorActionAudit,
  GestorActionDetail,
  GestorChecklistItem,
  GestorDecision,
  GestorDecisionResult,
} from '../types/gestor'

export interface ActionReviewDialogProps {
  action: GestorAction
  onClose: () => void
  onDecisionComplete: (result: GestorDecisionResult) => void | Promise<void>
  onSessionExpired: () => void
}

function upper(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
}

function recordValue(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!record) return ''

  for (const key of keys) {
    const value = record[key]
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'object') continue
    return String(value)
  }

  return ''
}

function checklistValue(
  item: GestorChecklistItem,
  keys: string[],
): string {
  return recordValue(item, keys)
}

function formatDate(value?: string): string {
  if (!value) return 'Não informado'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function checklistAnswered(item: GestorChecklistItem): boolean {
  return (
    item.respondido === true ||
    upper(item.status) === 'RESPONDIDO' ||
    Boolean(checklistValue(item, ['resposta', 'valor', 'resultado']))
  )
}

function auditIntegrity(audit: GestorActionAudit | null): boolean {
  return audit?.auditoria?.integridade_ok === true
}

function auditCanFinalize(audit: GestorActionAudit | null): boolean {
  return audit?.finalizacao?.can_finalize === true
}

export function ActionReviewDialog({
  action,
  onClose,
  onDecisionComplete,
  onSessionExpired,
}: ActionReviewDialogProps) {
  const [detail, setDetail] = useState<GestorActionDetail | null>(null)
  const [audit, setAudit] = useState<GestorActionAudit | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [result, setResult] = useState<GestorDecisionResult | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, submitting])

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')

      try {
        const [detailData, auditData] = await Promise.all([
          getGestorActionDetail(action.id, controller.signal),
          getGestorActionAudit(action.id, controller.signal),
        ])

        setDetail(detailData)
        setAudit(auditData)
      } catch (cause) {
        if (controller.signal.aborted) return

        if (isGestorAuthenticationError(cause)) {
          onSessionExpired()
          return
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar a revisão da ação.',
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [action.id, onSessionExpired])

  const evidenceCountByChecklist = useMemo(() => {
    const counts = new Map<string, number>()

    for (const evidence of detail?.evidencias ?? []) {
      const checklistId = String(evidence.checklist_execucao_id ?? '')
      if (!checklistId) continue
      counts.set(checklistId, (counts.get(checklistId) ?? 0) + 1)
    }

    return counts
  }, [detail?.evidencias])

  const currentStatus = upper(detail?.acao.status ?? action.status)
  const integrityOk = auditIntegrity(audit)
  const canFinalize = auditCanFinalize(audit)
  const canDecide = currentStatus === 'AGUARDANDO_VALIDACAO' && !result
  const canApprove = canDecide && integrityOk && canFinalize
  const answeredCount = (detail?.checklist ?? []).filter(checklistAnswered).length
  const checklistTotal = detail?.checklist.length ?? 0

  async function submitDecision(decision: GestorDecision) {
    if (!canDecide || submitting) return

    const normalizedComment = comment.trim()
    if (decision === 'REPROVAR' && normalizedComment.length < 5) {
      setError('Informe um motivo de reprovação com pelo menos 5 caracteres.')
      return
    }

    const decisionLabel = decision === 'APROVAR' ? 'aprovar' : 'reprovar'
    const confirmed = window.confirm(
      'Confirma ' + decisionLabel + ' esta execução?',
    )

    if (!confirmed) return

    setSubmitting(true)
    setError('')

    try {
      const response = await validateGestorAction(
        action.id,
        decision,
        normalizedComment ||
          'Validação registrada pelo painel do gestor.',
      )

      setResult(response)
      await onDecisionComplete(response)
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }

      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível registrar a decisão.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const title = detail?.acao.titulo?.trim() || action.titulo?.trim() || 'Revisão da ação'
  const asset =
    recordValue(detail?.ativo, ['tag', 'codigo', 'id']) ||
    detail?.acao.ativo_tag ||
    detail?.acao.ativo_id ||
    action.ativo_tag ||
    action.ativo_id ||
    'Ativo não informado'
  const assetName =
    recordValue(detail?.ativo, ['nome', 'descricao']) ||
    detail?.acao.ativo_nome ||
    action.ativo_nome ||
    ''
  const execution = detail?.execucoes.at(0) ?? null
  const executionUser = recordValue(execution, [
    'usuario_id',
    'operador_id',
    'executado_por',
  ])
  const operationalResult =
    recordValue(detail?.acao, [
      'resultado_operacional',
      'resultado_final',
      'resultado',
    ]) ||
    recordValue(execution, [
      'resultado_operacional',
      'resultado_final',
      'resultado',
    ])
  const technicalResult =
    recordValue(detail?.acao, ['resultado_tecnico']) ||
    recordValue(execution, ['resultado_tecnico'])

  return (
    <div className="review-overlay" role="presentation">
      <section
        className="review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <header className="review-header">
          <div>
            <span className="eyebrow">VALIDAÇÃO DA EXECUÇÃO</span>
            <h2 id="review-title">{title}</h2>
            <p>
              {asset}
              {assetName ? ' — ' + assetName : ''}
            </p>
          </div>

          <button
            className="review-close"
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Fechar revisão"
          >
            ×
          </button>
        </header>

        {loading ? (
          <div className="review-state">Carregando detalhe e auditoria…</div>
        ) : error && !detail ? (
          <div className="review-error" role="alert">{error}</div>
        ) : detail ? (
          <div className="review-body">
            <section className="review-summary-grid">
              <article>
                <span>Status</span>
                <strong>{currentStatus || 'Não informado'}</strong>
              </article>
              <article>
                <span>Checklist</span>
                <strong>{answeredCount}/{checklistTotal}</strong>
              </article>
              <article>
                <span>Auditoria</span>
                <strong>{integrityOk ? 'Íntegra' : 'Divergência'}</strong>
              </article>
              <article>
                <span>Liberação técnica</span>
                <strong>{canFinalize ? 'Liberada' : 'Bloqueada'}</strong>
              </article>
            </section>

            <section className="review-section">
              <header>
                <div>
                  <span className="eyebrow">EXECUÇÃO</span>
                  <h3>Resultado registrado</h3>
                </div>
              </header>

              <dl className="review-facts">
                <div>
                  <dt>Operador</dt>
                  <dd>{executionUser || 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Início</dt>
                  <dd>{formatDate(execution?.iniciou_em)}</dd>
                </div>
                <div>
                  <dt>Resultado operacional</dt>
                  <dd>{operationalResult || 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Resultado técnico</dt>
                  <dd>{technicalResult || 'Não informado'}</dd>
                </div>
              </dl>
            </section>

            <section className="review-section">
              <header>
                <div>
                  <span className="eyebrow">CHECKLIST</span>
                  <h3>Respostas e evidências</h3>
                </div>
                <span className="panel-count">{checklistTotal}</span>
              </header>

              {checklistTotal === 0 ? (
                <p className="review-empty">Nenhum item de checklist encontrado.</p>
              ) : (
                <div className="review-checklist">
                  {detail.checklist.map((item, index) => {
                    const itemId = String(item.id ?? item.item_id ?? index)
                    const description =
                      checklistValue(item, [
                        'descricao',
                        'pergunta',
                        'titulo',
                        'nome',
                      ]) || 'Item ' + (index + 1)
                    const response =
                      checklistValue(item, [
                        'resposta',
                        'valor',
                        'resultado',
                      ]) || 'Sem resposta'
                    const observation =
                      checklistValue(item, [
                        'observacao',
                        'comentario',
                        'observacoes',
                      ])
                    const evidenceCount =
                      evidenceCountByChecklist.get(String(item.id ?? '')) ?? 0

                    return (
                      <article className="review-checklist-item" key={itemId}>
                        <div className="review-checklist-item__heading">
                          <strong>{description}</strong>
                          <span
                            className={
                              checklistAnswered(item)
                                ? 'answer-status answer-status--ok'
                                : 'answer-status answer-status--pending'
                            }
                          >
                            {checklistAnswered(item) ? 'Respondido' : 'Pendente'}
                          </span>
                        </div>

                        <dl>
                          <div>
                            <dt>Resposta</dt>
                            <dd>{response}</dd>
                          </div>
                          <div>
                            <dt>Observação</dt>
                            <dd>{observation || 'Sem observação'}</dd>
                          </div>
                          <div>
                            <dt>Evidências</dt>
                            <dd>{evidenceCount}</dd>
                          </div>
                        </dl>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="review-section">
              <header>
                <div>
                  <span className="eyebrow">AUDITORIA</span>
                  <h3>Integridade para decisão</h3>
                </div>
              </header>

              <div className="audit-grid">
                <article className={integrityOk ? 'audit-ok' : 'audit-error'}>
                  <span>Autoria e histórico</span>
                  <strong>{integrityOk ? 'Verificados' : 'Com divergência'}</strong>
                </article>
                <article className={canFinalize ? 'audit-ok' : 'audit-error'}>
                  <span>Checklist obrigatório</span>
                  <strong>{canFinalize ? 'Completo' : 'Incompleto'}</strong>
                </article>
                <article>
                  <span>Evidências registradas</span>
                  <strong>{detail.evidencias.length}</strong>
                </article>
                <article>
                  <span>Locks ativos</span>
                  <strong>{detail.locks.length}</strong>
                </article>
              </div>
            </section>

            {error ? <div className="review-error" role="alert">{error}</div> : null}

            {result ? (
              <div className="review-success" role="status">
                <strong>
                  {result.decisao === 'APROVAR'
                    ? 'Execução aprovada.'
                    : 'Execução reprovada.'}
                </strong>
                <span>Status final: {result.status}</span>
              </div>
            ) : (
              <section className="review-decision">
                <label>
                  Comentário da decisão
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Registre a justificativa da decisão."
                    disabled={submitting}
                    rows={3}
                  />
                </label>

                {!canApprove ? (
                  <p className="review-warning">
                    A aprovação permanece bloqueada até a API confirmar
                    checklist completo e auditoria íntegra. A reprovação continua
                    disponível para devolver a ação ao operador.
                  </p>
                ) : null}

                <div className="review-decision__actions">
                  <button
                    className="reject-button"
                    type="button"
                    disabled={!canDecide || submitting}
                    onClick={() => void submitDecision('REPROVAR')}
                  >
                    {submitting ? 'Processando…' : 'Reprovar'}
                  </button>

                  <button
                    className="approve-button"
                    type="button"
                    disabled={!canApprove || submitting}
                    onClick={() => void submitDecision('APROVAR')}
                  >
                    {submitting ? 'Processando…' : 'Aprovar execução'}
                  </button>
                </div>
              </section>
            )}
          </div>
        ) : null}

        <footer className="review-footer">
          <button
            className="secondary-button"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            {result ? 'Fechar' : 'Cancelar'}
          </button>
        </footer>
      </section>
    </div>
  )
}

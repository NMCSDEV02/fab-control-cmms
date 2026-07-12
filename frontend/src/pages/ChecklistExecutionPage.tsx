import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChecklistBatchItemInput,
  EvidenceInput,
  OperatorActionDetailData,
  OperatorStopData,
  RawChecklistItem,
} from '../types/api'
import { ActiveStopBanner } from '../components/ActiveStopBanner'

interface ChecklistExecutionPageProps {
  detail: OperatorActionDetailData
  evidenceSaving: boolean
  finalizing: boolean
  error: string
  activeStop: OperatorStopData | null
  onBack: () => void
  onRefresh: () => Promise<void>
  onSaveProgress: (items: ChecklistBatchItemInput[]) => Promise<void>
  onRegisterEvidence: (input: EvidenceInput) => Promise<void>
  onFinish: (
    items: ChecklistBatchItemInput[],
    resultado: 'OK' | 'NOK',
    observacao: string,
    durationSeconds: number,
  ) => Promise<void>
  onReturnHome: () => void
}

type DraftAnswer = {
  answer: string
  observation: string
}

type CompletionPhase = 'idle' | 'syncing' | 'success'

type CompletionSummary = {
  durationSeconds: number
  comparison: string
  checklistTotal: number
  evidenceCount: number
}

function typeOf(item: RawChecklistItem): string {
  return (item.input?.tipo_resposta || item.tipo_resposta || 'TEXTO').toUpperCase()
}

function optionsOf(item: RawChecklistItem): string[] {
  const options = item.input?.opcoes?.length ? item.input.opcoes : item.opcoes
  if (options?.length) return options
  if (typeOf(item) === 'OK_NOK') return ['OK', 'NOK', 'N/A']
  if (typeOf(item) === 'CONFIRMACAO') return ['SIM']
  return []
}

function existingAnswer(item: RawChecklistItem): string {
  const type = typeOf(item)
  if (['NUMERO', 'PARAMETRO', 'LEITURA_OPERACIONAL'].includes(type)) {
    const raw = item.valor_numero ?? item.resposta ?? ''
    return raw === null || raw === undefined ? '' : String(raw)
  }
  return item.resposta ?? ''
}

function answered(item: RawChecklistItem, draft: DraftAnswer): boolean {
  if (typeOf(item) === 'INSTRUCAO') return Boolean(draft.answer || item.respondido)
  if (typeOf(item) === 'EVIDENCIA') return (item.evidencias_count ?? 0) > 0
  return draft.answer.trim().length > 0
}

function required(item: RawChecklistItem): boolean {
  return item.obrigatorio !== false && typeOf(item) !== 'INSTRUCAO'
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  return [hours, minutes, secs]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function comparisonLabel(elapsedSeconds: number, plannedMinutes?: number): string {
  const plannedSeconds = Math.max(0, Number(plannedMinutes || 0) * 60)
  if (!plannedSeconds) return 'Tempo registrado'
  const difference = Math.floor(elapsedSeconds - plannedSeconds)
  if (difference <= 0) return 'Dentro do tempo previsto'
  return `${formatElapsed(difference)} acima do previsto`
}

export function ChecklistExecutionPage({
  detail,
  evidenceSaving,
  finalizing,
  error,
  activeStop,
  onBack,
  onRefresh,
  onSaveProgress,
  onRegisterEvidence,
  onFinish,
  onReturnHome,
}: ChecklistExecutionPageProps) {
  const items = useMemo(
    () => [...(detail.checklist?.itens ?? [])].sort((a, b) => a.ordem - b.ordem),
    [detail.checklist?.itens],
  )
  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({})
  const [message, setMessage] = useState('')
  const [showEvidence, setShowEvidence] = useState(false)
  const [evidenceName, setEvidenceName] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceObservation, setEvidenceObservation] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [completionPhase, setCompletionPhase] = useState<CompletionPhase>('idle')
  const [completionSummary, setCompletionSummary] = useState<CompletionSummary | null>(null)
  const initializedDraftKeyRef = useRef('')
  const draftStorageKey = `fab-control:checklist-draft:${detail.execucao?.id || detail.acao.id}`

  useEffect(() => {
    const serverDrafts: Record<string, DraftAnswer> = {}
    for (const item of items) {
      serverDrafts[item.id] = {
        answer: existingAnswer(item),
        observation: item.observacao ?? '',
      }
    }

    if (initializedDraftKeyRef.current !== draftStorageKey) {
      let cached: Record<string, DraftAnswer> = {}
      try {
        const stored = window.sessionStorage.getItem(draftStorageKey)
        cached = stored ? JSON.parse(stored) as Record<string, DraftAnswer> : {}
      } catch {
        cached = {}
      }

      setDrafts({ ...serverDrafts, ...cached })
      initializedDraftKeyRef.current = draftStorageKey
      setIndex((current) => Math.min(current, Math.max(0, items.length - 1)))
      return
    }

    // Atualizações do back-end, como evidências, não podem apagar respostas locais.
    setDrafts((currentDrafts) => {
      const next = { ...currentDrafts }
      for (const item of items) {
        const server = serverDrafts[item.id]
        const local = next[item.id]
        if (!local) {
          next[item.id] = server
          continue
        }
        next[item.id] = {
          answer: local.answer || server.answer,
          observation: local.observation || server.observation,
        }
      }
      return next
    })
  }, [draftStorageKey, items])

  useEffect(() => {
    if (initializedDraftKeyRef.current !== draftStorageKey) return
    if (!Object.keys(drafts).length) return
    try {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(drafts))
    } catch {
      // Armazenamento local indisponível: a execução continua usando memória.
    }
  }, [draftStorageKey, drafts])

  useEffect(() => {
    const startValue =
      detail.execucao?.iniciou_em ||
      detail.acao.iniciado_em ||
      detail.execucao?.abriu_em
    const start = startValue ? new Date(startValue).getTime() : Date.now()
    const tick = () => setElapsed(Math.max(0, (Date.now() - start) / 1000))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [detail.acao.iniciado_em, detail.execucao?.abriu_em, detail.execucao?.iniciou_em])

  useEffect(() => {
    if (completionPhase !== 'success') return
    const timer = window.setTimeout(onReturnHome, 2000)
    return () => window.clearTimeout(timer)
  }, [completionPhase, onReturnHome])

  const current = items[index]
  const currentDraft = current
    ? drafts[current.id] ?? { answer: '', observation: '' }
    : null
  const answeredCount = items.filter((item) =>
    answered(item, drafts[item.id] ?? { answer: '', observation: '' }),
  ).length
  const percentage = items.length
    ? Math.round((answeredCount / items.length) * 100)
    : 0
  const isLast = index === items.length - 1
  const currentAnswered = current && currentDraft
    ? answered(current, currentDraft)
    : false

  function updateDraft(patch: Partial<DraftAnswer>) {
    if (!current) return
    setDrafts((value) => ({
      ...value,
      [current.id]: {
        ...(value[current.id] ?? { answer: '', observation: '' }),
        ...patch,
      },
    }))
    setMessage('')
  }

  function goNext() {
    if (!current || !currentDraft) return
    if (required(current) && !currentAnswered) {
      setMessage('Responda este item antes de continuar.')
      return
    }
    if (
      typeOf(current) === 'OK_NOK' &&
      currentDraft.answer === 'NOK' &&
      currentDraft.observation.trim().length < 5
    ) {
      setMessage('Resposta NOK exige observação técnica.')
      return
    }
    setMessage('')
    setIndex((value) => Math.min(items.length - 1, value + 1))
  }

  function buildPayload(): ChecklistBatchItemInput[] {
    const payload: ChecklistBatchItemInput[] = []

    for (const item of items) {
      const draft = drafts[item.id] ?? { answer: '', observation: '' }
      const type = typeOf(item)
      if (type === 'EVIDENCIA') continue
      if (!draft.answer.trim() && !required(item)) continue
      if (!draft.answer.trim()) continue

      const base = {
        id: item.id,
        checklist_execucao_id: item.id,
        ordem: item.ordem,
        observacao: draft.observation.trim(),
      }

      if (['NUMERO', 'PARAMETRO', 'LEITURA_OPERACIONAL'].includes(type)) {
        payload.push({ ...base, valor: Number(draft.answer.replace(',', '.')) })
      } else {
        payload.push({ ...base, resposta: draft.answer })
      }
    }

    return payload
  }

  function resolveExecutionResult(): {
    resultado: 'OK' | 'NOK'
    observacao: string
  } {
    const nonConformities = items.filter((item) => {
      const draft = drafts[item.id] ?? { answer: '', observation: '' }
      return typeOf(item) === 'OK_NOK' && draft.answer === 'NOK'
    })

    const observations = items
      .map((item) => {
        const draft = drafts[item.id] ?? { answer: '', observation: '' }
        return draft.observation.trim()
      })
      .filter(Boolean)

    if (nonConformities.length) {
      return {
        resultado: 'NOK',
        observacao:
          observations.join(' | ') ||
          'Checklist concluído com condição não conforme registrada.',
      }
    }

    return {
      resultado: 'OK',
      observacao:
        observations.join(' | ') ||
        'Checklist técnico executado conforme procedimento.',
    }
  }

  async function finishExecution() {
    const missing = items.filter(
      (item) =>
        required(item) &&
        !answered(item, drafts[item.id] ?? { answer: '', observation: '' }),
    )
    if (missing.length) {
      setIndex(Math.max(0, items.findIndex((item) => item.id === missing[0].id)))
      setMessage(`Existem ${missing.length} item(ns) obrigatório(s) pendente(s).`)
      return
    }

    const invalidNok = items.find((item) => {
      const draft = drafts[item.id] ?? { answer: '', observation: '' }
      return (
        typeOf(item) === 'OK_NOK' &&
        draft.answer === 'NOK' &&
        draft.observation.trim().length < 5
      )
    })
    if (invalidNok) {
      setIndex(items.findIndex((item) => item.id === invalidNok.id))
      setMessage('Resposta NOK exige observação técnica.')
      return
    }

    const durationSeconds = Math.floor(elapsed)
    const evidenceCount = items.reduce(
      (sum, item) => sum + (item.evidencias_count ?? 0),
      0,
    )
    const result = resolveExecutionResult()

    setMessage('')
    setCompletionSummary({
      durationSeconds,
      comparison: comparisonLabel(
        durationSeconds,
        detail.plano?.tempo_estimado_min,
      ),
      checklistTotal: items.length,
      evidenceCount,
    })
    setCompletionPhase('syncing')

    try {
      await onFinish(
        buildPayload(),
        result.resultado,
        result.observacao,
        durationSeconds,
      )
      try {
        window.sessionStorage.removeItem(draftStorageKey)
      } catch {
        // Sem impacto na conclusão.
      }
      setCompletionPhase('success')
    } catch (cause) {
      setCompletionPhase('idle')
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível finalizar a execução.',
      )
    }
  }

  async function submitEvidence() {
    if (!current) return
    if (!evidenceName.trim() || !evidenceUrl.trim()) {
      setMessage('Informe o nome e o link da evidência.')
      return
    }
    await onSaveProgress(buildPayload())
    await onRegisterEvidence({
      checklist_execucao_id: current.id,
      tipo: 'FOTO',
      nome_arquivo: evidenceName.trim(),
      url: evidenceUrl.trim(),
      observacao: evidenceObservation.trim(),
    })
    setShowEvidence(false)
    setEvidenceName('')
    setEvidenceUrl('')
    setEvidenceObservation('')
    setMessage('Evidência registrada.')
  }

  if (!items.length || !current || !currentDraft) {
    return (
      <section className="screen">
        <article className="state-panel state-panel--error">
          <span className="state-panel__kicker">Checklist indisponível</span>
          <h1>Nenhum item foi retornado</h1>
          <p>A execução precisa possuir um checklist gerado pelo back-end.</p>
          <div className="detail-error-actions">
            <button type="button" className="secondary-button" onClick={onBack}>
              Voltar
            </button>
            <button type="button" onClick={() => void onRefresh()}>
              Atualizar
            </button>
          </div>
        </article>
      </section>
    )
  }

  const currentType = typeOf(current)
  const options = optionsOf(current)
  const numeric = ['NUMERO', 'PARAMETRO', 'LEITURA_OPERACIONAL'].includes(currentType)
  const evidence = currentType === 'EVIDENCIA'
  const instruction = currentType === 'INSTRUCAO'
  const min = current.input?.limite_min ?? current.limite_min
  const max = current.input?.limite_max ?? current.limite_max
  const unit = current.input?.unidade ?? current.unidade ?? ''

  return (
    <section className="screen checklist-screen">
      {activeStop && <ActiveStopBanner stop={activeStop} compact />}

      <article
        className={
          detail.execucao?.modo_execucao_manutencao === 'SEM_PARADA'
            ? 'maintenance-mode-banner maintenance-mode-banner--running'
            : 'maintenance-mode-banner maintenance-mode-banner--stopped'
        }
      >
        <span>Condição da manutenção</span>
        <strong>
          {detail.execucao?.modo_execucao_manutencao === 'SEM_PARADA'
            ? 'Execução sem parada do equipamento'
            : 'Parada técnica vinculada à execução'}
        </strong>
        <small>
          {activeStop
            ? 'A parada operacional da produção permanece registrada separadamente.'
            : detail.execucao?.modo_execucao_manutencao === 'SEM_PARADA'
              ? 'A máquina permanece em operação durante o serviço.'
              : 'Esta parada termina junto com a execução técnica.'}
        </small>
      </article>

      <article className="execution-header-card">
        <div>
          <span>Execução em andamento</span>
          <h1>{detail.acao.titulo || detail.os?.titulo}</h1>
          <p>
            {detail.componente?.tag || detail.componente?.id} —{' '}
            {detail.componente?.nome}
          </p>
        </div>
        <div className="execution-time">
          <span>Tempo de execução</span>
          <strong>{formatElapsed(elapsed)}</strong>
        </div>
        <div className="execution-progress">
          <span style={{ width: `${percentage}%` }} />
        </div>
        <small>
          Item {index + 1} de {items.length} · {answeredCount}/{items.length}{' '}
          concluídos
        </small>
      </article>

      {(message || error) && (
        <div className="checklist-alert">{error || message}</div>
      )}

      <article className="checklist-item-card">
        <div className="checklist-item-card__top">
          <span>Checklist dinâmico</span>
          <em>{current.obrigatorio === false ? 'Opcional' : 'Obrigatório'}</em>
        </div>
        <h2>{current.titulo}</h2>
        <p>{current.instrucao || 'Registre a condição observada.'}</p>

        {numeric && (
          <div className="numeric-answer">
            <input
              type="number"
              step="any"
              value={currentDraft.answer}
              onChange={(event) => updateDraft({ answer: event.target.value })}
              placeholder="Digite o valor"
            />
            {unit && <span>{unit}</span>}
            {(min !== undefined || max !== undefined) && (
              <small>
                Faixa: {min ?? '—'} a {max ?? '—'} {unit}
              </small>
            )}
          </div>
        )}

        {!numeric && !evidence && !instruction && options.length > 0 && (
          <div className="answer-options">
            {options.map((option) => (
              <button
                type="button"
                className={
                  currentDraft.answer === option
                    ? 'answer-option answer-option--selected'
                    : 'answer-option'
                }
                key={option}
                onClick={() => updateDraft({ answer: option })}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {!numeric && !evidence && !instruction && options.length === 0 && (
          <textarea
            className="text-answer"
            value={currentDraft.answer}
            onChange={(event) => updateDraft({ answer: event.target.value })}
            placeholder={current.input?.placeholder || 'Digite a resposta'}
          />
        )}

        {instruction && (
          <button
            type="button"
            className={
              currentDraft.answer
                ? 'instruction-check instruction-check--done'
                : 'instruction-check'
            }
            onClick={() =>
              updateDraft({ answer: currentDraft.answer ? '' : 'LIDO' })
            }
          >
            {currentDraft.answer
              ? '✓ Instrução confirmada'
              : 'Confirmar leitura da instrução'}
          </button>
        )}

        {evidence && (
          <div className="evidence-answer">
            <div
              className={
                (current.evidencias_count ?? 0) > 0
                  ? 'evidence-status evidence-status--done'
                  : 'evidence-status'
              }
            >
              <strong>
                {(current.evidencias_count ?? 0) > 0
                  ? 'Evidência anexada'
                  : 'Evidência necessária'}
              </strong>
              <span>{current.evidencias_count ?? 0} arquivo(s) registrado(s)</span>
            </div>
            <button type="button" onClick={() => setShowEvidence(true)}>
              Anexar evidência
            </button>
          </div>
        )}

        {!evidence && !instruction && (
          <label className="observation-field">
            <span>Observação técnica</span>
            <textarea
              value={currentDraft.observation}
              onChange={(event) =>
                updateDraft({ observation: event.target.value })
              }
              placeholder="Opcional. Obrigatória quando houver não conformidade."
            />
          </label>
        )}
      </article>

      {showEvidence && (
        <div className="evidence-modal-backdrop">
          <form
            className="evidence-modal"
            onSubmit={(event) => {
              event.preventDefault()
              void submitEvidence()
            }}
          >
            <div>
              <span>Evidência do checklist</span>
              <h2>{current.titulo}</h2>
            </div>
            <label>
              <span>Nome do arquivo</span>
              <input
                value={evidenceName}
                onChange={(event) => setEvidenceName(event.target.value)}
                placeholder="foto-equipamento.jpg"
              />
            </label>
            <label>
              <span>Link do arquivo</span>
              <input
                type="url"
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
                placeholder="https://drive.google.com/..."
              />
            </label>
            <label>
              <span>Observação</span>
              <textarea
                value={evidenceObservation}
                onChange={(event) => setEvidenceObservation(event.target.value)}
                placeholder="Descreva o que a evidência comprova."
              />
            </label>
            <small>
              Nesta versão, o back-end atual registra uma URL. O upload direto da
              câmera será implementado quando o serviço de arquivos for criado.
            </small>
            <div className="evidence-modal__actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowEvidence(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={evidenceSaving}
              >
                {evidenceSaving ? 'Enviando…' : 'Registrar evidência'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="checklist-footer">
        <button
          type="button"
          className="secondary-button"
          disabled={index === 0 || finalizing}
          onClick={() => {
            setMessage('')
            setIndex((value) => Math.max(0, value - 1))
          }}
        >
          Anterior
        </button>
        {!isLast ? (
          <button
            type="button"
            className="primary-button"
            disabled={finalizing}
            onClick={goNext}
          >
            Próximo item
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={finalizing}
            onClick={() => void finishExecution()}
          >
            {finalizing ? 'Sincronizando…' : 'Finalizar e sincronizar'}
          </button>
        )}
      </div>

      {completionPhase !== 'idle' && completionSummary && (
        <div className="execution-completion-overlay" role="dialog" aria-modal="true">
          <article className="execution-completion-card">
            {completionPhase === 'syncing' ? (
              <div className="execution-completion-center">
                <div className="execution-sync-spinner" aria-hidden="true" />
                <h2>Sincronizando dados</h2>
                <p>
                  Enviando checklist, parâmetros, evidências e tempo total.
                </p>
              </div>
            ) : (
              <div className="execution-completion-center">
                <div className="execution-success-check" aria-hidden="true">✓</div>
                <h2>Execução concluída</h2>
                <p>Dados sincronizados com sucesso.</p>
                <div className="execution-result-grid">
                  <div>
                    <span>Tempo de execução</span>
                    <strong>{formatElapsed(completionSummary.durationSeconds)}</strong>
                  </div>
                  <div>
                    <span>Comparação</span>
                    <strong>{completionSummary.comparison}</strong>
                  </div>
                  <div>
                    <span>Checklist</span>
                    <strong>
                      {completionSummary.checklistTotal}/
                      {completionSummary.checklistTotal}
                    </strong>
                  </div>
                  <div>
                    <span>Evidências</span>
                    <strong>{completionSummary.evidenceCount} foto(s)</strong>
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  )
}

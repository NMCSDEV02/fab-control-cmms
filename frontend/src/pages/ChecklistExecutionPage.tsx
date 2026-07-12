import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChecklistBatchItemInput,
  EvidencePhotoUploadInput,
  EvidenceSaveData,
  OperatorActionDetailData,
  OperatorStopData,
  RawChecklistItem,
} from '../types/api'
import { ActiveStopBanner } from '../components/ActiveStopBanner'
import { prepareEvidencePhoto } from '../services/media/imageEvidence'

interface ChecklistExecutionPageProps {
  detail: OperatorActionDetailData
  evidenceSaving: boolean
  finalizing: boolean
  error: string
  activeStop: OperatorStopData | null
  onBack: () => void
  onRefresh: () => Promise<void>
  onSaveProgress: (items: ChecklistBatchItemInput[]) => Promise<void>
  onRegisterEvidence: (inputs: EvidencePhotoUploadInput[]) => Promise<EvidenceSaveData[]>
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

type SelectedEvidence = { file: File; previewUrl: string }

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


function evidenceMinimum(item: RawChecklistItem): number {
  const configured = Number(item.evidencia_min_fotos ?? 0)
  if (Number.isFinite(configured) && configured > 0) return Math.min(10, Math.floor(configured))
  return typeOf(item) === 'EVIDENCIA' || item.evidencia_obrigatoria ? 1 : 0
}

function normalizeTechnicalText(value?: string): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

function isHourMeterItem(item: RawChecklistItem): boolean {
  return normalizeTechnicalText(item.parametro_nome) === 'HORIMETRO' ||
    normalizeTechnicalText(item.titulo).includes('HORIMETRO')
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
  if (typeOf(item) === 'EVIDENCIA') return (item.evidencias_count ?? 0) >= evidenceMinimum(item)
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
  const [selectedEvidence, setSelectedEvidence] = useState<SelectedEvidence[]>([])
  const [evidenceObservation, setEvidenceObservation] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [completionPhase, setCompletionPhase] = useState<CompletionPhase>('idle')
  const [completionSummary, setCompletionSummary] = useState<CompletionSummary | null>(null)
  const initializedDraftKeyRef = useRef('')
  const selectedEvidenceRef = useRef<SelectedEvidence[]>([])
  const draftStorageKey = `fab-control:checklist-draft:${detail.execucao?.id || detail.acao.id}`

  useEffect(() => {
    const serverDrafts: Record<string, DraftAnswer> = {}
    for (const item of items) {
      const serverAnswer = existingAnswer(item)
      const automaticHourMeterValue =
        isHourMeterItem(item) && detail.horimetro?.automatico
          ? String(detail.horimetro.total_horas ?? detail.ativo?.horimetro_atual ?? '')
          : ''
      serverDrafts[item.id] = {
        answer: serverAnswer || automaticHourMeterValue,
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
    selectedEvidenceRef.current = selectedEvidence
  }, [selectedEvidence])

  useEffect(() => () => {
    selectedEvidenceRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
  }, [])

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
    if (isHourMeterItem(current)) {
      const reading = Number(currentDraft.answer.replace(',', '.'))
      const currentTotal = Number(detail.horimetro?.total_horas ?? detail.ativo?.horimetro_atual ?? 0)
      if (!Number.isFinite(reading) || reading < currentTotal) {
        setMessage(`O horímetro total não pode ser menor que ${currentTotal} h.`)
        return
      }
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

    const evidenceMissing = items.filter(
      (item) => evidenceMinimum(item) > (item.evidencias_count ?? 0),
    )
    if (evidenceMissing.length) {
      setIndex(Math.max(0, items.findIndex((item) => item.id === evidenceMissing[0].id)))
      const first = evidenceMissing[0]
      setMessage(
        `Faltam ${evidenceMinimum(first) - (first.evidencias_count ?? 0)} foto(s) obrigatória(s) neste item.`,
      )
      return
    }

    const invalidHourMeter = items.find((item) => {
      if (!isHourMeterItem(item)) return false
      const draft = drafts[item.id] ?? { answer: '', observation: '' }
      const reading = Number(draft.answer.replace(',', '.'))
      const currentTotal = Number(detail.horimetro?.total_horas ?? detail.ativo?.horimetro_atual ?? 0)
      return !Number.isFinite(reading) || reading < currentTotal
    })
    if (invalidHourMeter) {
      setIndex(items.findIndex((item) => item.id === invalidHourMeter.id))
      setMessage('O horímetro total não pode diminuir.')
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
    if (!selectedEvidence.length) {
      setMessage('Tire ou selecione pelo menos uma foto.')
      return
    }

    const currentCount = current.evidencias_count ?? 0
    if (currentCount + selectedEvidence.length > 10) {
      setMessage('O limite é de 10 fotos por item.')
      return
    }

    await onSaveProgress(buildPayload())
    const prepared: EvidencePhotoUploadInput[] = []
    for (const selected of selectedEvidence) {
      prepared.push(
        await prepareEvidencePhoto(
          selected.file,
          current.id,
          evidenceObservation.trim(),
        ),
      )
    }

    await onRegisterEvidence(prepared)
    selectedEvidence.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setSelectedEvidence([])
    setShowEvidence(false)
    setEvidenceObservation('')
    const total = currentCount + prepared.length
    const minimum = evidenceMinimum(current)
    setMessage(
      total >= minimum
        ? 'Quantidade mínima de evidências atendida.'
        : `Evidências registradas: ${total} de ${minimum}.`,
    )
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
  const hourMeter = isHourMeterItem(current)
  const currentHourMeter = Number(detail.horimetro?.total_horas ?? detail.ativo?.horimetro_atual ?? 0)
  const serviceHours = detail.horimetro?.contador_servico_horas
  const evidenceMin = evidenceMinimum(current)
  const evidenceCount = current.evidencias_count ?? 0

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
              step={hourMeter ? '0.1' : 'any'}
              min={hourMeter ? currentHourMeter : undefined}
              readOnly={hourMeter && Boolean(detail.horimetro?.automatico)}
              value={currentDraft.answer}
              onChange={(event) => updateDraft({ answer: event.target.value })}
              placeholder="Digite o valor"
            />
            {unit && <span>{unit}</span>}
            {(min !== undefined || max !== undefined) && !hourMeter && (
              <small>
                Faixa: {min ?? '—'} a {max ?? '—'} {unit}
              </small>
            )}
            {hourMeter && (
              <div className="horimeter-guidance">
                <strong>Horímetro total acumulado</strong>
                <span>Último valor: {currentHourMeter} h · não pode ser zerado ou reduzido.</span>
                <span>
                  {detail.horimetro?.automatico
                    ? 'Leitura automática por telemetria. Confirme o valor exibido.'
                    : 'Leitura manual: informe o valor mostrado no equipamento.'}
                </span>
                <span>
                  {serviceHours === null || serviceHours === undefined
                    ? 'Contador desde o último serviço ainda não foi reiniciado.'
                    : `${serviceHours} h desde o último serviço.`}
                </span>
                {!detail.horimetro?.automatico && !currentDraft.answer && (
                  <button type="button" onClick={() => updateDraft({ answer: String(currentHourMeter) })}>
                    Usar {currentHourMeter} h
                  </button>
                )}
              </div>
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
                evidenceCount >= evidenceMin
                  ? 'evidence-status evidence-status--done'
                  : 'evidence-status'
              }
            >
              <strong>
                {evidenceCount >= evidenceMin
                  ? 'Evidência validada'
                  : 'Evidência necessária'}
              </strong>
              <span>{evidenceCount} de {evidenceMin} foto(s) obrigatória(s)</span>
            </div>
            {(current.evidencias?.length ?? 0) > 0 && (
              <div className="evidence-gallery">
                {current.evidencias?.map((photo, photoIndex) => (
                  <a
                    href={photo.url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    key={photo.id || `${photo.nome_arquivo}-${photoIndex}`}
                    className="evidence-thumbnail"
                  >
                    {photo.thumbnail_url ? (
                      <img src={photo.thumbnail_url} alt={photo.nome_arquivo || `Evidência ${photoIndex + 1}`} />
                    ) : (
                      <span>Foto {photoIndex + 1}</span>
                    )}
                  </a>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setShowEvidence(true)}>
              {evidenceCount ? 'Adicionar fotos' : 'Tirar foto'}
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
            <label className="evidence-file-picker">
              <span>Fotos da evidência</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? [])
                  setSelectedEvidence((currentFiles) => {
                    const remaining = Math.max(0, 10 - evidenceCount - currentFiles.length)
                    const additions = files.slice(0, remaining).map((file) => ({
                      file,
                      previewUrl: URL.createObjectURL(file),
                    }))
                    return [...currentFiles, ...additions]
                  })
                  event.currentTarget.value = ''
                }}
              />
              <b>Abrir câmera ou galeria</b>
            </label>
            {selectedEvidence.length > 0 && (
              <div className="evidence-preview-grid">
                {selectedEvidence.map((selected, photoIndex) => (
                  <figure key={`${selected.file.name}-${photoIndex}`}>
                    <img src={selected.previewUrl} alt={`Prévia ${photoIndex + 1}`} />
                    <figcaption>
                      <span>{selected.file.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(selected.previewUrl)
                          setSelectedEvidence((itemsValue) => itemsValue.filter((_, indexValue) => indexValue !== photoIndex))
                        }}
                      >
                        Remover
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <label>
              <span>Observação</span>
              <textarea
                value={evidenceObservation}
                onChange={(event) => setEvidenceObservation(event.target.value)}
                placeholder="Descreva o que as fotos comprovam."
              />
            </label>
            <small>
              Exigência configurada pelo administrador: {evidenceMin} foto(s). Já registradas: {evidenceCount}.
            </small>
            <div className="evidence-modal__actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  selectedEvidence.forEach((item) => URL.revokeObjectURL(item.previewUrl))
                  setSelectedEvidence([])
                  setShowEvidence(false)
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={evidenceSaving}
              >
                {evidenceSaving ? 'Enviando…' : `Enviar ${selectedEvidence.length || ''} foto(s)`}
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

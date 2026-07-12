import { useEffect, useState } from 'react'
import { ActiveStopBanner } from '../components/ActiveStopBanner'
import type {
  FinalizationValidationData,
  OperatorActionDetailData,
  OperatorStopData,
} from '../types/api'

interface FinalizationPageProps {
  detail: OperatorActionDetailData
  validation: FinalizationValidationData
  activeStop: OperatorStopData | null
  finalizing: boolean
  error: string
  onBack: () => void
  onFinalize: (
    resultado: 'OK' | 'NOK',
    observacao: string,
    durationSeconds: number,
  ) => Promise<void>
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

export function FinalizationPage({
  detail,
  validation,
  activeStop,
  finalizing,
  error,
  onBack,
  onFinalize,
}: FinalizationPageProps) {
  const [result, setResult] = useState<'OK' | 'NOK'>('OK')
  const [observation, setObservation] = useState('')
  const [elapsed, setElapsed] = useState(0)

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
  }, [
    detail.acao.iniciado_em,
    detail.execucao?.abriu_em,
    detail.execucao?.iniciou_em,
  ])

  const total = detail.checklist?.total ?? detail.checklist?.itens?.length ?? 0
  const answered = detail.checklist?.respondidos ?? total
  const evidenceCount = detail.checklist?.itens?.reduce(
    (sum, item) => sum + (item.evidencias_count ?? 0),
    0,
  ) ?? 0
  const nokNeedsObservation = result === 'NOK' && observation.trim().length < 5

  if (!validation.can_finalize) {
    return (
      <section className="screen finalization-screen">
        <article className="state-panel state-panel--error">
          <span className="state-panel__kicker">Finalização bloqueada</span>
          <h1>O checklist ainda possui pendências</h1>
          <p>{validation.message || 'Retorne ao checklist e corrija os itens indicados.'}</p>
          <div className="finalization-summary">
            <b>{validation.finalizacao?.pending_count ?? 0} respostas</b>
            <b>{validation.finalizacao?.evidence_missing_count ?? 0} evidências</b>
            <b>{validation.finalizacao?.blockers_count ?? 0} bloqueios</b>
          </div>
          <button type="button" className="primary-button" onClick={onBack}>
            Voltar ao checklist
          </button>
        </article>
      </section>
    )
  }

  return (
    <section className="screen finalization-screen">
      {activeStop && <ActiveStopBanner stop={activeStop} compact />}

      <article className="finalization-hero">
        <span>Etapa final</span>
        <h1>Finalizar execução</h1>
        <p>
          Revise o resultado do serviço antes de sincronizar e enviar a ação para validação.
        </p>
      </article>

      <article className="finalization-work-card">
        <div>
          <span>Serviço executado</span>
          <h2>{detail.acao.titulo || detail.os?.titulo || 'Ação de manutenção'}</h2>
          <p>
            {detail.ativo?.tag || detail.ativo?.id} — {detail.ativo?.nome}
          </p>
          <p>
            {detail.componente?.tag || detail.componente?.id} — {detail.componente?.nome}
          </p>
        </div>
        <div className="finalization-time">
          <span>Tempo de execução</span>
          <strong>{formatElapsed(elapsed)}</strong>
        </div>
      </article>

      <div className="finalization-metrics">
        <div><span>Checklist</span><strong>{answered}/{total}</strong></div>
        <div><span>Evidências</span><strong>{evidenceCount}</strong></div>
        <div><span>Bloqueios</span><strong>{validation.finalizacao?.blockers_count ?? 0}</strong></div>
      </div>

      {error && <div className="checklist-alert">{error}</div>}

      <article className="finalization-form-card">
        <div className="finalization-form-card__heading">
          <span>Resultado da execução</span>
          <h2>Como o equipamento foi entregue?</h2>
        </div>

        <div className="finalization-result-options">
          <button
            type="button"
            className={result === 'OK' ? 'finalization-result finalization-result--ok selected' : 'finalization-result finalization-result--ok'}
            onClick={() => setResult('OK')}
          >
            <strong>Resultado OK</strong>
            <span>Serviço concluído e condição aprovada.</span>
          </button>
          <button
            type="button"
            className={result === 'NOK' ? 'finalization-result finalization-result--nok selected' : 'finalization-result finalization-result--nok'}
            onClick={() => setResult('NOK')}
          >
            <strong>Resultado NOK</strong>
            <span>Permanece uma condição não conforme.</span>
          </button>
        </div>

        <label className="finalization-observation">
          <span>Observação final</span>
          <textarea
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            placeholder={
              result === 'NOK'
                ? 'Obrigatória. Descreva a condição que permaneceu não conforme.'
                : 'Opcional. Registre detalhes relevantes da entrega.'
            }
          />
          {nokNeedsObservation && (
            <small>Resultado NOK exige uma observação com pelo menos 5 caracteres.</small>
          )}
        </label>
      </article>

      <div className="finalization-footer">
        <button type="button" className="secondary-button" onClick={onBack} disabled={finalizing}>
          Voltar
        </button>
        <button
          type="button"
          className="finalize-button"
          disabled={finalizing || nokNeedsObservation}
          onClick={() => void onFinalize(
            result,
            observation.trim() || 'Checklist técnico executado conforme procedimento.',
            Math.floor(elapsed),
          )}
        >
          {finalizing ? 'Finalizando…' : 'Finalizar e sincronizar'}
        </button>
      </div>
    </section>
  )
}

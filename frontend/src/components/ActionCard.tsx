import type { OperatorAction } from '../types/operator'
import { Countdown } from './Countdown'

export interface ActionCardProps {
  action: OperatorAction
  compact?: boolean
  onOpen: (action: OperatorAction) => void
}

const priorityLabels = {
  NORMAL: 'Prioridade normal',
  ALTA: 'Prioridade alta',
  CRITICA: 'Prioridade crítica',
} as const

export function ActionCard({ action, compact = false, onOpen }: ActionCardProps) {
  if (compact) {
    return (
      <button className="emergency-row" type="button" onClick={() => onOpen(action)}>
        <span className="emergency-row__content">
          <strong>{action.title}</strong>
          <small>{action.assetTag} — {action.assetName}</small>
          <small>{action.componentTag} · {action.componentName}</small>
        </span>
        <span className="emergency-row__cta">
          {action.status === 'EM_EXECUCAO' ? 'Continuar' : 'Iniciar agora'}
        </span>
      </button>
    )
  }

  return (
    <button className="action-card" type="button" onClick={() => onOpen(action)}>
      <div className="action-card__heading">
        <div>
          <strong>{action.title}</strong>
          <span>{action.assetTag} — {action.assetName}</span>
          <span>{action.componentTag} — {action.componentName}</span>
        </div>
        <span className="type-chip">{action.type}</span>
      </div>

      <p>{action.description}</p>

      <div className="chip-list">
        <span className={`priority-chip priority-chip--${action.priority.toLowerCase()}`}>
          {priorityLabels[action.priority]}
        </span>
        {action.crew.map((crew) => (
          <span className="neutral-chip" key={crew}>{crew}</span>
        ))}
        {action.progress && action.progress.total > 0 && (
          <span className="neutral-chip">
            {action.progress.answered}/{action.progress.total} respondidos
          </span>
        )}
      </div>

      <div className="countdown-box">
        <span>Gerada em</span>
        <Countdown target={action.startAt} />
      </div>

      <footer>
        <span>
          {action.durationMinutes
            ? `Duração prevista: ${action.durationMinutes} min`
            : `Status: ${action.status.replaceAll('_', ' ')}`}
        </span>
        <strong>Abrir atividade →</strong>
      </footer>
    </button>
  )
}

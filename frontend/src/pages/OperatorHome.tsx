import { useMemo, useState } from 'react'
import type { OperatorAction } from '../types/operator'
import { ActionCard } from '../components/ActionCard'
import { ArrowIcon, QrIcon } from '../components/Icons'

type QueueView = 'PENDENTES' | 'EM_EXECUCAO' | 'CONCLUIDAS'

export interface OperatorHomeProps {
  actions: OperatorAction[]
  loading: boolean
  error: string
  configured: boolean
  onRetry: () => void
  onOpenSettings: () => void
  onOpenAction: (action: OperatorAction) => void
  onOpenQr: () => void
}

function statusMatchesView(action: OperatorAction, view: QueueView): boolean {
  if (view === 'PENDENTES') return action.status === 'PENDENTE'
  if (view === 'EM_EXECUCAO') return action.status === 'EM_EXECUCAO'

  // Para o operador, uma ação aguardando validação já teve a execução concluída.
  return action.status === 'AGUARDANDO_VALIDACAO' || action.status === 'CONCLUIDA'
}

function queueDescription(view: QueueView): string {
  if (view === 'PENDENTES') return 'Ações liberadas para início.'
  if (view === 'EM_EXECUCAO') return 'Atividades em execução neste turno.'
  return 'Execuções finalizadas ou aguardando validação.'
}

export function OperatorHome({
  actions,
  loading,
  error,
  configured,
  onRetry,
  onOpenSettings,
  onOpenAction,
  onOpenQr,
}: OperatorHomeProps) {
  const [activeView, setActiveView] = useState<QueueView>('PENDENTES')

  const pending = useMemo(
    () => actions.filter((action) => action.status === 'PENDENTE'),
    [actions],
  )
  const running = useMemo(
    () => actions.filter((action) => action.status === 'EM_EXECUCAO'),
    [actions],
  )
  const completed = useMemo(
    () =>
      actions.filter(
        (action) =>
          action.status === 'AGUARDANDO_VALIDACAO' ||
          action.status === 'CONCLUIDA',
      ),
    [actions],
  )

  const visibleActions = useMemo(
    () => actions.filter((action) => statusMatchesView(action, activeView)),
    [actions, activeView],
  )
  const nonScheduled = useMemo(
    () => visibleActions.filter((action) => action.group === 'NAO_PROGRAMADA'),
    [visibleActions],
  )
  const scheduled = useMemo(
    () => visibleActions.filter((action) => action.group === 'PROGRAMADA'),
    [visibleActions],
  )

  const currentEmergency =
    activeView === 'PENDENTES'
      ? pending.find((action) => action.group === 'NAO_PROGRAMADA')
      : undefined

  if (!configured) {
    return (
      <section className="screen">
        <article className="state-panel">
          <span className="state-panel__kicker">Integração necessária</span>
          <h1>Configure a API e o token do operador</h1>
          <p>
            A interface está pronta. Falta informar o endpoint publicado do Apps Script
            e uma sessão válida do perfil operador.
          </p>
          <button type="button" onClick={onOpenSettings}>Abrir configurações</button>
        </article>
      </section>
    )
  }

  if (loading && actions.length === 0) {
    return (
      <section className="screen">
        <div className="loading-panel" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <strong>Carregando ações do operador</strong>
          <p>Consultando o FAB Control.</p>
        </div>
      </section>
    )
  }

  if (error && actions.length === 0) {
    return (
      <section className="screen">
        <article className="state-panel state-panel--error">
          <span className="state-panel__kicker">Falha na sincronização</span>
          <h1>Não foi possível carregar a fila</h1>
          <p>{error}</p>
          <button type="button" onClick={onRetry}>Tentar novamente</button>
        </article>
      </section>
    )
  }

  return (
    <section className="screen operator-home">
      {error && (
        <div className="inline-warning">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>Atualizar</button>
        </div>
      )}

      {currentEmergency && (
        <button
          type="button"
          className="live-alert"
          onClick={() => onOpenAction(currentEmergency)}
        >
          <div>
            <span>Ação emergencial agora</span>
            <strong>{currentEmergency.title}</strong>
            <small>
              {currentEmergency.assetTag} · {currentEmergency.componentName}
            </small>
          </div>
          <span className="live-alert__cta">
            Abrir <ArrowIcon />
          </span>
        </button>
      )}

      <header className="screen-heading screen-heading--with-action">
        <div>
          <span>Fila de operação</span>
          <h1>Manutenções do turno</h1>
          <p>{queueDescription(activeView)}</p>
        </div>
        <button className="refresh-button" type="button" onClick={onRetry} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      <div className="summary-grid" aria-label="Filtrar ações por situação">
        <button
          type="button"
          className={activeView === 'PENDENTES' ? 'summary-card summary-card--active' : 'summary-card'}
          aria-pressed={activeView === 'PENDENTES'}
          onClick={() => setActiveView('PENDENTES')}
        >
          <strong>{pending.length}</strong>
          <span>Pendentes</span>
        </button>
        <button
          type="button"
          className={activeView === 'EM_EXECUCAO' ? 'summary-card summary-card--active' : 'summary-card'}
          aria-pressed={activeView === 'EM_EXECUCAO'}
          onClick={() => setActiveView('EM_EXECUCAO')}
        >
          <strong>{running.length}</strong>
          <span>Em execução</span>
        </button>
        <button
          type="button"
          className={activeView === 'CONCLUIDAS' ? 'summary-card summary-card--active' : 'summary-card'}
          aria-pressed={activeView === 'CONCLUIDAS'}
          onClick={() => setActiveView('CONCLUIDAS')}
        >
          <strong>{completed.length}</strong>
          <span>Concluídas</span>
        </button>
      </div>

      <section className="content-section maintenance-type-section">
        <div className="section-heading">
          <div>
            <h2>Não programadas</h2>
            <p>Ocorrências, emergências e intervenções não previstas.</p>
          </div>
          <span>{nonScheduled.length}</span>
        </div>

        {nonScheduled.length > 0 ? (
          <div className={activeView === 'PENDENTES' ? 'emergency-list' : 'scheduled-grid'}>
            {nonScheduled.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                compact={activeView === 'PENDENTES'}
                onOpen={onOpenAction}
              />
            ))}
          </div>
        ) : (
          <article className="queue-empty-card">
            <strong>Nenhuma manutenção não programada</strong>
            <p>Não há ações deste tipo na situação selecionada.</p>
          </article>
        )}
      </section>

      <section className="content-section maintenance-type-section">
        <div className="section-heading">
          <div>
            <h2>Programadas</h2>
            <p>Preventivas, inspeções e atividades dentro da janela planejada.</p>
          </div>
          <span>{scheduled.length}</span>
        </div>

        {scheduled.length > 0 ? (
          <div className="scheduled-grid">
            {scheduled.map((action) => (
              <ActionCard key={action.id} action={action} onOpen={onOpenAction} />
            ))}
          </div>
        ) : (
          <article className="queue-empty-card">
            <strong>Nenhuma manutenção programada</strong>
            <p>Não há ações deste tipo na situação selecionada.</p>
          </article>
        )}
      </section>

      <button className="qr-shortcut" type="button" onClick={onOpenQr}>
        <span className="qr-shortcut__icon"><QrIcon /></span>
        <span className="qr-shortcut__copy">
          <strong>Consultar equipamento por QR</strong>
          <small>Parâmetros, histórico técnico e ações disponíveis.</small>
        </span>
        <span className="qr-shortcut__button">Ler</span>
      </button>
    </section>
  )
}

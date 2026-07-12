import type { OperatorAction } from '../types/operator'
import { ActionCard } from '../components/ActionCard'
import { ArrowIcon, QrIcon } from '../components/Icons'

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
  const pending = actions.filter((action) => action.status === 'PENDENTE')
  const running = actions.filter((action) => action.status === 'EM_EXECUCAO')
  const completed = actions.filter((action) => action.status === 'CONCLUIDA')
  const emergency = pending.filter((action) => action.group === 'NAO_PROGRAMADA')
  const scheduled = pending.filter((action) => action.group === 'PROGRAMADA')
  const currentEmergency = emergency[0]

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
          <p>Dados sincronizados com o contrato real do operador.</p>
        </div>
        <button className="refresh-button" type="button" onClick={onRetry} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      <div className="summary-grid" aria-label="Resumo das ações">
        <article className="summary-card summary-card--active">
          <strong>{pending.length}</strong>
          <span>Pendentes</span>
        </article>
        <article className="summary-card">
          <strong>{running.length}</strong>
          <span>Em execução</span>
        </article>
        <article className="summary-card">
          <strong>{completed.length}</strong>
          <span>Concluídas</span>
        </article>
      </div>

      {actions.length === 0 && (
        <article className="empty-panel">
          <strong>Nenhuma ação para exibir</strong>
          <p>A fila será atualizada quando uma ação for atribuída ao operador.</p>
        </article>
      )}

      {emergency.length > 0 && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Não programadas</h2>
              <p>Ação imediata por criticidade.</p>
            </div>
            <span>{emergency.length} urgente</span>
          </div>
          <div className="emergency-list">
            {emergency.map((action) => (
              <ActionCard key={action.id} action={action} compact onOpen={onOpenAction} />
            ))}
          </div>
        </section>
      )}

      {scheduled.length > 0 && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Programadas</h2>
              <p>Preparação e execução dentro da janela.</p>
            </div>
            <span>{scheduled.length} hoje</span>
          </div>
          <div className="scheduled-grid">
            {scheduled.map((action) => (
              <ActionCard key={action.id} action={action} onOpen={onOpenAction} />
            ))}
          </div>
        </section>
      )}

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

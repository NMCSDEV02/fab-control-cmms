import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaintenanceStartDecision, MaintenanceStopMode, OperatorActionDetailData, OperatorStopData, RawChecklistItem } from '../types/api'
import { ActiveStopBanner } from '../components/ActiveStopBanner'

interface ActionDetailPageProps {
  detail: OperatorActionDetailData | null
  loading: boolean
  error: string
  starting: boolean
  activeStop: OperatorStopData | null
  onBack: () => void
  onRetry: () => void
  onStart: (decision: MaintenanceStartDecision) => Promise<void>
  onContinue: () => void
}

function normalizedStatus(status?: string): string {
  return (status ?? '').toUpperCase()
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

function getRisk(item: RawChecklistItem): { icon: string; title: string; text: string } | null {
  const text = `${item.titulo} ${item.instrucao ?? ''}`.toLowerCase()
  if (text.includes('elétr') || text.includes('energia')) {
    return { icon: '⚡', title: 'Choque elétrico', text: item.instrucao || item.titulo }
  }
  if (text.includes('press') || text.includes('pneum')) {
    return { icon: '◉', title: 'Pressão', text: item.instrucao || item.titulo }
  }
  if (text.includes('esmag') || text.includes('prens') || text.includes('aprision')) {
    return { icon: '↔', title: 'Prensamento', text: item.instrucao || item.titulo }
  }
  if (text.includes('corte') || text.includes('lâmina')) {
    return { icon: '✦', title: 'Corte', text: item.instrucao || item.titulo }
  }
  if (item.categoria?.toUpperCase() === 'SEGURANCA') {
    return { icon: '!', title: 'Risco mecânico', text: item.instrucao || item.titulo }
  }
  return null
}

export function ActionDetailPage({
  detail,
  loading,
  error,
  starting,
  activeStop,
  onBack,
  onRetry,
  onStart,
  onContinue,
}: ActionDetailPageProps) {
  const [readProgress, setReadProgress] = useState(0)
  const [readComplete, setReadComplete] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [startDecisionOpen, setStartDecisionOpen] = useState(false)
  const maxProgressRef = useRef(0)
  const screenRef = useRef<HTMLElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    maxProgressRef.current = 0
    setReadProgress(0)
    setReadComplete(false)
    setAccepted(false)
    setStartDecisionOpen(false)

    const scrollRoot = screenRef.current?.closest('.app-content') as HTMLElement | null
    if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'auto' })
  }, [detail?.acao.id])

  useEffect(() => {
    let animationFrame = 0
    let resizeObserver: ResizeObserver | null = null

    const calculateReadingProgress = () => {
      const screen = screenRef.current
      const gate = endRef.current
      if (!screen || !gate) return

      const scrollRoot = screen.closest('.app-content') as HTMLElement | null
      const rootBounds = scrollRoot?.getBoundingClientRect()
      const viewportTop = rootBounds?.top ?? 0
      const viewportBottom = rootBounds?.bottom ?? window.innerHeight
      const viewportHeight = Math.max(1, viewportBottom - viewportTop)
      const screenBounds = screen.getBoundingClientRect()
      const gateBounds = gate.getBoundingClientRect()

      // Funciona tanto quando o scroll ocorre em .app-content quanto no documento.
      const distanceRead = Math.max(0, viewportTop - screenBounds.top)
      const gateOffset = Math.max(1, gate.offsetTop)
      const readingTarget = Math.max(
        1,
        gateOffset - viewportHeight + Math.min(220, viewportHeight * 0.35),
      )

      const gateReached =
        gateBounds.top <= viewportBottom - Math.min(72, viewportHeight * 0.1)

      const rootAtBottom = scrollRoot
        ? scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight <= 12
        : document.documentElement.scrollHeight - window.scrollY - window.innerHeight <= 12

      const calculated = gateReached || rootAtBottom
        ? 100
        : Math.min(99, Math.max(0, Math.round((distanceRead / readingTarget) * 100)))

      const nextProgress = Math.max(maxProgressRef.current, calculated)
      maxProgressRef.current = nextProgress
      setReadProgress((current) => current === nextProgress ? current : nextProgress)

      if (nextProgress >= 100) setReadComplete(true)
    }

    const scheduleCalculation = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(calculateReadingProgress)
    }

    // Captura scroll de qualquer elemento, incluindo navegadores móveis.
    document.addEventListener('scroll', scheduleCalculation, true)
    document.addEventListener('touchmove', scheduleCalculation, { passive: true, capture: true })
    window.addEventListener('scroll', scheduleCalculation, { passive: true })
    window.addEventListener('resize', scheduleCalculation)
    window.addEventListener('orientationchange', scheduleCalculation)

    // Verificação periódica evita depender exclusivamente do evento de scroll.
    const pollingId = window.setInterval(calculateReadingProgress, 120)

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleCalculation)
      if (screenRef.current) resizeObserver.observe(screenRef.current)
      const scrollRoot = screenRef.current?.closest('.app-content')
      if (scrollRoot) resizeObserver.observe(scrollRoot)
    }

    scheduleCalculation()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearInterval(pollingId)
      document.removeEventListener('scroll', scheduleCalculation, true)
      document.removeEventListener('touchmove', scheduleCalculation, true)
      window.removeEventListener('scroll', scheduleCalculation)
      window.removeEventListener('resize', scheduleCalculation)
      window.removeEventListener('orientationchange', scheduleCalculation)
      resizeObserver?.disconnect()
    }
  }, [detail?.acao.id, loading])

  const items = detail?.checklist?.itens ?? []
  const risks = useMemo(() => {
    const seen = new Set<string>()
    return items
      .map(getRisk)
      .filter((risk): risk is NonNullable<typeof risk> => {
        if (!risk || seen.has(risk.title)) return false
        seen.add(risk.title)
        return true
      })
  }, [items])

  const status = normalizedStatus(
    detail?.acao.status || detail?.operator_screen?.header?.status,
  )
  const uiState = normalizedStatus(detail?.ui?.state)
  const alreadyStarted = status === 'EM_EXECUCAO' || uiState === 'EM_EXECUCAO'
  const startButton = detail?.operator_screen?.action_bar?.buttons?.find(
    (button) =>
      button.endpoint === 'operador.iniciar_acao' ||
      ['INICIAR', 'INICIAR_ACAO', 'START'].includes(
        normalizedStatus(button.id),
      ),
  )
  const canStartByState =
    ['PENDENTE', 'ABERTA', 'AGUARDANDO_INICIO'].includes(status) ||
    uiState === 'AGUARDANDO_INICIO'
  const canStart = Boolean(
    detail?.ui?.can_start ||
    startButton?.enabled ||
    canStartByState,
  )
  const acceptanceId = `technical-acceptance-${detail?.acao.id ?? 'action'}`
  const configuredStopMode = (
    detail?.acao.modo_parada_manutencao ||
    detail?.plano?.modo_parada_manutencao ||
    'DECISAO_EXECUTOR'
  ).toUpperCase() as MaintenanceStopMode
  const equipmentAlreadyStopped =
    Boolean(activeStop) ||
    normalizedStatus(detail?.ativo?.status) === 'PARADO'

  function startWithConfiguredMode() {
    if (configuredStopMode === 'OBRIGATORIA' || equipmentAlreadyStopped) {
      void onStart('PARAR_EQUIPAMENTO')
      return
    }
    if (configuredStopMode === 'SEM_PARADA') {
      void onStart('SEM_PARADA')
      return
    }
    setStartDecisionOpen(true)
  }

  if (loading) {
    return (
      <section className="screen">
        <div className="loading-panel">
          <span className="loading-spinner" aria-hidden="true" />
          <strong>Carregando análise técnica</strong>
          <p>Consultando a ação e o checklist no back-end.</p>
        </div>
      </section>
    )
  }

  if (error || !detail) {
    return (
      <section className="screen">
        <article className="state-panel state-panel--error">
          <span className="state-panel__kicker">Detalhes indisponíveis</span>
          <h1>Não foi possível abrir a ação</h1>
          <p>{error || 'A API não retornou conteúdo.'}</p>
          <div className="detail-error-actions">
            <button type="button" className="secondary-button" onClick={onBack}>Voltar</button>
            <button type="button" onClick={onRetry}>Tentar novamente</button>
          </div>
        </article>
      </section>
    )
  }

  const technical = detail.analise_tecnica
  const steps =
    technical?.etapas?.length
      ? technical.etapas.map((step, index) => ({
          ordem: step.ordem ?? index + 1,
          titulo: step.titulo || `Etapa ${index + 1}`,
          descricao: step.descricao || '',
        }))
      : items.map((item) => ({
          ordem: item.ordem,
          titulo: item.titulo,
          descricao: item.instrucao || 'Executar conforme procedimento.',
        }))

  const nrs = technical?.nrs ?? []
  const tools = technical?.ferramentas ?? []

  return (
    <section ref={screenRef} className="screen technical-screen">
      <div className="technical-progress">
        <div>
          <strong>Leitura da análise técnica</strong>
          <span>{readComplete ? '100% concluída' : `${readProgress}% lida`}</span>
        </div>
        <div
          className="technical-progress__bar"
          role="progressbar"
          aria-label="Progresso da leitura técnica"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={readProgress}
        >
          <span style={{ width: `${readProgress}%` }} />
        </div>
      </div>

      <button type="button" className="back-link" onClick={onBack}>← Voltar para a fila</button>

      {activeStop && <ActiveStopBanner stop={activeStop} />}

      <article className="technical-hero">
        <div className="technical-hero__top">
          <span className={`status-chip status-chip--${alreadyStarted ? 'online' : 'pending'}`}>
            {alreadyStarted ? 'Em execução' : 'Aguardando início'}
          </span>
          <span className="type-chip">{detail.acao.tipo || detail.plano?.tipo || 'MANUTENÇÃO'}</span>
        </div>
        <h1>{detail.acao.titulo || detail.os?.titulo || 'Ação de manutenção'}</h1>
        <p>{detail.acao.descricao || detail.os?.descricao || 'Sem descrição operacional.'}</p>
        <div className="technical-identification">
          <span><strong>{detail.ativo?.tag || detail.ativo?.id}</strong>{detail.ativo?.nome}</span>
          <span><strong>{detail.componente?.tag || detail.componente?.id}</strong>{detail.componente?.nome}</span>
        </div>
      </article>

      <article className="technical-summary-card">
        <span className="technical-kicker">Relatório técnico operacional</span>
        <div className="technical-summary-row">
          <b>01</b>
          <div>
            <strong>Situação identificada</strong>
            <p>{technical?.situacao || detail.acao.descricao || detail.os?.descricao || 'Ação cadastrada para execução.'}</p>
          </div>
        </div>
        <div className="technical-summary-row">
          <b>02</b>
          <div>
            <strong>Causa provável</strong>
            <p>{technical?.causa_provavel || 'Não informada no contrato atual. Confirmar durante a inspeção.'}</p>
          </div>
        </div>
        <div className="technical-summary-row">
          <b>03</b>
          <div>
            <strong>Resultado esperado</strong>
            <p>{technical?.resultado_esperado || `Concluir ${detail.plano?.nome || detail.acao.titulo} com registros e evidências exigidos.`}</p>
          </div>
        </div>
      </article>

      <article className="workflow-card-real">
        <div className="workflow-card-real__heading">
          <div>
            <span className="technical-kicker">Fluxo de execução</span>
            <h2>Etapas do serviço</h2>
          </div>
          <span>{steps.length} etapas</span>
        </div>
        <div className="workflow-track-real">
          {steps.map((step) => (
            <div className="workflow-step-real" key={`${step.ordem}-${step.titulo}`}>
              <b>{String(step.ordem).padStart(2, '0')}</b>
              <div>
                <strong>{step.titulo}</strong>
                <p>{step.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      {risks.length > 0 && (
        <article className="technical-section-card">
          <span className="technical-kicker">Riscos identificados</span>
          <div className="risk-icon-grid">
            {risks.map((risk) => (
              <div className="risk-icon-card" key={risk.title}>
                <span aria-hidden="true">{risk.icon}</span>
                <div><strong>{risk.title}</strong><p>{risk.text}</p></div>
              </div>
            ))}
          </div>
        </article>
      )}

      <article className="technical-section-card">
        <span className="technical-kicker">Segurança obrigatória</span>
        <ul className="technical-list">
          {detail.plano?.requer_bloqueio === 'SIM' && <li>Aplicar bloqueio antes da intervenção.</li>}
          <li>Confirmar condição segura do equipamento e da área.</li>
          <li>Executar somente os itens previstos no checklist.</li>
        </ul>
        {nrs.length > 0 && (
          <div className="nr-chip-row">
            {nrs.map((nr) => <span key={nr}>{nr}</span>)}
          </div>
        )}
      </article>

      {tools.length > 0 && (
        <article className="technical-section-card">
          <span className="technical-kicker">Ferramentas e instrumentos</span>
          <div className="tool-icon-grid">
            {tools.map((tool, index) => (
              <div className="tool-icon-card" key={`${tool.nome}-${index}`}>
                <span aria-hidden="true">⌁</span>
                <strong>{tool.nome}</strong>
              </div>
            ))}
          </div>
        </article>
      )}

      <div className="technical-data-grid">
        <div><span>OS</span><strong>{detail.os?.codigo || detail.os?.id || 'Não informada'}</strong></div>
        <div><span>Duração prevista</span><strong>{detail.plano?.tempo_estimado_min ? `${detail.plano.tempo_estimado_min} min` : 'Não informada'}</strong></div>
        <div><span>Gerada em</span><strong>{formatDate(detail.acao.gerado_em)}</strong></div>
        <div><span>Checklist</span><strong>{detail.checklist?.total ?? items.length} itens</strong></div>
        <div>
          <span>Parada da máquina</span>
          <strong>
            {alreadyStarted && detail.execucao?.modo_execucao_manutencao
              ? detail.execucao.modo_execucao_manutencao === 'SEM_PARADA'
                ? 'Execução sem parada'
                : 'Parada técnica ativa'
              : configuredStopMode === 'OBRIGATORIA'
                ? 'Obrigatória'
                : configuredStopMode === 'SEM_PARADA'
                  ? 'Sem parada'
                  : 'Decisão do executor'}
          </strong>
        </div>
      </div>

      <div ref={endRef} className="reading-gate">
        <div className={readComplete ? 'reading-gate__message reading-gate__message--ready' : 'reading-gate__message'}>
          {readComplete
            ? 'Análise percorrida até o final. Confirme a leitura.'
            : 'Role a análise até o final para liberar a confirmação.'}
        </div>
        <label
          htmlFor={acceptanceId}
          className={readComplete ? 'reading-confirmation' : 'reading-confirmation reading-confirmation--locked'}
        >
          <input
            id={acceptanceId}
            type="checkbox"
            checked={accepted}
            disabled={!readComplete}
            onChange={(event) => setAccepted(event.currentTarget.checked)}
          />
          <span>
            <strong>Confirmo a leitura técnica</strong>
            Li a análise, compreendi as etapas e os riscos da atividade.
          </span>
        </label>
      </div>

      {startDecisionOpen && (
        <div className="evidence-modal-backdrop">
          <article className="evidence-modal maintenance-start-modal" role="dialog" aria-modal="true">
            <div>
              <span>Condição de execução</span>
              <h2>Como esta manutenção será realizada?</h2>
              <p>
                Esta escolha registra a parada técnica da manutenção. Ela não encerra
                nem substitui uma parada operacional informada pela produção.
              </p>
            </div>

            <button
              type="button"
              className="maintenance-start-choice maintenance-start-choice--stop"
              disabled={starting}
              onClick={() => {
                setStartDecisionOpen(false)
                void onStart('PARAR_EQUIPAMENTO')
              }}
            >
              <strong>Parar equipamento</strong>
              <span>A máquina será marcada como parada durante a execução técnica.</span>
            </button>

            <button
              type="button"
              className="maintenance-start-choice"
              disabled={starting}
              onClick={() => {
                setStartDecisionOpen(false)
                void onStart('SEM_PARADA')
              }}
            >
              <strong>Executar sem parada</strong>
              <span>A intervenção será realizada mantendo o equipamento em operação.</span>
            </button>

            <button
              type="button"
              className="secondary-button"
              disabled={starting}
              onClick={() => setStartDecisionOpen(false)}
            >
              Cancelar
            </button>
          </article>
        </div>
      )}

      <div className="technical-action-bar">
        <button type="button" className="secondary-button" onClick={onBack}>Voltar</button>
        {alreadyStarted ? (
          <button type="button" className="primary-button" onClick={onContinue}>
            Continuar execução
          </button>
        ) : readComplete && accepted && canStart ? (
          <button
            type="button"
            className="primary-button"
            onClick={startWithConfiguredMode}
            disabled={starting}
          >
            {starting ? 'Iniciando…' : 'Iniciar execução'}
          </button>
        ) : (
          <div className="start-locked" aria-live="polite">
            {!readComplete
              ? 'Leia até o final'
              : !accepted
                ? 'Marque a confirmação de leitura'
                : !canStart
                  ? 'Ação indisponível para início'
                  : 'Preparando início'}
          </div>
        )}
      </div>
    </section>
  )
}

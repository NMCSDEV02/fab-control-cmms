import { useEffect, useMemo, useRef, useState } from 'react'
import type { OperatorActionDetailData, OperatorStopData, RawChecklistItem } from '../types/api'
import { ActiveStopBanner } from '../components/ActiveStopBanner'

interface ActionDetailPageProps {
  detail: OperatorActionDetailData | null
  loading: boolean
  error: string
  starting: boolean
  activeStop: OperatorStopData | null
  onBack: () => void
  onRetry: () => void
  onStart: () => Promise<void>
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
  const [readComplete, setReadComplete] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setReadComplete(false)
    setAccepted(false)
  }, [detail?.acao.id])

  useEffect(() => {
    const target = endRef.current
    const root = document.querySelector('.app-content')
    if (!target || !root || readComplete) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setReadComplete(true)
      },
      { root, threshold: 0.65 },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [detail, readComplete])

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
    <section className="screen technical-screen">
      <div className="technical-progress">
        <div>
          <strong>Leitura da análise técnica</strong>
          <span>{readComplete ? '100% concluída' : 'Role até o final'}</span>
        </div>
        <div className="technical-progress__bar">
          <span style={{ width: readComplete ? '100%' : '32%' }} />
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
            onClick={() => void onStart()}
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

import { useEffect, useMemo, useState } from 'react'
import {
  assumeGestorTechnicalDemand,
  decideGestorTechnicalDemand,
  forwardGestorTechnicalDemand,
  isGestorAuthenticationError,
  signGestorTechnicalDemand,
} from '../services/api/gestor'
import type {
  GestorTechnicalContext,
  GestorTechnicalDemand,
} from '../types/gestor'
import {
  CheckIcon,
  ChevronRightIcon,
  ShieldIcon,
  UsersIcon,
  ValidationIcon,
} from './Icons'

interface TechnicalDemandDialogProps {
  demand: GestorTechnicalDemand
  context: GestorTechnicalContext
  onClose: () => void
  onProgress: (message: string) => Promise<void>
  onChanged: (message: string) => Promise<void>
  onSessionExpired: () => void
}

type DemandOperation = 'forward' | 'sign' | 'approve' | 'return' | 'release'

function upper(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
}

function humanize(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .replaceAll('_', ' ')
    .toLocaleLowerCase('pt-BR')
  return normalized
    ? normalized.charAt(0).toLocaleUpperCase('pt-BR') + normalized.slice(1)
    : 'Não informado'
}

function signaturesPending(demand: GestorTechnicalDemand): number {
  return Math.max(
    0,
    Number(demand.assinaturas_necessarias ?? 0) -
      Number(demand.assinaturas_realizadas ?? 0),
  )
}

function recommendedOperation(
  demand: GestorTechnicalDemand,
  context: GestorTechnicalContext,
): DemandOperation {
  if (
    signaturesPending(demand) > 0 &&
    context.pode_assinar &&
    upper(demand.exige_assinatura) === 'SIM'
  ) {
    return 'sign'
  }
  return upper(demand.entidade_tipo) === 'ORDEM_SERVICO_RASCUNHO'
    ? 'release'
    : 'approve'
}

const OPERATION_COPY: Record<DemandOperation, {
  label: string
  detail: string
  submit: string
}> = {
  approve: {
    label: 'Aprovar tecnicamente',
    detail: 'Confirma que o conteúdo está apto a seguir no fluxo.',
    submit: 'Aprovar com parecer',
  },
  release: {
    label: 'Liberar para operação',
    detail: 'Autoriza a ordem para execução no chão de fábrica.',
    submit: 'Liberar para operação',
  },
  sign: {
    label: 'Assinar tecnicamente',
    detail: 'Registra sua identidade e declaração na versão atual.',
    submit: 'Registrar assinatura',
  },
  forward: {
    label: 'Encaminhar',
    detail: 'Transfere para outra área ou especialidade com rastreabilidade.',
    submit: 'Encaminhar solicitação',
  },
  return: {
    label: 'Devolver ao Administrador',
    detail: 'Solicita correção e mantém o parecer no histórico.',
    submit: 'Devolver com parecer',
  },
}

export function TechnicalDemandDialog({
  demand,
  context,
  onClose,
  onProgress,
  onChanged,
  onSessionExpired,
}: TechnicalDemandDialogProps) {
  const [currentDemand, setCurrentDemand] = useState(demand)
  const [operation, setOperation] = useState<DemandOperation>(
    recommendedOperation(demand, context),
  )
  const [areaId, setAreaId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [opinion, setOpinion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    setCurrentDemand(demand)
    setOperation(recommendedOperation(demand, context))
    setOpinion('')
    setFeedback('')
    setError('')
  }, [demand])

  const roles = useMemo(
    () => context.cargos.filter((role) => !areaId || role.area_id === areaId),
    [areaId, context.cargos],
  )

  const pendingSignatures = signaturesPending(currentDemand)
  const isAssigned = Boolean(currentDemand.responsavel_atual_id)
  const requiresSignature = upper(currentDemand.exige_assinatura) === 'SIM'
  const canSign = context.pode_assinar && requiresSignature && pendingSignatures > 0
  const isOrder = upper(currentDemand.entidade_tipo) === 'ORDEM_SERVICO_RASCUNHO'
  const decisionReady = pendingSignatures === 0

  const availableOperations = useMemo(() => {
    const options: DemandOperation[] = []
    if (canSign) options.push('sign')
    options.push(isOrder ? 'release' : 'approve')
    options.push('forward', 'return')
    return options
  }, [canSign, isOrder])

  function handleFailure(cause: unknown, fallback: string) {
    if (isGestorAuthenticationError(cause)) {
      onSessionExpired()
      return
    }
    setError(cause instanceof Error ? cause.message : fallback)
  }

  async function assume() {
    setSubmitting(true)
    setError('')
    setFeedback('')
    try {
      const result = await assumeGestorTechnicalDemand(currentDemand.id)
      setCurrentDemand(result.demanda)
      setOperation(recommendedOperation(result.demanda, context))
      setFeedback('Responsabilidade confirmada. Agora analise o contexto e conclua o próximo passo abaixo.')
      await onProgress('Demanda assumida. O SLA de primeira resposta foi registrado.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível assumir a demanda.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submit() {
    setError('')
    setFeedback('')
    if (opinion.trim().length < 5) {
      setError(
        operation === 'sign'
          ? 'Registre a declaração da assinatura.'
          : 'Registre um parecer técnico objetivo.',
      )
      return
    }
    if (operation === 'forward' && !areaId) {
      setError('Selecione a área técnica de destino.')
      return
    }
    if (
      (operation === 'approve' || operation === 'release') &&
      !decisionReady
    ) {
      setError('Conclua as assinaturas obrigatórias antes da decisão final.')
      return
    }

    setSubmitting(true)
    try {
      if (operation === 'forward') {
        await forwardGestorTechnicalDemand({
          demanda_id: currentDemand.id,
          para_area_id: areaId,
          para_cargo_id: roleId,
          motivo: opinion.trim(),
        })
        await onChanged('Solicitação encaminhada com rastreabilidade do parecer.')
        return
      }

      if (operation === 'sign') {
        const result = await signGestorTechnicalDemand(
          currentDemand.id,
          opinion.trim(),
        )
        setCurrentDemand(result.demanda)
        setOpinion('')
        const remaining = signaturesPending(result.demanda)
        if (remaining === 0) {
          setOperation(isOrder ? 'release' : 'approve')
          setFeedback('Assinaturas concluídas. A solicitação está pronta para a decisão final.')
        } else if (result.already_signed) {
          setOperation('forward')
          setFeedback(`Sua assinatura já estava registrada. Ainda faltam ${remaining} assinatura(s); encaminhe para outro cargo autorizado.`)
        } else {
          setFeedback(`Assinatura registrada. Ainda faltam ${remaining} assinatura(s). Encaminhe para outro assinante se necessário.`)
        }
        await onProgress(
          result.already_signed
            ? 'Sua assinatura já constava na versão atual.'
            : 'Assinatura técnica registrada na versão atual.',
        )
        return
      }

      const decision = operation === 'return'
        ? 'DEVOLVER_ADMIN'
        : operation === 'release'
          ? 'LIBERAR_OPERACAO'
          : 'APROVAR'
      await decideGestorTechnicalDemand(
        currentDemand.id,
        decision,
        opinion.trim(),
      )
      await onChanged(
        operation === 'return'
          ? 'Solicitação devolvida ao Administrador.'
          : operation === 'release'
            ? 'Solicitação liberada para o fluxo operacional.'
            : 'Solicitação aprovada tecnicamente.',
      )
    } catch (cause) {
      handleFailure(cause, 'Não foi possível concluir a decisão.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="review-overlay" role="presentation">
      <section
        className="review-dialog technical-demand-dialog manager-demand-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="technical-demand-title"
      >
        <header className="review-dialog__header">
          <div>
            <span className="eyebrow">
              FILTRO TÉCNICO · {currentDemand.area_atual_nome || 'SEM ÁREA'}
            </span>
            <h2 id="technical-demand-title">{currentDemand.titulo}</h2>
            <p>
              {humanize(currentDemand.entidade_tipo)} · {currentDemand.entidade_id}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="technical-demand-summary">
          <span className="status-pill status-pill--blue">
            {humanize(currentDemand.status)}
          </span>
          <span className="priority-chip">{humanize(currentDemand.prioridade)}</span>
          <span>{currentDemand.cargo_atual_nome || 'Qualquer cargo da área'}</span>
          <span>
            {pendingSignatures
              ? `${pendingSignatures} assinatura(s) pendente(s)`
              : 'Assinaturas atendidas'}
          </span>
        </div>

        <ol className="manager-demand-progress" aria-label="Etapas da solicitação">
          <li className="is-complete">
            <b><CheckIcon /></b>
            <span><strong>Recebida</strong><small>Escopo confirmado</small></span>
          </li>
          <li className={isAssigned ? 'is-complete' : 'is-current'}>
            <b>{isAssigned ? <CheckIcon /> : '2'}</b>
            <span><strong>Responsável</strong><small>{isAssigned ? 'Demanda assumida' : 'Aguardando aceite'}</small></span>
          </li>
          <li className={decisionReady ? 'is-complete' : isAssigned ? 'is-current' : ''}>
            <b>{decisionReady ? <CheckIcon /> : '3'}</b>
            <span><strong>Validação</strong><small>{decisionReady ? 'Requisitos atendidos' : 'Análise e assinaturas'}</small></span>
          </li>
          <li className={decisionReady && isAssigned ? 'is-current' : ''}>
            <b>4</b>
            <span><strong>Decisão</strong><small>Aprovar, liberar ou devolver</small></span>
          </li>
        </ol>

        <article className="manager-demand-context">
          <ValidationIcon />
          <span>
            <strong>O que precisa ser avaliado</strong>
            <p>{currentDemand.descricao || 'Sem descrição complementar. Consulte o documento ou registro de origem antes de decidir.'}</p>
          </span>
        </article>

        {!isAssigned ? (
          <section className="manager-assume-step">
            <div>
              <span className="eyebrow">PRÓXIMO PASSO</span>
              <h3>Assuma a solicitação para começar</h3>
              <p>Isso registra a primeira resposta do SLA e identifica você como responsável técnico. Depois, a janela continua aberta para análise e decisão.</p>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={submitting}
              onClick={() => void assume()}
            >
              {submitting ? 'Assumindo…' : 'Assumir e continuar'}
              <ChevronRightIcon />
            </button>
          </section>
        ) : (
          <>
            <section className="manager-demand-next">
              <header>
                <div>
                  <span className="eyebrow">ESCOLHA O RESULTADO</span>
                  <h3>
                    {pendingSignatures
                      ? 'Conclua a validação técnica'
                      : 'Registre sua decisão'}
                  </h3>
                </div>
                {requiresSignature ? (
                  <span className={decisionReady ? 'is-ready' : 'is-pending'}>
                    <ShieldIcon />
                    {decisionReady ? 'Assinaturas concluídas' : `${pendingSignatures} pendente(s)`}
                  </span>
                ) : null}
              </header>

              <div className="manager-demand-operations" role="radiogroup" aria-label="Resultado da solicitação">
                {availableOperations.map((option) => {
                  const copy = OPERATION_COPY[option]
                  const disabled =
                    (option === 'approve' || option === 'release') &&
                    !decisionReady
                  return (
                    <button
                      className={operation === option ? 'is-active' : ''}
                      type="button"
                      role="radio"
                      aria-checked={operation === option}
                      disabled={disabled}
                      key={option}
                      onClick={() => {
                        setOperation(option)
                        setError('')
                        setFeedback('')
                      }}
                    >
                      {option === 'forward' ? <UsersIcon /> : option === 'sign' ? <ShieldIcon /> : <ValidationIcon />}
                      <span><strong>{copy.label}</strong><small>{copy.detail}</small></span>
                      <i>{operation === option ? <CheckIcon /> : null}</i>
                    </button>
                  )
                })}
              </div>
            </section>

            {operation === 'forward' ? (
              <div className="technical-route-grid">
                <label>
                  <span>Área de destino</span>
                  <select
                    value={areaId}
                    onChange={(event) => {
                      setAreaId(event.target.value)
                      setRoleId('')
                    }}
                  >
                    <option value="">Selecione a área</option>
                    {context.areas.map((area) => (
                      <option key={area.id} value={area.id}>{area.nome}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Cargo de destino</span>
                  <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
                    <option value="">Qualquer cargo da área</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <label className="technical-opinion-field manager-opinion-field">
              <span>
                {operation === 'sign'
                  ? 'Declaração de assinatura'
                  : operation === 'forward'
                    ? 'Motivo do encaminhamento'
                    : operation === 'return'
                      ? 'Correção necessária'
                      : 'Parecer técnico'}
              </span>
              <textarea
                rows={5}
                value={opinion}
                onChange={(event) => setOpinion(event.target.value)}
                placeholder={
                  operation === 'return'
                    ? 'Explique objetivamente o que deve ser corrigido antes de uma nova análise.'
                    : 'Registre diagnóstico, risco, condição de aceite e recomendação.'
                }
              />
              <small>O texto ficará vinculado ao histórico e à sua identidade.</small>
            </label>
          </>
        )}

        {feedback ? (
          <div className="feedback feedback--success" role="status">{feedback}</div>
        ) : null}
        {error ? <div className="feedback feedback--error" role="alert">{error}</div> : null}

        <footer className="review-dialog__footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            Fechar
          </button>
          {isAssigned ? (
            <button
              className="primary-button"
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Processando…' : OPERATION_COPY[operation].submit}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  )
}

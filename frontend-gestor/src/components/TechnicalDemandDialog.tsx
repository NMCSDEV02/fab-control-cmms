import { useEffect, useMemo, useState } from 'react'
import {
  assumeGestorTechnicalDemand,
  decideGestorTechnicalDemand,
  forwardGestorTechnicalDemand,
  getGestorChecklistModelDetail,
  isGestorAuthenticationError,
  signGestorTechnicalDemand,
} from '../services/api/gestor'
import type {
  GestorChecklistModelDetail,
  GestorTechnicalBrief,
  GestorTechnicalContext,
  GestorTechnicalDemand,
} from '../types/gestor'
import {
  CheckIcon,
  ChecklistIcon,
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

type RecommendedAction = 'assume' | 'sign' | 'approve' | 'release' | 'forward'
type DetailPanel = 'return' | 'forward' | 'briefing' | 'note' | null

const DEFAULT_OPINIONS = {
  approve: 'Conteúdo tecnicamente revisado e aprovado para continuidade do fluxo.',
  release: 'Escopo, segurança, etapas e critérios de aceite revisados para liberação operacional.',
  sign: 'Declaro que revisei o escopo e os requisitos técnicos desta versão.',
}

function upper(value: unknown): string {
  return String(value ?? '').trim().toLocaleUpperCase('pt-BR')
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

function isChecklistDemand(demand: GestorTechnicalDemand): boolean {
  return ['CHECKLIST_MODELO', 'PLANO_CHECKLIST'].includes(
    upper(demand.entidade_tipo),
  )
}

function defaultDemandBrief(demand: GestorTechnicalDemand): GestorTechnicalBrief {
  return {
    situacao:
      demand.descricao ||
      demand.titulo ||
      'Intervenção técnica encaminhada pelo Administrador.',
    causa_provavel: 'A confirmar na inspeção inicial do equipamento',
    resultado_esperado:
      'Concluir a intervenção com o equipamento em condição segura e operacional.',
    riscos: [{
      tipo: upper(demand.prioridade || 'OPERACIONAL'),
      titulo: 'Risco da intervenção',
      descricao:
        'Interromper o serviço se a condição encontrada exceder o escopo autorizado.',
    }],
    seguranca: [
      'Confirmar autorização, identificação do ativo e condição segura da área.',
      'Isolar as fontes de energia aplicáveis antes de acessar a zona de risco.',
      'Registrar e comunicar qualquer desvio do escopo aprovado.',
    ],
    nrs: ['NR-12'],
    ferramentas: [
      { tipo: 'INSPECAO', nome: 'Instrumento compatível com a atividade' },
      { tipo: 'REGISTRO', nome: 'Dispositivo para evidência fotográfica' },
    ],
    etapas: [
      {
        ordem: 1,
        titulo: 'Preparar e isolar',
        descricao: 'Confirmar o ativo, a autorização e as medidas de segurança.',
      },
      {
        ordem: 2,
        titulo: 'Inspecionar',
        descricao: 'Verificar a condição informada e registrar a evidência inicial.',
      },
      {
        ordem: 3,
        titulo: 'Executar',
        descricao: 'Realizar somente o serviço aprovado e registrar desvios.',
      },
      {
        ordem: 4,
        titulo: 'Testar e liberar',
        descricao: 'Validar o resultado e registrar a condição final.',
      },
    ],
    evidencias_requeridas: [
      'Condição encontrada',
      'Teste ou condição final',
    ],
    criterio_aceite:
      'Serviço concluído, condição segura confirmada e evidências obrigatórias registradas.',
  }
}

function nextAction(
  demand: GestorTechnicalDemand,
  context: GestorTechnicalContext,
  signedCurrentVersion: boolean,
): RecommendedAction {
  if (!demand.responsavel_atual_id) return 'assume'
  if (signaturesPending(demand) > 0) {
    return context.pode_assinar && !signedCurrentVersion ? 'sign' : 'forward'
  }
  return upper(demand.entidade_tipo) === 'ORDEM_SERVICO_RASCUNHO'
    ? 'release'
    : 'approve'
}

const ACTION_CONTENT: Record<RecommendedAction, {
  title: string
  detail: string
  button: string
}> = {
  assume: {
    title: 'Assuma esta solicitação',
    detail: 'O sistema registra você como responsável e inicia o atendimento.',
    button: 'Assumir e continuar',
  },
  sign: {
    title: 'Registre sua assinatura técnica',
    detail: 'Sua identidade ficará vinculada à versão que você revisou.',
    button: 'Assinar e continuar',
  },
  approve: {
    title: 'Aprove o conteúdo técnico',
    detail: 'A solicitação está pronta para seguir para a próxima etapa.',
    button: 'Aprovar e continuar',
  },
  release: {
    title: 'Libere para a operação',
    detail: 'O briefing do Operador já está preenchido e pode ser ajustado se necessário.',
    button: 'Liberar para operação',
  },
  forward: {
    title: 'Envie para o especialista certo',
    detail: 'Ainda falta uma assinatura. Escolha a área ou o cargo responsável.',
    button: 'Escolher responsável',
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
  const [signedCurrentVersion, setSignedCurrentVersion] = useState(false)
  const [detailPanel, setDetailPanel] = useState<DetailPanel>(null)
  const [areaId, setAreaId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [opinion, setOpinion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [checklistDetail, setChecklistDetail] =
    useState<GestorChecklistModelDetail | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState('')
  const [checklistExpanded, setChecklistExpanded] = useState(false)
  const [technicalBrief, setTechnicalBrief] = useState<GestorTechnicalBrief>(
    () => defaultDemandBrief(demand),
  )

  useEffect(() => {
    setCurrentDemand(demand)
    setSignedCurrentVersion(false)
    setDetailPanel(null)
    setAreaId('')
    setRoleId('')
    setOpinion('')
    setFeedback('')
    setError('')
    setChecklistDetail(null)
    setChecklistError('')
    setChecklistExpanded(false)
    setTechnicalBrief(defaultDemandBrief(demand))
  }, [demand])

  useEffect(() => {
    if (!isChecklistDemand(demand) || !demand.entidade_id) {
      setChecklistDetail(null)
      setChecklistLoading(false)
      setChecklistError('')
      return
    }

    const controller = new AbortController()
    setChecklistLoading(true)
    setChecklistError('')
    void getGestorChecklistModelDetail(demand.entidade_id, controller.signal)
      .then(setChecklistDetail)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (isGestorAuthenticationError(cause)) {
          onSessionExpired()
          return
        }
        setChecklistError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar os itens do checklist.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecklistLoading(false)
      })

    return () => controller.abort()
  }, [demand, onSessionExpired])

  const roles = useMemo(
    () => context.cargos.filter((role) => !areaId || role.area_id === areaId),
    [areaId, context.cargos],
  )
  const recommendation = nextAction(
    currentDemand,
    context,
    signedCurrentVersion,
  )
  const pendingSignatures = signaturesPending(currentDemand)
  const isOrder =
    upper(currentDemand.entidade_tipo) === 'ORDEM_SERVICO_RASCUNHO'
  const isChecklist = isChecklistDemand(currentDemand)
  const content =
    isChecklist && recommendation === 'approve'
      ? {
          title: 'Decida sobre este checklist',
          detail: 'Confira a sequência completa antes de aprovar ou pedir correção.',
          button: 'Aprovar checklist',
        }
      : ACTION_CONTENT[recommendation]

  function handleFailure(cause: unknown, fallback: string) {
    if (isGestorAuthenticationError(cause)) {
      onSessionExpired()
      return
    }
    setError(cause instanceof Error ? cause.message : fallback)
  }

  function openPanel(panel: DetailPanel) {
    setDetailPanel((current) => current === panel ? null : panel)
    setError('')
    setFeedback('')
  }

  async function assume() {
    setSubmitting(true)
    setError('')
    try {
      const result = await assumeGestorTechnicalDemand(currentDemand.id)
      setCurrentDemand(result.demanda)
      setFeedback('Pronto. A solicitação agora está sob sua responsabilidade.')
      await onProgress('Demanda assumida. O SLA de primeira resposta foi registrado.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível assumir a solicitação.')
    } finally {
      setSubmitting(false)
    }
  }

  async function sign() {
    setSubmitting(true)
    setError('')
    try {
      const result = await signGestorTechnicalDemand(
        currentDemand.id,
        opinion.trim() || DEFAULT_OPINIONS.sign,
      )
      setCurrentDemand(result.demanda)
      setSignedCurrentVersion(true)
      setOpinion('')
      setDetailPanel(null)
      const remaining = signaturesPending(result.demanda)
      setFeedback(
        remaining
          ? `Assinatura registrada. Ainda falta ${remaining} assinatura técnica.`
          : 'Assinaturas concluídas. Agora você pode finalizar a decisão.',
      )
      await onProgress(
        result.already_signed
          ? 'Sua assinatura já constava nesta versão.'
          : 'Assinatura técnica registrada.',
      )
    } catch (cause) {
      handleFailure(cause, 'Não foi possível registrar a assinatura.')
    } finally {
      setSubmitting(false)
    }
  }

  async function decide(
    decision: 'APROVAR' | 'DEVOLVER_ADMIN' | 'LIBERAR_OPERACAO',
  ) {
    const isReturn = decision === 'DEVOLVER_ADMIN'
    if (isReturn && opinion.trim().length < 5) {
      setError('Explique brevemente o que o Administrador precisa ajustar.')
      return
    }
    if (!isReturn && pendingSignatures > 0) {
      setError('Conclua as assinaturas obrigatórias antes da decisão final.')
      return
    }
    if (
      decision === 'LIBERAR_OPERACAO' &&
      (
        technicalBrief.situacao.trim().length < 5 ||
        technicalBrief.resultado_esperado.trim().length < 5 ||
        technicalBrief.etapas.length === 0
      )
    ) {
      setError('Revise o resumo para o Operador antes de liberar.')
      setDetailPanel('briefing')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const fallback =
        decision === 'LIBERAR_OPERACAO'
          ? DEFAULT_OPINIONS.release
          : DEFAULT_OPINIONS.approve
      await decideGestorTechnicalDemand(
        currentDemand.id,
        decision,
        opinion.trim() || fallback,
        decision === 'LIBERAR_OPERACAO' ? technicalBrief : undefined,
      )
      await onChanged(
        isReturn
          ? 'Solicitação devolvida ao Administrador.'
          : decision === 'LIBERAR_OPERACAO'
            ? 'Solicitação liberada para a operação.'
            : 'Solicitação aprovada tecnicamente.',
      )
    } catch (cause) {
      handleFailure(cause, 'Não foi possível concluir a decisão.')
    } finally {
      setSubmitting(false)
    }
  }

  async function forward() {
    if (!areaId) {
      setError('Escolha a área de destino.')
      return
    }
    if (opinion.trim().length < 5) {
      setError('Informe brevemente por que esta solicitação está sendo encaminhada.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await forwardGestorTechnicalDemand({
        demanda_id: currentDemand.id,
        para_area_id: areaId,
        para_cargo_id: roleId,
        motivo: opinion.trim(),
      })
      await onChanged('Solicitação encaminhada ao responsável técnico.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível encaminhar a solicitação.')
    } finally {
      setSubmitting(false)
    }
  }

  async function primaryAction() {
    if (recommendation === 'assume') {
      await assume()
      return
    }
    if (recommendation === 'sign') {
      await sign()
      return
    }
    if (recommendation === 'forward') {
      openPanel('forward')
      return
    }
    await decide(recommendation === 'release' ? 'LIBERAR_OPERACAO' : 'APROVAR')
  }

  return (
    <div className="review-overlay simple-decision-overlay" role="presentation">
      <section
        className="review-dialog simple-decision-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="technical-demand-title"
      >
        <header className="simple-decision-header">
          <div>
            <span className="eyebrow">
              {humanize(currentDemand.entidade_tipo)} · {currentDemand.area_atual_nome || 'Sem área'}
            </span>
            <h2 id="technical-demand-title">{currentDemand.titulo}</h2>
            <p>{currentDemand.entidade_id}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="simple-decision-body">
          <section className="simple-arrival-card">
            <header>
              <span>O que aconteceu</span>
              <b>{humanize(currentDemand.prioridade)}</b>
            </header>
            <p>
              {currentDemand.descricao ||
                'O Administrador enviou esta solicitação para validação técnica.'}
            </p>
            <small>
              {currentDemand.responsavel_atual_nome
                ? `Responsável: ${currentDemand.responsavel_atual_nome}`
                : 'Ainda sem responsável'}
              {pendingSignatures > 0
                ? ` · ${pendingSignatures} assinatura(s) pendente(s)`
                : ''}
            </small>
          </section>

          {isChecklist ? (
            <section className="simple-checklist-preview">
              <header>
                <span><ChecklistIcon /></span>
                <div>
                  <small>CHECKLIST ENVIADO PELO ADMINISTRADOR</small>
                  <strong>{checklistDetail?.plano.nome || currentDemand.titulo}</strong>
                  <p>
                    {checklistDetail
                      ? `R${checklistDetail.plano.revisao || 1} · ${checklistDetail.itens.length} etapa(s) · ${humanize(checklistDetail.plano.criticidade || 'normal')}`
                      : 'Carregando estrutura do modelo…'}
                  </p>
                </div>
                {checklistDetail ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={checklistExpanded}
                    onClick={() => setChecklistExpanded(true)}
                  >
                    Ver itens
                  </button>
                ) : null}
              </header>

              {checklistLoading ? (
                <div className="simple-checklist-preview__state" role="status">
                  Carregando itens do checklist…
                </div>
              ) : null}
              {checklistError ? (
                <div className="feedback feedback--error" role="alert">
                  {checklistError}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="simple-recommendation">
            <span><ShieldIcon /></span>
            <div>
              <small>O QUE VOCÊ PRECISA FAZER AGORA</small>
              <h3>{content.title}</h3>
              <p>{content.detail}</p>
            </div>
            <CheckIcon />
          </section>

          {recommendation === 'release' ? (
            <section className="simple-operator-summary">
              <header>
                <div>
                  <small>RESUMO PARA O OPERADOR</small>
                  <strong>Execução preparada automaticamente</strong>
                </div>
                <button type="button" onClick={() => openPanel('briefing')}>
                  Editar
                </button>
              </header>
              <div>
                <span><b>{technicalBrief.etapas.length}</b> etapas</span>
                <span><b>{technicalBrief.seguranca.length}</b> cuidados de segurança</span>
                <span><b>{technicalBrief.evidencias_requeridas.length}</b> evidências</span>
              </div>
            </section>
          ) : null}

          {detailPanel === 'forward' ? (
            <section className="simple-detail-panel">
              <header>
                <UsersIcon />
                <div>
                  <strong>Encaminhar para outro responsável</strong>
                  <span>Escolha o destino e explique o motivo.</span>
                </div>
              </header>
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
                  <span>Cargo</span>
                  <select
                    value={roleId}
                    onChange={(event) => setRoleId(event.target.value)}
                  >
                    <option value="">Qualquer cargo da área</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Motivo</span>
                <textarea
                  rows={2}
                  value={opinion}
                  onChange={(event) => setOpinion(event.target.value)}
                  placeholder="Ex.: requer validação da Manutenção."
                />
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={submitting}
                onClick={() => void forward()}
              >
                Encaminhar
              </button>
            </section>
          ) : null}

          {detailPanel === 'return' ? (
            <section className="simple-detail-panel">
              <header>
                <ValidationIcon />
                <div>
                  <strong>Pedir ajuste ao Administrador</strong>
                  <span>Diga somente o que precisa ser corrigido.</span>
                </div>
              </header>
              <label>
                <span>Ajuste necessário</span>
                <textarea
                  rows={3}
                  value={opinion}
                  onChange={(event) => setOpinion(event.target.value)}
                  placeholder="Ex.: incluir o critério de aceite do teste final."
                />
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={submitting}
                onClick={() => void decide('DEVOLVER_ADMIN')}
              >
                Enviar pedido de ajuste
              </button>
            </section>
          ) : null}

          {detailPanel === 'briefing' ? (
            <section className="simple-detail-panel simple-briefing-editor">
              <header>
                <ValidationIcon />
                <div>
                  <strong>Ajustar resumo para o Operador</strong>
                  <span>Os itens de segurança e as etapas já estão definidos.</span>
                </div>
              </header>
              <label>
                <span>Situação identificada</span>
                <textarea
                  rows={2}
                  value={technicalBrief.situacao}
                  onChange={(event) => setTechnicalBrief((current) => ({
                    ...current,
                    situacao: event.target.value,
                  }))}
                />
              </label>
              <div>
                <label>
                  <span>Causa provável</span>
                  <select
                    value={technicalBrief.causa_provavel}
                    onChange={(event) => setTechnicalBrief((current) => ({
                      ...current,
                      causa_provavel: event.target.value,
                    }))}
                  >
                    <option value="A confirmar na inspeção inicial do equipamento">Confirmar na inspeção</option>
                    <option value="Desgaste ou falha mecânica">Desgaste ou falha mecânica</option>
                    <option value="Falha elétrica ou de comando">Falha elétrica ou de comando</option>
                    <option value="Parâmetro fora da faixa">Parâmetro fora da faixa</option>
                    <option value="Condição operacional inadequada">Condição operacional inadequada</option>
                  </select>
                </label>
                <label>
                  <span>Resultado esperado</span>
                  <textarea
                    rows={2}
                    value={technicalBrief.resultado_esperado}
                    onChange={(event) => setTechnicalBrief((current) => ({
                      ...current,
                      resultado_esperado: event.target.value,
                    }))}
                  />
                </label>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDetailPanel(null)}
              >
                Concluir ajuste
              </button>
            </section>
          ) : null}

          {detailPanel === 'note' ? (
            <section className="simple-detail-panel">
              <label>
                <span>Observação opcional</span>
                <textarea
                  rows={3}
                  value={opinion}
                  onChange={(event) => setOpinion(event.target.value)}
                  placeholder="Acrescente somente se houver algo importante."
                />
              </label>
            </section>
          ) : null}

          {feedback ? (
            <div className="feedback feedback--success" role="status">{feedback}</div>
          ) : null}
          {error ? <div className="feedback feedback--error" role="alert">{error}</div> : null}

          {currentDemand.responsavel_atual_id ? (
            <div className="simple-secondary-actions">
              <button type="button" onClick={() => openPanel('return')}>
                Pedir ajuste
              </button>
              <button type="button" onClick={() => openPanel('forward')}>
                Encaminhar
              </button>
              <button type="button" onClick={() => openPanel('note')}>
                Adicionar observação
              </button>
            </div>
          ) : null}
        </div>

        <footer className="simple-decision-footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            Fechar
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={submitting}
            onClick={() => void primaryAction()}
          >
            {submitting ? 'Processando…' : content.button}
            {!submitting ? <ChevronRightIcon /> : null}
          </button>
        </footer>

        {checklistDetail && checklistExpanded ? (
          <div
            className="simple-checklist-detail-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setChecklistExpanded(false)
            }}
          >
            <section
              className="simple-checklist-detail-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="checklist-detail-title"
            >
              <header>
                <div>
                  <span className="eyebrow">ETAPAS DO CHECKLIST</span>
                  <h3 id="checklist-detail-title">{checklistDetail.plano.nome}</h3>
                  <p>
                    R{checklistDetail.plano.revisao || 1} · {checklistDetail.itens.length} etapa(s) · confira instruções e evidências
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fechar itens do checklist"
                  onClick={() => setChecklistExpanded(false)}
                >
                  ×
                </button>
              </header>
              <div className="simple-checklist-preview__items">
                {checklistDetail.itens.map((item, index) => (
                  <article key={item.id}>
                    <b>{String(item.ordem ?? index + 1).padStart(2, '0')}</b>
                    <span>
                      <strong>{item.titulo || 'Etapa sem título'}</strong>
                      <small>
                        {humanize(item.tipo_resposta || 'resposta')}
                        {upper(item.evidencia_obrigatoria) === 'SIM'
                          ? ' · evidência obrigatória'
                          : ''}
                      </small>
                      {item.instrucao ? <p>{item.instrucao}</p> : null}
                    </span>
                  </article>
                ))}
                {!checklistDetail.itens.length ? (
                  <div className="simple-checklist-preview__state is-warning">
                    Este modelo não possui etapas. Devolva-o ao Administrador para correção.
                  </div>
                ) : null}
              </div>
              <footer>
                <span>{checklistDetail.itens.length} etapa(s) revisáveis</span>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setChecklistExpanded(false)}
                >
                  Concluir leitura
                </button>
              </footer>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  )
}

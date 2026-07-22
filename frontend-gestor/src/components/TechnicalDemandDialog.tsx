import { useMemo, useState } from 'react'
import {
  assumeGestorTechnicalDemand,
  decideGestorTechnicalDemand,
  forwardGestorTechnicalDemand,
  signGestorTechnicalDemand,
} from '../services/api/gestor'
import type {
  GestorTechnicalContext,
  GestorTechnicalDemand,
} from '../types/gestor'

interface TechnicalDemandDialogProps {
  demand: GestorTechnicalDemand
  context: GestorTechnicalContext
  onClose: () => void
  onChanged: (message: string) => Promise<void>
  onSessionExpired: () => void
}

type DemandOperation = 'forward' | 'sign' | 'approve' | 'return' | 'release'

export function TechnicalDemandDialog({
  demand,
  context,
  onClose,
  onChanged,
}: TechnicalDemandDialogProps) {
  const [operation, setOperation] = useState<DemandOperation>('approve')
  const [areaId, setAreaId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [opinion, setOpinion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const roles = useMemo(
    () => context.cargos.filter((role) => !areaId || role.area_id === areaId),
    [areaId, context.cargos],
  )

  const signaturesPending = Math.max(
    0,
    Number(demand.assinaturas_necessarias ?? 0) - Number(demand.assinaturas_realizadas ?? 0),
  )

  async function assume() {
    setSubmitting(true)
    setError('')
    try {
      await assumeGestorTechnicalDemand(demand.id)
      await onChanged('Demanda assumida. O SLA de primeira resposta foi registrado.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível assumir a demanda.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submit() {
    setError('')
    if (opinion.trim().length < 5) {
      setError(operation === 'sign' ? 'Registre a declaração da assinatura.' : 'Registre um parecer técnico objetivo.')
      return
    }
    if (operation === 'forward' && !areaId) {
      setError('Selecione a área técnica de destino.')
      return
    }

    setSubmitting(true)
    try {
      if (operation === 'forward') {
        await forwardGestorTechnicalDemand({
          demanda_id: demand.id,
          para_area_id: areaId,
          para_cargo_id: roleId,
          motivo: opinion.trim(),
        })
        await onChanged('Demanda encaminhada com rastreabilidade do parecer.')
      } else if (operation === 'sign') {
        await signGestorTechnicalDemand(demand.id, opinion.trim())
        await onChanged('Assinatura técnica interna registrada na versão atual.')
      } else {
        const decision = operation === 'return'
          ? 'DEVOLVER_ADMIN'
          : operation === 'release' ? 'LIBERAR_OPERACAO' : 'APROVAR'
        await decideGestorTechnicalDemand(demand.id, decision, opinion.trim())
        await onChanged(
          operation === 'return'
            ? 'Demanda devolvida ao administrador.'
            : operation === 'release'
              ? 'Demanda liberada para o fluxo operacional.'
              : 'Demanda aprovada tecnicamente.',
        )
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a decisão.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="review-overlay" role="presentation">
      <section className="review-dialog technical-demand-dialog" role="dialog" aria-modal="true" aria-labelledby="technical-demand-title">
        <header className="review-dialog__header">
          <div>
            <span className="eyebrow">FILTRO TÉCNICO · {demand.area_atual_nome || 'SEM ÁREA'}</span>
            <h2 id="technical-demand-title">{demand.titulo}</h2>
            <p>{demand.entidade_tipo} · {demand.entidade_id}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="technical-demand-summary">
          <span className="status-pill status-pill--blue">{demand.status}</span>
          <span className="priority-chip">{demand.prioridade}</span>
          <span>{demand.cargo_atual_nome || 'Qualquer cargo da área'}</span>
          <span>{signaturesPending ? `${signaturesPending} assinatura(s) pendente(s)` : 'Assinaturas atendidas'}</span>
        </div>

        <p className="technical-demand-description">{demand.descricao || 'Sem descrição complementar.'}</p>

        {!demand.responsavel_atual_id ? (
          <button className="secondary-button" type="button" disabled={submitting} onClick={() => void assume()}>
            Assumir esta demanda
          </button>
        ) : null}

        <div className="technical-operation-tabs" role="tablist" aria-label="Ações da demanda">
          <button type="button" className={operation === 'approve' ? 'is-active' : ''} onClick={() => setOperation('approve')}>Aprovar</button>
          <button type="button" className={operation === 'release' ? 'is-active' : ''} onClick={() => setOperation('release')}>Liberar</button>
          <button type="button" className={operation === 'forward' ? 'is-active' : ''} onClick={() => setOperation('forward')}>Encaminhar</button>
          {context.pode_assinar && demand.exige_assinatura === 'SIM' ? (
            <button type="button" className={operation === 'sign' ? 'is-active' : ''} onClick={() => setOperation('sign')}>Assinar</button>
          ) : null}
          <button type="button" className={operation === 'return' ? 'is-active' : ''} onClick={() => setOperation('return')}>Devolver</button>
        </div>

        {operation === 'forward' ? (
          <div className="technical-route-grid">
            <label>
              <span>Área de destino</span>
              <select value={areaId} onChange={(event) => { setAreaId(event.target.value); setRoleId('') }}>
                <option value="">Selecione</option>
                {context.areas.map((area) => <option key={area.id} value={area.id}>{area.nome}</option>)}
              </select>
            </label>
            <label>
              <span>Cargo de destino</span>
              <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
                <option value="">Qualquer cargo da área</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.nome}</option>)}
              </select>
            </label>
          </div>
        ) : null}

        <label className="technical-opinion-field">
          <span>{operation === 'sign' ? 'Declaração de assinatura' : operation === 'forward' ? 'Motivo do encaminhamento' : 'Parecer técnico'}</span>
          <textarea
            rows={5}
            value={opinion}
            onChange={(event) => setOpinion(event.target.value)}
            placeholder="Registre diagnóstico, risco, condição de aceite e recomendação."
          />
        </label>

        {error ? <div className="feedback feedback--error" role="alert">{error}</div> : null}

        <footer className="review-dialog__footer">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? 'Processando…' : 'Confirmar ação'}
          </button>
        </footer>
      </section>
    </div>
  )
}

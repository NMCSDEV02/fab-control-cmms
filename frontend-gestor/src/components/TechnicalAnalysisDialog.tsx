import { useState } from 'react'
import {
  saveGestorTechnicalAnalysis,
  sendGestorTechnicalAnalysis,
} from '../services/api/gestor'
import type { GestorOccurrence } from '../types/gestor'

interface TechnicalAnalysisDialogProps {
  occurrence: GestorOccurrence
  onClose: () => void
  onChanged: (message: string) => Promise<void>
}

export function TechnicalAnalysisDialog({ occurrence, onClose, onChanged }: TechnicalAnalysisDialogProps) {
  const [title, setTitle] = useState(`Análise técnica — ${occurrence.titulo || occurrence.id}`)
  const [diagnosis, setDiagnosis] = useState('')
  const [risk, setRisk] = useState('')
  const [probableCause, setProbableCause] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [recommendChecklist, setRecommendChecklist] = useState(false)
  const [recommendOrder, setRecommendOrder] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (diagnosis.trim().length < 5 || recommendation.trim().length < 5) {
      setError('Preencha o diagnóstico e a recomendação técnica.')
      return
    }
    setSubmitting(true)
    try {
      const result = await saveGestorTechnicalAnalysis({
        ocorrencia_id: occurrence.id,
        ativo_id: occurrence.ativo_id,
        titulo: title.trim(),
        diagnostico: diagnosis.trim(),
        risco: risk.trim(),
        causa_provavel: probableCause.trim(),
        recomendacao: recommendation.trim(),
        recomenda_checklist: recommendChecklist,
        recomenda_os: recommendOrder,
        prioridade: occurrence.severidade || 'MEDIA',
      })
      await sendGestorTechnicalAnalysis(result.analise.id)
      await onChanged('Análise enviada ao administrador para criar checklist ou ordem de serviço.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a análise.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="review-overlay" role="presentation">
      <section className="review-dialog technical-analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="technical-analysis-title">
        <header className="review-dialog__header">
          <div><span className="eyebrow">ANÁLISE DE OCORRÊNCIA</span><h2 id="technical-analysis-title">Filtro técnico</h2><p>{occurrence.titulo || occurrence.id}</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        <div className="technical-analysis-grid">
          <label className="technical-analysis-wide"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="technical-analysis-wide"><span>Diagnóstico</span><textarea rows={4} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} /></label>
          <label><span>Risco</span><input value={risk} onChange={(event) => setRisk(event.target.value)} placeholder="Segurança, qualidade, disponibilidade…" /></label>
          <label><span>Causa provável</span><input value={probableCause} onChange={(event) => setProbableCause(event.target.value)} /></label>
          <label className="technical-analysis-wide"><span>Recomendação</span><textarea rows={4} value={recommendation} onChange={(event) => setRecommendation(event.target.value)} /></label>
        </div>
        <div className="technical-recommendations">
          <label><input type="checkbox" checked={recommendChecklist} onChange={(event) => setRecommendChecklist(event.target.checked)} /> Recomendar novo checklist</label>
          <label><input type="checkbox" checked={recommendOrder} onChange={(event) => setRecommendOrder(event.target.checked)} /> Recomendar ordem de serviço</label>
        </div>
        {error ? <div className="feedback feedback--error" role="alert">{error}</div> : null}
        <footer className="review-dialog__footer">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Enviando…' : 'Enviar ao administrador'}</button>
        </footer>
      </section>
    </div>
  )
}

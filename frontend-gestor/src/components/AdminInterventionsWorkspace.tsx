import { useCallback, useEffect, useMemo, useState } from 'react'
import { listTechnicalAreas, listTechnicalRoles } from '../services/api/admin'
import { listAdminEntity } from '../services/api/catalog'
import { listAdminInterventions, saveAdminIntervention, sendAdminInterventionForValidation } from '../services/api/interventions'
import { isGestorAuthenticationError } from '../services/api/gestor'
import type { TechnicalArea, TechnicalRole } from '../types/admin'
import type { AdminEntityRecord } from '../types/catalog'
import type { AdminIntervention, AdminInterventionInput } from '../types/interventions'
import { AssetIcon, CheckIcon, RefreshIcon, SearchIcon, ShieldIcon, WrenchIcon } from './Icons'

interface AdminInterventionsWorkspaceProps {
  onSessionExpired: () => void
}

function emptyIntervention(): AdminInterventionInput {
  return {
    ativo_id: '', componente_id: '', tipo: 'CORRETIVA', titulo: '', descricao: '', prioridade: 'MEDIA',
    planejada_para: '', modo_parada_manutencao: 'DECISAO_EXECUTOR',
  }
}

function editable(intervention: AdminIntervention): boolean {
  return ['RASCUNHO', 'DEVOLVIDA_ADMIN'].includes(intervention.status)
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    RASCUNHO: 'Rascunho', AGUARDANDO_VALIDACAO: 'Aguardando validação', DEVOLVIDA_ADMIN: 'Devolvida ao Admin',
    ABERTA: 'Liberada ao Operador', EM_EXECUCAO: 'Em execução', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada',
  }
  return labels[status] ?? status
}

function available(record: AdminEntityRecord, selectedId?: string): boolean {
  return String(record.status ?? '').trim().toUpperCase() !== 'INATIVO' || String(record.id) === String(selectedId ?? '')
}

export function AdminInterventionsWorkspace({ onSessionExpired }: AdminInterventionsWorkspaceProps) {
  const [interventions, setInterventions] = useState<AdminIntervention[]>([])
  const [assets, setAssets] = useState<AdminEntityRecord[]>([])
  const [components, setComponents] = useState<AdminEntityRecord[]>([])
  const [areas, setAreas] = useState<TechnicalArea[]>([])
  const [roles, setRoles] = useState<TechnicalRole[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editor, setEditor] = useState<AdminInterventionInput | null>(null)
  const [routing, setRouting] = useState<AdminIntervention | null>(null)
  const [viewing, setViewing] = useState<AdminIntervention | null>(null)
  const [routeDraft, setRouteDraft] = useState({ area_atual_id: '', cargo_atual_id: '', comentario: '', exige_assinatura: 'SIM', assinaturas_necessarias: 1, exige_segregacao: 'SIM' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const handleFailure = useCallback((cause: unknown, fallback: string) => {
    if (isGestorAuthenticationError(cause)) {
      onSessionExpired()
      return
    }
    setError(cause instanceof Error ? cause.message : fallback)
  }, [onSessionExpired])

  const loadData = useCallback(async (signal?: AbortSignal) => {
    const [nextInterventions, assetList, componentList, nextAreas, nextRoles] = await Promise.all([
      listAdminInterventions(signal), listAdminEntity('ativos', signal), listAdminEntity('componentes', signal),
      listTechnicalAreas(signal), listTechnicalRoles('', signal),
    ])
    setInterventions(nextInterventions)
    setAssets(assetList.rows)
    setComponents(componentList.rows)
    setAreas(nextAreas)
    setRoles(nextRoles)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void loadData(controller.signal)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        handleFailure(cause, 'Não foi possível carregar as intervenções.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [handleFailure, loadData])

  const visibleInterventions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return interventions.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false
      return !term || [item.codigo, item.titulo, item.ativo_tag, item.ativo_nome, item.componente_nome, item.status]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [interventions, search, statusFilter])

  const editorComponents = useMemo(
    () => components.filter((component) => (
      String(component.ativo_id) === String(editor?.ativo_id)
      && available(component, editor?.componente_id)
    )),
    [components, editor?.ativo_id, editor?.componente_id],
  )
  const routeRoles = useMemo(
    () => roles.filter((role) => role.area_id === routeDraft.area_atual_id),
    [roles, routeDraft.area_atual_id],
  )
  const metrics = useMemo(() => ({
    drafts: interventions.filter((item) => item.status === 'RASCUNHO' || item.status === 'DEVOLVIDA_ADMIN').length,
    validation: interventions.filter((item) => item.status === 'AGUARDANDO_VALIDACAO').length,
    released: interventions.filter((item) => item.status === 'ABERTA' || item.status === 'EM_EXECUCAO').length,
    completed: interventions.filter((item) => item.status === 'FINALIZADA').length,
  }), [interventions])

  function openEditor(intervention?: AdminIntervention) {
    setEditor(intervention ? {
      id: intervention.id, ativo_id: intervention.ativo_id, componente_id: intervention.componente_id,
      tipo: intervention.tipo, titulo: intervention.titulo, descricao: intervention.descricao,
      prioridade: intervention.prioridade, planejada_para: intervention.planejada_para,
      modo_parada_manutencao: intervention.modo_parada_manutencao || 'DECISAO_EXECUTOR',
    } : emptyIntervention())
    setError('')
    setNotice('')
  }

  function openRouting(intervention: AdminIntervention) {
    setRouting(intervention)
    setRouteDraft({ area_atual_id: '', cargo_atual_id: '', comentario: intervention.descricao, exige_assinatura: 'SIM', assinaturas_necessarias: 1, exige_segregacao: 'SIM' })
    setError('')
  }

  async function save() {
    if (!editor) return
    if (!editor.ativo_id || !editor.titulo.trim() || editor.descricao.trim().length < 5) {
      setError('Selecione o ativo e informe título e descrição da intervenção.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await saveAdminIntervention(editor)
      setInterventions((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? { ...item, ...saved } : item)
        : [saved, ...current])
      setEditor(null)
      setNotice('Intervenção salva em rascunho. Nenhuma ação foi enviada ao Operador.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível salvar a intervenção.')
    } finally {
      setSaving(false)
    }
  }

  async function send() {
    if (!routing) return
    if (!routeDraft.area_atual_id || routeDraft.comentario.trim().length < 5) {
      setError('Selecione a área e informe a orientação para validação.')
      return
    }
    setSending(true)
    setError('')
    try {
      await sendAdminInterventionForValidation({ intervencao_id: routing.id, ...routeDraft })
      await loadData()
      setRouting(null)
      setNotice('Intervenção enviada ao filtro técnico. A ação só aparecerá ao Operador após a liberação do Gestor.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível enviar a intervenção.')
    } finally {
      setSending(false)
    }
  }

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      await loadData()
      setNotice('Intervenções atualizadas.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível atualizar as intervenções.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="dashboard-loading">Carregando intervenções…</div>

  return (
    <section className="admin-interventions-workspace">
      {error ? <div className="dashboard-error" role="alert"><strong>Ação não concluída.</strong><span>{error}</span></div> : null}
      {notice ? <div className="dashboard-notice" role="status">{notice}</div> : null}
      <section className="admin-intervention-metrics">
        <article><AssetIcon /><span><strong>{metrics.drafts}</strong><small>rascunhos ou devolvidas</small></span></article>
        <article><ShieldIcon /><span><strong>{metrics.validation}</strong><small>no filtro técnico</small></span></article>
        <article><WrenchIcon /><span><strong>{metrics.released}</strong><small>liberadas ou em execução</small></span></article>
        <article><CheckIcon /><span><strong>{metrics.completed}</strong><small>intervenções finalizadas</small></span></article>
      </section>
      <section className="admin-intervention-panel">
        <header><div><span className="eyebrow">ORDEM CONTROLADA</span><h2>Intervenções administrativas</h2><p>Crie a demanda, escolha o filtro técnico e acompanhe até a liberação ao chão de fábrica.</p></div><div><button type="button" onClick={() => void refresh()}><RefreshIcon />Atualizar</button><button className="primary-button" type="button" onClick={() => openEditor()}>Nova intervenção</button></div></header>
        <div className="admin-intervention-filters"><label><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar código, título ou equipamento" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos os status</option><option value="RASCUNHO">Rascunhos</option><option value="DEVOLVIDA_ADMIN">Devolvidas</option><option value="AGUARDANDO_VALIDACAO">Em validação</option><option value="ABERTA">Liberadas</option><option value="EM_EXECUCAO">Em execução</option><option value="FINALIZADA">Finalizadas</option></select></div>
        <div className="admin-intervention-table">
          <div><span>Intervenção</span><span>Equipamento</span><span>Prioridade</span><span>Filtro técnico</span><span>Status</span><span>Ações</span></div>
          {visibleInterventions.map((item) => <article key={item.id}><span><b>{item.codigo}</b><strong>{item.titulo}</strong><small>{item.tipo}</small></span><span><strong>{item.ativo_tag || item.ativo_nome || item.ativo_id}</strong><small>{item.componente_nome || 'Ativo completo'}</small></span><i className={`is-${item.prioridade.toLowerCase()}`}>{item.prioridade}</i><span><strong>{item.demanda?.area_atual_nome || '—'}</strong><small>{item.demanda?.cargo_atual_nome || 'Sem cargo específico'}</small></span><em className={`is-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</em><span className="admin-intervention-actions">{editable(item) ? <><button type="button" onClick={() => openEditor(item)}>Editar</button><button className="primary-button" type="button" onClick={() => openRouting(item)}>{item.status === 'DEVOLVIDA_ADMIN' ? 'Reenviar' : 'Enviar'}</button></> : <button type="button" onClick={() => setViewing(item)}>Acompanhar</button>}</span></article>)}
          {!visibleInterventions.length ? <div className="admin-empty-state admin-intervention-empty"><WrenchIcon /><strong>Nenhuma intervenção encontrada</strong><span>Depois do primeiro rascunho, a área Ações exibirá Editar e Enviar. Após a validação, exibirá Acompanhar sem permitir alterações no documento liberado.</span></div> : null}
        </div>
      </section>

      {editor ? <div className="admin-catalog-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null) }}><section role="dialog" aria-modal="true" aria-labelledby="intervention-editor-title"><header><div><span className="eyebrow">PLANEJAMENTO ASSISTIDO</span><h2 id="intervention-editor-title">{editor.id ? 'Editar intervenção' : 'Nova intervenção'}</h2></div><button type="button" onClick={() => setEditor(null)}>×</button></header><div className="admin-catalog-form">
        <label><span>Ativo *</span><select value={editor.ativo_id} onChange={(event) => setEditor((current) => current ? { ...current, ativo_id: event.target.value, componente_id: '' } : current)}><option value="">Selecione…</option>{assets.filter((asset) => available(asset, editor.ativo_id)).map((asset) => <option value={asset.id} key={asset.id}>{String(asset.tag || asset.id)} · {String(asset.nome)}</option>)}</select></label>
        <label><span>Componente</span><select value={editor.componente_id || ''} onChange={(event) => setEditor((current) => current ? { ...current, componente_id: event.target.value } : current)}><option value="">Ativo completo</option>{editorComponents.map((component) => <option value={component.id} key={component.id}>{String(component.tag || component.id)} · {String(component.nome)}</option>)}</select></label>
        <label><span>Tipo</span><select value={editor.tipo} onChange={(event) => setEditor((current) => current ? { ...current, tipo: event.target.value } : current)}><option value="CORRETIVA">Corretiva</option><option value="PREVENTIVA">Preventiva</option><option value="PREDITIVA">Preditiva</option><option value="INSPECAO">Inspeção</option><option value="QUALIDADE">Qualidade</option><option value="SEGURANCA">Segurança</option></select></label>
        <label><span>Prioridade</span><select value={editor.prioridade} onChange={(event) => setEditor((current) => current ? { ...current, prioridade: event.target.value } : current)}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label>
        <label><span>Planejada para</span><input type="datetime-local" value={editor.planejada_para || ''} onChange={(event) => setEditor((current) => current ? { ...current, planejada_para: event.target.value } : current)} /></label>
        <label><span>Modo de parada</span><select value={editor.modo_parada_manutencao} onChange={(event) => setEditor((current) => current ? { ...current, modo_parada_manutencao: event.target.value } : current)}><option value="DECISAO_EXECUTOR">Decisão do executor</option><option value="OBRIGATORIA">Parada obrigatória</option><option value="SEM_PARADA">Executar sem parada</option></select></label>
        <label style={{ gridColumn: '1 / -1' }}><span>Título *</span><input value={editor.titulo} onChange={(event) => setEditor((current) => current ? { ...current, titulo: event.target.value } : current)} /></label>
        <label style={{ gridColumn: '1 / -1' }}><span>Descrição do serviço *</span><textarea rows={5} value={editor.descricao} onChange={(event) => setEditor((current) => current ? { ...current, descricao: event.target.value } : current)} /></label>
      </div><footer><span>Salvar não cria ação operacional.</span><div><button type="button" disabled={saving} onClick={() => setEditor(null)}>Cancelar</button><button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar rascunho'}</button></div></footer></section></div> : null}

      {routing ? <div className="admin-catalog-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) setRouting(null) }}><section role="dialog" aria-modal="true" aria-labelledby="intervention-route-title"><header><div><span className="eyebrow">FILTRO TÉCNICO</span><h2 id="intervention-route-title">Enviar {routing.codigo}</h2></div><button type="button" onClick={() => setRouting(null)}>×</button></header><div className="admin-catalog-form">
        <label><span>Área responsável *</span><select value={routeDraft.area_atual_id} onChange={(event) => setRouteDraft((current) => ({ ...current, area_atual_id: event.target.value, cargo_atual_id: '' }))}><option value="">Selecione…</option>{areas.map((area) => <option value={area.id} key={area.id}>{area.codigo} · {area.nome}</option>)}</select></label>
        <label><span>Cargo técnico</span><select value={routeDraft.cargo_atual_id} onChange={(event) => setRouteDraft((current) => ({ ...current, cargo_atual_id: event.target.value }))}><option value="">Qualquer gestor da área</option>{routeRoles.map((role) => <option value={role.id} key={role.id}>{role.nome}</option>)}</select></label>
        <label><span>Exigir assinatura</span><select value={routeDraft.exige_assinatura} onChange={(event) => setRouteDraft((current) => ({ ...current, exige_assinatura: event.target.value }))}><option value="SIM">Sim</option><option value="NAO">Não</option></select></label>
        <label><span>Assinaturas necessárias</span><select disabled={routeDraft.exige_assinatura !== 'SIM'} value={routeDraft.assinaturas_necessarias} onChange={(event) => setRouteDraft((current) => ({ ...current, assinaturas_necessarias: Number(event.target.value) }))}><option value="1">1 assinatura</option><option value="2">2 assinaturas</option><option value="3">3 assinaturas</option></select></label>
        <label><span>Segregar criador e aprovador</span><select value={routeDraft.exige_segregacao} onChange={(event) => setRouteDraft((current) => ({ ...current, exige_segregacao: event.target.value }))}><option value="SIM">Sim</option><option value="NAO">Não</option></select></label>
        <label style={{ gridColumn: '1 / -1' }}><span>Orientação ao Gestor *</span><textarea rows={4} value={routeDraft.comentario} onChange={(event) => setRouteDraft((current) => ({ ...current, comentario: event.target.value }))} /></label>
      </div><footer><span>A ação operacional só será criada depois da decisão técnica.</span><div><button type="button" disabled={sending} onClick={() => setRouting(null)}>Cancelar</button><button className="primary-button" type="button" disabled={sending} onClick={() => void send()}>{sending ? 'Enviando…' : 'Enviar ao Gestor'}</button></div></footer></section></div> : null}

      {viewing ? <div className="admin-catalog-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null) }}><section role="dialog" aria-modal="true" aria-labelledby="intervention-view-title">
        <header><div><span className="eyebrow">ACOMPANHAMENTO</span><h2 id="intervention-view-title">{viewing.codigo} · {viewing.titulo}</h2></div><button type="button" onClick={() => setViewing(null)}>×</button></header>
        <div className="admin-intervention-detail">
          <article><small>Status</small><strong>{statusLabel(viewing.status)}</strong></article>
          <article><small>Equipamento</small><strong>{viewing.ativo_tag || viewing.ativo_nome || viewing.ativo_id}</strong></article>
          <article><small>Componente</small><strong>{viewing.componente_nome || 'Ativo completo'}</strong></article>
          <article><small>Prioridade</small><strong>{viewing.prioridade}</strong></article>
          <article><small>Área atual</small><strong>{viewing.demanda?.area_atual_nome || 'Fluxo operacional'}</strong></article>
          <article><small>Responsável técnico</small><strong>{viewing.demanda?.cargo_atual_nome || 'Sem cargo específico'}</strong></article>
          <article className="is-wide"><small>Descrição</small><strong>{viewing.descricao}</strong></article>
        </div>
        <footer><span>O registro liberado permanece imutável e rastreável.</span><div><button type="button" onClick={() => setViewing(null)}>Concluir acompanhamento</button></div></footer>
      </section></div> : null}
    </section>
  )
}

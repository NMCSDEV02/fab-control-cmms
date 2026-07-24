import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listTechnicalAreas, listTechnicalRoles } from '../services/api/admin'
import { actionAdminEntity, listAdminEntity } from '../services/api/catalog'
import {
  createAdminChecklistRevision,
  getAdminChecklistDetail,
  listAdminChecklistModels,
  saveAdminChecklistModel,
  sendAdminChecklistForValidation,
} from '../services/api/checklists'
import { isGestorAuthenticationError } from '../services/api/gestor'
import type { TechnicalArea, TechnicalRole } from '../types/admin'
import type { AdminEntityRecord } from '../types/catalog'
import type { AdminChecklistItem, AdminChecklistPlan, ChecklistResponseType } from '../types/checklists'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CameraIcon,
  ChartIcon,
  CheckIcon,
  ChecklistIcon,
  CopyIcon,
  DocumentIcon,
  NumberIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  TextIcon,
  TrashIcon,
  WrenchIcon,
} from './Icons'

interface AdminChecklistBuilderProps {
  onSessionExpired: () => void
}

const RESPONSE_TYPES: Array<{ value: ChecklistResponseType; label: string }> = [
  { value: 'OK_NOK', label: 'Conforme / não conforme' },
  { value: 'CONFIRMACAO', label: 'Confirmação' },
  { value: 'NUMERO', label: 'Número' },
  { value: 'PARAMETRO', label: 'Parâmetro técnico' },
  { value: 'TEXTO', label: 'Texto' },
  { value: 'SELECAO', label: 'Lista de opções' },
  { value: 'EVIDENCIA', label: 'Evidência obrigatória' },
  { value: 'LEITURA_OPERACIONAL', label: 'Leitura operacional' },
  { value: 'INSTRUCAO', label: 'Somente instrução' },
]

const QUICK_ITEM_TYPES: Array<{
  value: ChecklistResponseType
  label: string
  detail: string
  Icon: typeof CheckIcon
}> = [
  { value: 'OK_NOK', label: 'Conforme', detail: 'OK ou não conforme', Icon: CheckIcon },
  { value: 'CONFIRMACAO', label: 'Confirmação', detail: 'Aceite em um toque', Icon: ShieldIcon },
  { value: 'EVIDENCIA', label: 'Foto', detail: 'Evidência obrigatória', Icon: CameraIcon },
  { value: 'PARAMETRO', label: 'Parâmetro', detail: 'Valor e limites', Icon: WrenchIcon },
  { value: 'NUMERO', label: 'Número', detail: 'Medição simples', Icon: NumberIcon },
  { value: 'SELECAO', label: 'Lista', detail: 'Opções prontas', Icon: ChecklistIcon },
  { value: 'TEXTO', label: 'Texto', detail: 'Resposta livre', Icon: TextIcon },
  { value: 'LEITURA_OPERACIONAL', label: 'Leitura', detail: 'Valor do equipamento', Icon: ChartIcon },
  { value: 'INSTRUCAO', label: 'Instrução', detail: 'Confirmar leitura', Icon: DocumentIcon },
]

const YES_NO = [
  { value: 'SIM', label: 'Sim' },
  { value: 'NAO', label: 'Não' },
]

const UNIT_OPTIONS = [
  { value: '', label: 'Selecione…' },
  { value: 'h', label: 'Horas (h)' },
  { value: 'dias', label: 'Dias' },
  { value: 'min', label: 'Minutos (min)' },
  { value: '°C', label: 'Temperatura (°C)' },
  { value: 'bar', label: 'Pressão (bar)' },
  { value: 'psi', label: 'Pressão (psi)' },
  { value: 'mm', label: 'Milímetros (mm)' },
  { value: 'mm/s', label: 'Vibração (mm/s)' },
  { value: 'A', label: 'Corrente (A)' },
  { value: 'V', label: 'Tensão (V)' },
  { value: 'rpm', label: 'Rotação (rpm)' },
  { value: '%', label: 'Percentual (%)' },
  { value: 'un', label: 'Unidade (un)' },
]

function emptyPlan(): AdminChecklistPlan {
  return {
    id: '', ativo_id: '', componente_id: '', nome: '', tipo: 'PREVENTIVA', criticidade: 'MEDIA',
    gatilho_tipo: 'DIAS', gatilho_valor: 30, unidade: 'dias', recorrencia_dias: 30,
    tempo_estimado_min: 60, requer_bloqueio: 'SIM', requer_evidencia: 'NAO', max_sessoes: 1,
    modo_parada_manutencao: 'DECISAO_EXECUTOR', status: 'INATIVO', workflow_status: 'RASCUNHO', revisao: 1,
  }
}

function emptyItem(
  order: number,
  type: ChecklistResponseType = 'OK_NOK',
): AdminChecklistItem {
  const item: AdminChecklistItem = {
    id: '', ordem: order, titulo: '', instrucao: '', tipo_resposta: 'OK_NOK', obrigatorio: 'SIM',
    evidencia_obrigatoria: 'NAO', limite_min: '', limite_max: '', unidade: '', parametro_nome: '',
    valor_esperado: '', opcoes_json: '', opcoes_texto: '', bloqueia_finalizacao: 'NAO',
    categoria: 'OPERACIONAL', peso: 1, evidencia_min_fotos: 0, status: 'ATIVO',
  }
  item.tipo_resposta = type
  if (type === 'EVIDENCIA') {
    item.evidencia_obrigatoria = 'SIM'
    item.evidencia_min_fotos = 1
    item.bloqueia_finalizacao = 'SIM'
  }
  if (type === 'NUMERO') item.unidade = 'un'
  if (type === 'LEITURA_OPERACIONAL') {
    item.unidade = 'un'
    item.parametro_nome = 'LEITURA'
  }
  if (type === 'SELECAO') {
    item.opcoes_texto = 'Normal | Atenção | Crítico'
    item.opcoes_json = JSON.stringify(['Normal', 'Atenção', 'Crítico'])
  }
  return item
}

function parseOptions(value?: string): string {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String).join(' | ') : String(parsed)
  } catch {
    return value
  }
}

function cleanOptions(value?: string): string {
  const options = String(value ?? '').split(/[|\n]/).map((item) => item.trim()).filter(Boolean)
  return options.length ? JSON.stringify(options) : ''
}

function workflowLabel(value?: string): string {
  const labels: Record<string, string> = {
    RASCUNHO: 'Rascunho', DEVOLVIDO_CORRECAO: 'Devolvido para correção',
    EM_VALIDACAO_GESTAO: 'Em validação', VALIDADO: 'Validado', ATIVO: 'Ativo', OBSOLETO: 'Obsoleto',
  }
  return labels[String(value ?? '').toUpperCase()] ?? String(value || 'Rascunho')
}

function normalizedWorkflow(value?: string): string {
  return String(value ?? '').trim().toUpperCase()
}

function isAvailable(record: AdminEntityRecord): boolean {
  return String(record.status ?? '').trim().toUpperCase() !== 'INATIVO'
}

export function AdminChecklistBuilder({ onSessionExpired }: AdminChecklistBuilderProps) {
  const workspaceRef = useRef<HTMLElement | null>(null)
  const [models, setModels] = useState<AdminChecklistPlan[]>([])
  const [assets, setAssets] = useState<AdminEntityRecord[]>([])
  const [components, setComponents] = useState<AdminEntityRecord[]>([])
  const [areas, setAreas] = useState<TechnicalArea[]>([])
  const [roles, setRoles] = useState<TechnicalRole[]>([])
  const [plan, setPlan] = useState<AdminChecklistPlan>(emptyPlan)
  const [items, setItems] = useState<AdminChecklistItem[]>([emptyItem(1)])
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [modelToDelete, setModelToDelete] = useState<AdminChecklistPlan | null>(null)
  const [routingOpen, setRoutingOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [routing, setRouting] = useState({
    area_atual_id: '', cargo_atual_id: '', comentario: '', exige_assinatura: 'SIM',
    assinaturas_necessarias: 1, exige_segregacao: 'SIM',
  })

  const handleFailure = useCallback((cause: unknown, fallback: string) => {
    if (isGestorAuthenticationError(cause)) {
      onSessionExpired()
      return
    }
    setError(cause instanceof Error ? cause.message : fallback)
  }, [onSessionExpired])

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    const [nextModels, assetList, componentList, nextAreas, nextRoles] = await Promise.all([
      listAdminChecklistModels(signal), listAdminEntity('ativos', signal), listAdminEntity('componentes', signal),
      listTechnicalAreas(signal), listTechnicalRoles('', signal),
    ])
    setModels(nextModels)
    setAssets(assetList.rows)
    setComponents(componentList.rows)
    setAreas(nextAreas)
    setRoles(nextRoles)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void loadWorkspace(controller.signal)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        handleFailure(cause, 'Não foi possível carregar o construtor de checklist.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [handleFailure, loadWorkspace])

  const filteredModels = useMemo(() => {
    const term = search.trim().toLowerCase()
    return models.filter((model) => !term || [model.nome, model.ativo_tag, model.ativo_nome, model.componente_nome, model.workflow_status]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [models, search])

  const availableComponents = useMemo(
    () => components.filter((component) => (
      String(component.ativo_id) === String(plan.ativo_id)
      && (isAvailable(component) || String(component.id) === String(plan.componente_id))
    )),
    [components, plan.ativo_id, plan.componente_id],
  )
  const availableRoles = useMemo(
    () => roles.filter((role) => String(role.area_id) === String(routing.area_atual_id)),
    [roles, routing.area_atual_id],
  )
  const canEdit = ['RASCUNHO', 'DEVOLVIDO_CORRECAO', ''].includes(String(plan.workflow_status ?? '').toUpperCase())
  const canCreateRevision = normalizedWorkflow(plan.workflow_status) === 'VALIDADO'

  useEffect(() => {
    const input = workspaceRef.current?.querySelector<HTMLInputElement>(
      `[data-checklist-index="${activeItemIndex}"] input[data-step-title]`,
    )
    if (!input) return
    input.focus({ preventScroll: true })
    input.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeItemIndex, items.length])

  function newModel() {
    setPlan(emptyPlan())
    setItems([emptyItem(1)])
    setActiveItemIndex(0)
    setRoutingOpen(false)
    setError('')
    setNotice('Novo modelo iniciado. Preencha os campos e os itens abaixo.')
  }

  async function openModel(modelId: string) {
    setDetailLoading(true)
    setError('')
    setNotice('')
    try {
      const detail = await getAdminChecklistDetail(modelId)
      setPlan(detail.plano)
      setItems(detail.itens.map((item, index) => ({
        ...item, ordem: Number(item.ordem || index + 1), opcoes_texto: parseOptions(item.opcoes_json),
      })))
      setActiveItemIndex(0)
      setRoutingOpen(false)
    } catch (cause) {
      handleFailure(cause, 'Não foi possível abrir o checklist.')
    } finally {
      setDetailLoading(false)
    }
  }

  function updatePlan<K extends keyof AdminChecklistPlan>(key: K, value: AdminChecklistPlan[K]) {
    setPlan((current) => {
      const next = { ...current, [key]: value }
      if (key === 'ativo_id' && String(current.ativo_id) !== String(value)) next.componente_id = ''
      if (key === 'gatilho_tipo') {
        const unitByTrigger: Record<string, string> = { DIAS: 'dias', HORAS: 'h', PARAMETRO: '' }
        next.unidade = unitByTrigger[String(value)] ?? next.unidade
      }
      return next
    })
  }

  function updateItem(index: number, patch: Partial<AdminChecklistItem>) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const next = { ...item, ...patch }
      if (patch.tipo_resposta === 'EVIDENCIA') {
        next.evidencia_obrigatoria = 'SIM'
        next.evidencia_min_fotos = Math.max(1, Number(next.evidencia_min_fotos || 1))
        next.bloqueia_finalizacao = 'SIM'
      }
      if (patch.tipo_resposta === 'LEITURA_OPERACIONAL' && !next.parametro_nome) {
        next.parametro_nome = 'LEITURA'
        next.unidade = next.unidade || 'un'
      }
      return next
    }))
  }

  function addItem(type: ChecklistResponseType = 'OK_NOK') {
    setItems((current) => {
      const nextIndex = current.length
      setActiveItemIndex(nextIndex)
      return [...current, emptyItem(nextIndex + 1, type)]
    })
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    setItems((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((item, itemIndex) => ({ ...item, ordem: itemIndex + 1 }))
    })
    setActiveItemIndex(target)
  }

  function duplicateItem(index: number) {
    setItems((current) => {
      const source = current[index]
      if (!source) return current
      const copy: AdminChecklistItem = {
        ...source,
        id: '',
        plano_id: '',
        titulo: source.titulo ? `${source.titulo} · cópia` : 'Nova etapa',
      }
      const next = [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]
      return next.map((item, itemIndex) => ({ ...item, ordem: itemIndex + 1 }))
    })
    setActiveItemIndex(index + 1)
  }

  function removeItem(index: number) {
    setItems((current) =>
      current
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, ordem: itemIndex + 1 })),
    )
    setActiveItemIndex((current) =>
      Math.max(0, Math.min(current > index ? current - 1 : current, items.length - 2)),
    )
  }

  function validateDraft(): string {
    if (!plan.ativo_id) return 'Selecione o ativo do checklist.'
    if (!plan.nome.trim()) return 'Informe o nome do checklist.'
    if (!(Number(plan.gatilho_valor) > 0)) return 'Informe um valor de gatilho maior que zero.'
    if (!items.length) return 'Inclua pelo menos um item.'
    for (const [index, item] of items.entries()) {
      if (!item.titulo.trim()) return `Informe o título do item ${index + 1}.`
      if (['NUMERO', 'PARAMETRO', 'LEITURA_OPERACIONAL'].includes(item.tipo_resposta) && !item.unidade) return `Selecione a unidade do item ${index + 1}.`
      if (['PARAMETRO', 'LEITURA_OPERACIONAL'].includes(item.tipo_resposta) && !item.parametro_nome?.trim()) return `Informe o parâmetro do item ${index + 1}.`
      if (item.tipo_resposta === 'SELECAO') {
        const optionCount = String(item.opcoes_texto ?? '').split(/[|\n]/).map((option) => option.trim()).filter(Boolean).length
        if (optionCount < 2) return `Informe pelo menos duas opções no item ${index + 1}.`
      }
    }
    return ''
  }

  async function saveModel(): Promise<AdminChecklistPlan | null> {
    const validation = validateDraft()
    if (validation) {
      setError(validation)
      return null
    }
    setSaving(true)
    setError('')
    try {
      const normalizedItems = items.map((item, index) => ({
        ...item, ordem: index + 1, opcoes_json: cleanOptions(item.opcoes_texto),
      }))
      const result = await saveAdminChecklistModel(plan, normalizedItems)
      setPlan(result.plano)
      setItems(result.itens.map((item, index) => ({ ...item, ordem: index + 1, opcoes_texto: parseOptions(item.opcoes_json) })))
      const nextModels = await listAdminChecklistModels()
      setModels(nextModels)
      setNotice('Rascunho salvo. O modelo continua inativo até a validação técnica.')
      return result.plano
    } catch (cause) {
      handleFailure(cause, 'Não foi possível salvar o checklist.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function sendForValidation() {
    if (!routing.area_atual_id) {
      setError('Selecione a área técnica que fará a primeira validação.')
      return
    }
    if (!routing.comentario.trim()) {
      setError('Descreva o que o Gestor deve validar.')
      return
    }
    setSending(true)
    setError('')
    try {
      const saved = await saveModel()
      if (!saved) return
      await sendAdminChecklistForValidation({
        plano_id: saved.id,
        comentario: routing.comentario.trim(),
        area_atual_id: routing.area_atual_id,
        cargo_atual_id: routing.cargo_atual_id,
        exige_assinatura: routing.exige_assinatura,
        assinaturas_necessarias: Number(routing.assinaturas_necessarias || 1),
        exige_segregacao: routing.exige_segregacao,
      })
      const nextModels = await listAdminChecklistModels()
      setModels(nextModels)
      const sent = nextModels.find((model) => model.id === saved.id)
      setPlan(sent ?? { ...saved, workflow_status: 'EM_VALIDACAO_GESTAO' })
      setRoutingOpen(false)
      setNotice('Checklist enviado ao filtro técnico. O Operador ainda não recebeu esta programação.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível enviar o checklist para validação.')
    } finally {
      setSending(false)
    }
  }

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      await loadWorkspace()
      setNotice('Biblioteca e listas de cadastro atualizadas.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível atualizar os checklists.')
    } finally {
      setLoading(false)
    }
  }

  async function createRevision(modelId: string) {
    setLibraryBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await createAdminChecklistRevision(modelId)
      setPlan(result.plano)
      setItems(result.itens.map((item, index) => ({
        ...item,
        ordem: index + 1,
        opcoes_texto: parseOptions(item.opcoes_json),
      })))
      setModels(await listAdminChecklistModels())
      setRoutingOpen(false)
      setNotice(`Revisão ${result.revisao} criada em rascunho. A versão validada continua ativa até a aprovação desta revisão.`)
    } catch (cause) {
      handleFailure(cause, 'Não foi possível criar a nova revisão.')
    } finally {
      setLibraryBusy(false)
    }
  }

  async function deleteDraftModel() {
    if (!modelToDelete) return
    setLibraryBusy(true)
    setError('')
    try {
      await actionAdminEntity({
        entidade: 'planos',
        id: modelToDelete.id,
        acao: 'EXCLUIR',
      })
      const deletedId = modelToDelete.id
      const nextModels = await listAdminChecklistModels()
      setModels(nextModels)
      if (plan.id === deletedId) {
        setPlan(emptyPlan())
        setItems([emptyItem(1)])
      }
      setModelToDelete(null)
      setNotice('Rascunho excluído com auditoria. Nenhum modelo validado foi alterado.')
    } catch (cause) {
      handleFailure(cause, 'Não foi possível excluir o rascunho.')
    } finally {
      setLibraryBusy(false)
    }
  }

  if (loading) return <div className="dashboard-loading">Carregando construtor de checklist…</div>

  return (
    <section className="admin-checklist-workspace" ref={workspaceRef}>
      {error ? <div className="dashboard-error" role="alert"><strong>Ação não concluída.</strong><span>{error}</span></div> : null}
      {notice ? <div className="dashboard-notice" role="status">{notice}</div> : null}

      <div className="admin-checklist-layout">
        <aside className="admin-checklist-library">
          <header><div><span className="eyebrow">BIBLIOTECA</span><h2>Modelos técnicos</h2></div><button type="button" onClick={() => void refresh()} aria-label="Atualizar"><RefreshIcon /></button></header>
          <label><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar checklist ou ativo" /></label>
          <button className="primary-button admin-checklist-new" type="button" onClick={newModel}>+ Novo checklist</button>
          <div className="admin-checklist-models">
            {filteredModels.map((model) => (
              <article key={model.id} className={plan.id === model.id ? 'is-active' : ''}>
                <button className="admin-checklist-model-open" type="button" onClick={() => void openModel(model.id)}>
                  <span className="admin-checklist-model-heading">
                    <strong>{model.nome}</strong>
                    <i className={`admin-workflow-chip admin-workflow-chip--${String(model.workflow_status || 'rascunho').toLowerCase()}`}>{workflowLabel(model.workflow_status)}</i>
                  </span>
                  <small className="admin-checklist-model-asset">{model.ativo_tag || model.ativo_nome}{model.componente_nome ? ` · ${model.componente_nome}` : ''}</small>
                  <b className="admin-checklist-model-meta">{model.itens_count ?? 0} itens <span>•</span> R{model.revisao || 1}</b>
                </button>
                <div className="admin-checklist-model-actions">
                  {normalizedWorkflow(model.workflow_status) === 'VALIDADO' ? <button type="button" title="Nova revisão" aria-label={`Criar nova revisão de ${model.nome}`} disabled={libraryBusy} onClick={() => void createRevision(model.id)}><CopyIcon /></button> : null}
                  {normalizedWorkflow(model.workflow_status) === 'RASCUNHO' && !model.revisao_origem_id && !model.substitui_plano_id ? <button className="is-danger" type="button" title="Excluir rascunho" aria-label={`Excluir rascunho ${model.nome}`} disabled={libraryBusy} onClick={() => setModelToDelete(model)}><TrashIcon /></button> : null}
                </div>
              </article>
            ))}
            {!filteredModels.length ? <div className="admin-empty-state admin-checklist-empty"><ShieldIcon /><strong>Nenhum modelo encontrado</strong><span>Crie o primeiro checklist. Depois, a biblioteca exibirá ações de edição, envio, correção, revisão e exclusão segura de rascunhos.</span></div> : null}
          </div>
        </aside>

        <section className="admin-checklist-builder">
          <header>
            <div><span className="eyebrow">CONSTRUTOR ASSISTIDO</span><h2>{plan.id ? plan.nome : 'Novo modelo de checklist'}</h2><p>Os vínculos e regras usam listas controladas para reduzir erros de cadastro.</p></div>
            <span className={`admin-workflow-chip admin-workflow-chip--${String(plan.workflow_status || 'rascunho').toLowerCase()}`}>{workflowLabel(plan.workflow_status)}</span>
          </header>

          {detailLoading ? <div className="dashboard-loading">Abrindo modelo…</div> : (
            <>
              {!canEdit ? <div className="admin-checklist-lock"><ShieldIcon /><span><strong>Versão protegida</strong><small>Este modelo está em validação ou já foi validado. Ele não pode ser alterado diretamente.</small></span></div> : null}
              {canEdit ? (
                <section className="admin-checklist-quick-start" aria-label="Criação rápida de etapas">
                  <header>
                    <div>
                      <span className="eyebrow">CRIAÇÃO RÁPIDA</span>
                      <h3>Qual etapa deseja adicionar?</h3>
                    </div>
                    <button
                      className="admin-checklist-add-main"
                      type="button"
                      onClick={() => addItem()}
                    >
                      <PlusIcon />
                      Etapa padrão
                    </button>
                  </header>
                  <div className="admin-checklist-quick-types" aria-label="Adicionar etapa rápida">
                    {QUICK_ITEM_TYPES.map(({ value, label, detail, Icon }) => (
                      <button type="button" key={value} onClick={() => addItem(value)}>
                        <Icon />
                        <span><strong>{label}</strong><small>{detail}</small></span>
                        <PlusIcon />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <fieldset disabled={!canEdit || saving || sending} className="admin-checklist-plan-form">
                <legend>Programação e contexto</legend>
                <label><span>Ativo *</span><select value={plan.ativo_id} onChange={(event) => updatePlan('ativo_id', event.target.value)}><option value="">Selecione o equipamento…</option>{assets.filter((asset) => isAvailable(asset) || String(asset.id) === String(plan.ativo_id)).map((asset) => <option value={asset.id} key={asset.id}>{String(asset.tag || asset.id)} · {String(asset.nome)}</option>)}</select></label>
                <label><span>Componente</span><select value={plan.componente_id || ''} onChange={(event) => updatePlan('componente_id', event.target.value)}><option value="">Checklist do ativo completo</option>{availableComponents.map((component) => <option value={component.id} key={component.id}>{String(component.tag || component.id)} · {String(component.nome)}</option>)}</select></label>
                <label className="is-wide"><span>Nome do checklist *</span><input value={plan.nome} onChange={(event) => updatePlan('nome', event.target.value)} /></label>
                <label><span>Tipo</span><select value={plan.tipo} onChange={(event) => updatePlan('tipo', event.target.value)}><option value="PREVENTIVA">Preventiva</option><option value="PREDITIVA">Preditiva</option><option value="INSPECAO">Inspeção</option><option value="QUALIDADE">Qualidade</option><option value="SEGURANCA">Segurança</option></select></label>
                <label><span>Criticidade</span><select value={plan.criticidade} onChange={(event) => updatePlan('criticidade', event.target.value)}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label>
                <label><span>Disparo</span><select value={plan.gatilho_tipo} onChange={(event) => updatePlan('gatilho_tipo', event.target.value)}><option value="DIAS">Periodicidade</option><option value="HORAS">Horímetro</option><option value="PARAMETRO">Parâmetro técnico</option></select></label>
                <label><span>Intervalo *</span><input type="number" min="0.01" step="0.01" value={plan.gatilho_valor} onChange={(event) => updatePlan('gatilho_valor', event.target.value)} /></label>
                <label><span>Unidade do disparo</span><select value={plan.unidade || ''} onChange={(event) => updatePlan('unidade', event.target.value)}>{UNIT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label><span>Tempo estimado</span><select value={String(plan.tempo_estimado_min || 60)} onChange={(event) => updatePlan('tempo_estimado_min', Number(event.target.value))}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hora</option><option value="90">1h30</option><option value="120">2 horas</option><option value="240">4 horas</option><option value="480">1 turno</option></select></label>
                <label><span>Bloqueio LOTO</span><select value={plan.requer_bloqueio || 'SIM'} onChange={(event) => updatePlan('requer_bloqueio', event.target.value)}>{YES_NO.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label><span>Modo de parada</span><select value={plan.modo_parada_manutencao || 'DECISAO_EXECUTOR'} onChange={(event) => updatePlan('modo_parada_manutencao', event.target.value)}><option value="DECISAO_EXECUTOR">Decisão do executor</option><option value="OBRIGATORIA">Parada obrigatória</option><option value="SEM_PARADA">Executar sem parada</option></select></label>
              </fieldset>

              <section className="admin-checklist-items">
                <header>
                  <div>
                    <span className="eyebrow">ETAPAS</span>
                    <h3>Etapas do checklist</h3>
                    <p>{items.length} {items.length === 1 ? 'etapa configurada' : 'etapas configuradas'}. Selecione uma etapa para editar.</p>
                  </div>
                </header>
                {items.map((item, index) => (
                  <fieldset
                    className={`admin-checklist-item ${activeItemIndex === index ? 'is-active' : ''}`}
                    data-checklist-index={index}
                    disabled={!canEdit || saving || sending}
                    key={`${item.id || 'new'}-${index}`}
                  >
                    <header onClick={() => setActiveItemIndex(index)}>
                      <b>{String(index + 1).padStart(2, '0')}</b>
                      <span>
                        <strong>{item.titulo || 'Nova etapa'}</strong>
                        <small>{RESPONSE_TYPES.find((type) => type.value === item.tipo_resposta)?.label}</small>
                      </span>
                      <div>
                        <button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label="Mover para cima" title="Mover para cima"><ArrowUpIcon /></button>
                        <button type="button" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} aria-label="Mover para baixo" title="Mover para baixo"><ArrowDownIcon /></button>
                        <button type="button" onClick={() => duplicateItem(index)} aria-label="Duplicar etapa" title="Duplicar etapa"><CopyIcon /></button>
                        <button className="is-danger" type="button" disabled={items.length === 1} onClick={() => removeItem(index)} aria-label="Remover etapa" title="Remover etapa"><TrashIcon /></button>
                      </div>
                    </header>
                    <div className="admin-checklist-item-form">
                      <label className="is-wide"><span>Título da etapa *</span><input data-step-title value={item.titulo} onChange={(event) => updateItem(index, { titulo: event.target.value })} placeholder="O que o Operador deve verificar?" /></label>
                      <label><span>Tipo de resposta</span><select value={item.tipo_resposta} onChange={(event) => updateItem(index, { tipo_resposta: event.target.value as ChecklistResponseType })}>{RESPONSE_TYPES.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
                      <label><span>Categoria</span><select value={item.categoria || 'OPERACIONAL'} onChange={(event) => updateItem(index, { categoria: event.target.value })}><option value="OPERACIONAL">Operacional</option><option value="MANUTENCAO">Manutenção</option><option value="QUALIDADE">Qualidade</option><option value="SEGURANCA">Segurança</option><option value="MEIO_AMBIENTE">Meio ambiente</option></select></label>
                      <label className="is-wide"><span>Instrução ao executor</span><textarea rows={2} value={item.instrucao || ''} onChange={(event) => updateItem(index, { instrucao: event.target.value })} /></label>
                      {['NUMERO', 'PARAMETRO', 'LEITURA_OPERACIONAL'].includes(item.tipo_resposta) ? <><label><span>Unidade *</span><select value={item.unidade || ''} onChange={(event) => updateItem(index, { unidade: event.target.value })}>{UNIT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label><span>Limite mínimo</span><input type="number" value={item.limite_min ?? ''} onChange={(event) => updateItem(index, { limite_min: event.target.value })} /></label><label><span>Limite máximo</span><input type="number" value={item.limite_max ?? ''} onChange={(event) => updateItem(index, { limite_max: event.target.value })} /></label></> : null}
                      {['PARAMETRO', 'LEITURA_OPERACIONAL'].includes(item.tipo_resposta) ? <label><span>{item.tipo_resposta === 'LEITURA_OPERACIONAL' ? 'Tipo de leitura *' : 'Parâmetro *'}</span><select value={item.parametro_nome || ''} onChange={(event) => updateItem(index, { parametro_nome: event.target.value })}><option value="">Selecione…</option><option value="TEMPERATURA">Temperatura</option><option value="PRESSAO">Pressão</option><option value="VIBRACAO">Vibração</option><option value="CORRENTE">Corrente</option><option value="TENSAO">Tensão</option><option value="ROTACAO">Rotação</option><option value="NIVEL">Nível</option><option value="HORIMETRO">Horímetro</option><option value="LEITURA">Outra leitura</option></select></label> : null}
                      {item.tipo_resposta === 'SELECAO' ? <label className="is-wide"><span>Opções *</span><input value={item.opcoes_texto || ''} onChange={(event) => updateItem(index, { opcoes_texto: event.target.value })} placeholder="Normal | Atenção | Crítico" /><small>Separe as opções com |.</small></label> : null}
                      <label><span>Resposta obrigatória</span><select value={item.obrigatorio} onChange={(event) => updateItem(index, { obrigatorio: event.target.value })}>{YES_NO.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                      <label><span>Exigir evidência</span><select value={item.evidencia_obrigatoria} disabled={item.tipo_resposta === 'EVIDENCIA'} onChange={(event) => updateItem(index, { evidencia_obrigatoria: event.target.value })}>{YES_NO.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                      <label><span>Bloquear finalização</span><select value={item.bloqueia_finalizacao || 'NAO'} onChange={(event) => updateItem(index, { bloqueia_finalizacao: event.target.value })}>{YES_NO.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                    </div>
                  </fieldset>
                ))}
              </section>

              <footer className="admin-checklist-actions">
                <span><CheckIcon /><small>Salvar mantém o modelo em rascunho inativo. Somente a aprovação do Gestor libera ao Operador.</small></span>
                {canEdit ? <div><button type="button" disabled={saving || sending} onClick={() => void saveModel()}>{saving ? 'Salvando…' : 'Salvar rascunho'}</button><button className="primary-button" type="button" disabled={saving || sending} onClick={() => { setError(''); setRoutingOpen(true) }}>Enviar para validação</button></div> : canCreateRevision ? <div><button className="primary-button" type="button" disabled={libraryBusy} onClick={() => void createRevision(plan.id)}>{libraryBusy ? 'Criando revisão…' : 'Criar nova revisão'}</button></div> : null}
              </footer>
            </>
          )}
        </section>
      </div>

      {routingOpen && canEdit ? (
        <div
          className="admin-catalog-dialog admin-checklist-routing-dialog"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sending) setRoutingOpen(false)
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="checklist-routing-title">
            <header>
              <div>
                <span className="eyebrow">ENVIO PARA VALIDAÇÃO</span>
                <h2 id="checklist-routing-title">Definir filtro técnico</h2>
              </div>
              <button type="button" disabled={sending} aria-label="Fechar" onClick={() => setRoutingOpen(false)}>×</button>
            </header>
            <div className="admin-checklist-routing">
              <header><ShieldIcon /><span><strong>Quem deve validar primeiro?</strong><small>O Gestor da área poderá assumir, assinar ou encaminhar a solicitação.</small></span></header>
              {error ? <div className="dashboard-error" role="alert"><strong>Revise o envio.</strong><span>{error}</span></div> : null}
              <div>
                <label><span>Área responsável *</span><select value={routing.area_atual_id} onChange={(event) => setRouting((current) => ({ ...current, area_atual_id: event.target.value, cargo_atual_id: '' }))}><option value="">Selecione a área…</option>{areas.map((area) => <option value={area.id} key={area.id}>{area.codigo} · {area.nome}</option>)}</select></label>
                <label><span>Cargo técnico</span><select value={routing.cargo_atual_id} onChange={(event) => setRouting((current) => ({ ...current, cargo_atual_id: event.target.value }))}><option value="">Qualquer gestor da área</option>{availableRoles.map((role) => <option value={role.id} key={role.id}>{role.nome}{String(role.pode_assinar).toUpperCase() === 'SIM' ? ' · pode assinar' : ''}</option>)}</select></label>
                <label><span>Exigir assinatura</span><select value={routing.exige_assinatura} onChange={(event) => setRouting((current) => ({ ...current, exige_assinatura: event.target.value }))}>{YES_NO.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label><span>Quantidade de assinaturas</span><select disabled={routing.exige_assinatura !== 'SIM'} value={routing.assinaturas_necessarias} onChange={(event) => setRouting((current) => ({ ...current, assinaturas_necessarias: Number(event.target.value) }))}><option value="1">1 assinatura</option><option value="2">2 assinaturas</option><option value="3">3 assinaturas</option></select></label>
                <label><span>Separar criador e aprovador</span><select value={routing.exige_segregacao} onChange={(event) => setRouting((current) => ({ ...current, exige_segregacao: event.target.value }))}>{YES_NO.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label className="is-wide"><span>Orientação ao Gestor *</span><textarea rows={3} value={routing.comentario} onChange={(event) => setRouting((current) => ({ ...current, comentario: event.target.value }))} placeholder="Explique o risco, o objetivo e os pontos que precisam ser validados." /></label>
              </div>
            </div>
            <footer>
              <span>O checklist permanece inativo até a decisão técnica do Gestor.</span>
              <div>
                <button type="button" disabled={sending} onClick={() => setRoutingOpen(false)}>Cancelar</button>
                <button className="primary-button" type="button" disabled={saving || sending} onClick={() => void sendForValidation()}>{sending ? 'Enviando…' : 'Confirmar e enviar'}</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      {modelToDelete ? <div className="admin-catalog-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !libraryBusy) setModelToDelete(null) }}><section role="dialog" aria-modal="true" aria-labelledby="delete-checklist-title">
        <header><div><span className="eyebrow">EXCLUSÃO PROTEGIDA</span><h2 id="delete-checklist-title">Excluir rascunho</h2></div><button type="button" disabled={libraryBusy} onClick={() => setModelToDelete(null)}>×</button></header>
        <div className="admin-checklist-delete"><ShieldIcon /><span><strong>{modelToDelete.nome}</strong><small>O servidor verificará planos, ordens, execuções e validações. Se existir qualquer vínculo, a exclusão será bloqueada e o modelo deverá permanecer no histórico.</small></span></div>
        <footer><span>Modelos validados nunca são excluídos por esta ação.</span><div><button type="button" disabled={libraryBusy} onClick={() => setModelToDelete(null)}>Cancelar</button><button className="is-danger" type="button" disabled={libraryBusy} onClick={() => void deleteDraftModel()}>{libraryBusy ? 'Excluindo…' : 'Excluir rascunho'}</button></div></footer>
      </section></div> : null}
    </section>
  )
}

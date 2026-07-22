import { useCallback, useEffect, useMemo, useState } from 'react'
import { listAdminEntity, saveAdminEntity } from '../services/api/catalog'
import { isGestorAuthenticationError } from '../services/api/gestor'
import type { AdminEntity, AdminEntityRecord } from '../types/catalog'
import { AssetIcon, CheckIcon, RefreshIcon, SearchIcon, SettingsIcon } from './Icons'

export type AdminCatalogScope = 'structure' | 'assets' | 'inventory' | 'maintenance'

interface AdminCatalogWorkspaceProps {
  scope: AdminCatalogScope
  onSessionExpired: () => void
  onOpenImports: () => void
}

type FieldType = 'text' | 'number' | 'select' | 'reference'

interface FieldDefinition {
  key: string
  label: string
  type?: FieldType
  required?: boolean
  options?: Array<{ value: string; label: string }>
  reference?: AdminEntity
  referenceLabel?: string
  dependsOn?: { field: string; targetField: string }
  help?: string
}

interface EntityDefinition {
  entity: AdminEntity
  singular: string
  label: string
  description: string
  columns: Array<{ key: string; label: string }>
  fields: FieldDefinition[]
  defaults: AdminEntityRecord
}

const STATUS_OPTIONS = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'INATIVO', label: 'Inativo' },
]

const CRITICALITY_OPTIONS = [
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'CRITICA', label: 'Crítica' },
]

const ENTITY_DEFINITIONS: Record<AdminEntity, EntityDefinition> = {
  plantas: {
    entity: 'plantas', singular: 'planta', label: 'Plantas e unidades', description: 'Raízes da estrutura organizacional.',
    columns: [{ key: 'tag', label: 'TAG' }, { key: 'nome', label: 'Nome' }, { key: 'status', label: 'Status' }, { key: 'atualizado_em', label: 'Atualizado em' }],
    fields: [
      { key: 'tag', label: 'TAG / código', required: true, help: 'Código curto e estável, como PLT-01.' },
      { key: 'nome', label: 'Nome da planta', required: true },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, required: true },
    ],
    defaults: { id: '', tag: '', nome: '', status: 'ATIVO' },
  },
  setores: {
    entity: 'setores', singular: 'setor', label: 'Setores', description: 'Áreas produtivas e técnicas vinculadas a uma planta.',
    columns: [{ key: 'tag', label: 'TAG' }, { key: 'nome', label: 'Nome' }, { key: 'planta_id', label: 'Planta' }, { key: 'status', label: 'Status' }],
    fields: [
      { key: 'planta_id', label: 'Planta', type: 'reference', reference: 'plantas', referenceLabel: 'nome', required: true },
      { key: 'tag', label: 'TAG / código', required: true },
      { key: 'nome', label: 'Nome do setor', required: true },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, required: true },
    ],
    defaults: { id: '', planta_id: '', tag: '', nome: '', status: 'ATIVO' },
  },
  linhas: {
    entity: 'linhas', singular: 'linha', label: 'Linhas de produção', description: 'Linhas vinculadas aos setores da planta.',
    columns: [{ key: 'tag', label: 'TAG' }, { key: 'nome', label: 'Nome' }, { key: 'setor_id', label: 'Setor' }, { key: 'status', label: 'Status' }],
    fields: [
      { key: 'setor_id', label: 'Setor', type: 'reference', reference: 'setores', referenceLabel: 'nome', required: true },
      { key: 'tag', label: 'TAG / código', required: true },
      { key: 'nome', label: 'Nome da linha', required: true },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, required: true },
    ],
    defaults: { id: '', setor_id: '', tag: '', nome: '', status: 'ATIVO' },
  },
  ativos: {
    entity: 'ativos', singular: 'ativo', label: 'Equipamentos e ativos', description: 'Cadastro técnico dos equipamentos monitorados.',
    columns: [{ key: 'tag', label: 'TAG' }, { key: 'nome', label: 'Equipamento' }, { key: 'linha_id', label: 'Linha' }, { key: 'criticidade', label: 'Criticidade' }, { key: 'status', label: 'Status' }, { key: 'saude_pct', label: 'Saúde' }],
    fields: [
      { key: 'linha_id', label: 'Linha', type: 'reference', reference: 'linhas', referenceLabel: 'nome', required: true },
      { key: 'tag', label: 'TAG / código', required: true },
      { key: 'nome', label: 'Nome do equipamento', required: true },
      { key: 'tipo', label: 'Tipo de equipamento' },
      { key: 'criticidade', label: 'Criticidade', type: 'select', options: CRITICALITY_OPTIONS, required: true },
      { key: 'status', label: 'Status operacional', type: 'select', options: [{ value: 'OPERANDO', label: 'Operando' }, { value: 'PARADO', label: 'Parado' }, { value: 'INATIVO', label: 'Inativo' }], required: true },
      { key: 'saude_pct', label: 'Saúde (%)', type: 'number' },
      { key: 'horimetro_atual', label: 'Horímetro atual', type: 'number' },
      { key: 'fabricante', label: 'Fabricante' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'numero_serie', label: 'Número de série' },
      { key: 'localizacao_tecnica', label: 'Localização técnica' },
    ],
    defaults: { id: '', linha_id: '', tag: '', nome: '', tipo: '', criticidade: 'MEDIA', status: 'OPERANDO', saude_pct: 100, horimetro_atual: 0 },
  },
  componentes: {
    entity: 'componentes', singular: 'componente', label: 'Componentes', description: 'Partes e subconjuntos vinculados aos equipamentos.',
    columns: [{ key: 'tag', label: 'TAG' }, { key: 'nome', label: 'Componente' }, { key: 'ativo_id', label: 'Ativo' }, { key: 'criticidade', label: 'Criticidade' }, { key: 'status', label: 'Status' }, { key: 'horas_acumuladas', label: 'Horas' }],
    fields: [
      { key: 'ativo_id', label: 'Ativo', type: 'reference', reference: 'ativos', referenceLabel: 'nome', required: true },
      { key: 'tag', label: 'TAG / código', required: true },
      { key: 'nome', label: 'Nome do componente', required: true },
      { key: 'tipo', label: 'Tipo de componente' },
      { key: 'criticidade', label: 'Criticidade', type: 'select', options: CRITICALITY_OPTIONS, required: true },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, required: true },
      { key: 'vida_util_horas', label: 'Vida útil (horas)', type: 'number' },
      { key: 'vida_util_dias', label: 'Vida útil (dias)', type: 'number' },
      { key: 'horas_acumuladas', label: 'Horas acumuladas', type: 'number' },
      { key: 'instalado_em', label: 'Data de instalação' },
      { key: 'fabricante', label: 'Fabricante' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'numero_serie', label: 'Número de série' },
      { key: 'localizacao_tecnica', label: 'Localização técnica' },
    ],
    defaults: { id: '', ativo_id: '', tag: '', nome: '', tipo: '', criticidade: 'MEDIA', status: 'ATIVO', vida_util_horas: 0, vida_util_dias: 0, horas_acumuladas: 0 },
  },
  materiais: {
    entity: 'materiais', singular: 'material', label: 'Materiais e peças', description: 'Itens utilizados nas execuções de manutenção.',
    columns: [{ key: 'sku', label: 'SKU' }, { key: 'nome', label: 'Material' }, { key: 'unidade', label: 'Unidade' }, { key: 'estoque_atual', label: 'Saldo' }, { key: 'estoque_minimo', label: 'Mínimo' }, { key: 'status', label: 'Status' }],
    fields: [
      { key: 'sku', label: 'SKU / código', required: true },
      { key: 'nome', label: 'Nome do material', required: true },
      { key: 'unidade', label: 'Unidade', required: true },
      { key: 'estoque_atual', label: 'Estoque atual', type: 'number' },
      { key: 'estoque_minimo', label: 'Estoque mínimo', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, required: true },
    ],
    defaults: { id: '', sku: '', nome: '', unidade: 'un', estoque_atual: 0, estoque_minimo: 0, status: 'ATIVO' },
  },
  planos: {
    entity: 'planos', singular: 'plano', label: 'Planos programados', description: 'Programações que seguem para validação técnica antes de chegar ao Operador.',
    columns: [{ key: 'nome', label: 'Plano' }, { key: 'ativo_id', label: 'Ativo' }, { key: 'tipo', label: 'Tipo' }, { key: 'gatilho_tipo', label: 'Gatilho' }, { key: 'gatilho_valor', label: 'Intervalo' }, { key: 'workflow_status', label: 'Fluxo' }],
    fields: [
      { key: 'ativo_id', label: 'Ativo', type: 'reference', reference: 'ativos', referenceLabel: 'nome', required: true },
      { key: 'componente_id', label: 'Componente (opcional)', type: 'reference', reference: 'componentes', referenceLabel: 'nome', dependsOn: { field: 'ativo_id', targetField: 'ativo_id' } },
      { key: 'nome', label: 'Nome do plano', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: [{ value: 'PREVENTIVA', label: 'Preventiva' }, { value: 'PREDITIVA', label: 'Preditiva' }, { value: 'INSPECAO', label: 'Inspeção' }], required: true },
      { key: 'criticidade', label: 'Criticidade', type: 'select', options: CRITICALITY_OPTIONS, required: true },
      { key: 'gatilho_tipo', label: 'Tipo de gatilho', type: 'select', options: [{ value: 'HORAS', label: 'Horímetro' }, { value: 'DIAS', label: 'Periodicidade em dias' }, { value: 'PARAMETRO', label: 'Parâmetro técnico' }], required: true },
      { key: 'gatilho_valor', label: 'Valor do gatilho', type: 'number', required: true },
      { key: 'unidade', label: 'Unidade', help: 'Ex.: h, dias, bar, °C.' },
      { key: 'recorrencia_dias', label: 'Recorrência (dias)', type: 'number' },
      { key: 'tempo_estimado_min', label: 'Tempo estimado (min)', type: 'number' },
      { key: 'requer_bloqueio', label: 'Requer bloqueio', type: 'select', options: [{ value: 'SIM', label: 'Sim' }, { value: 'NAO', label: 'Não' }] },
      { key: 'requer_evidencia', label: 'Requer evidência', type: 'select', options: [{ value: 'SIM', label: 'Sim' }, { value: 'NAO', label: 'Não' }] },
      { key: 'max_sessoes', label: 'Máximo de sessões', type: 'number' },
      { key: 'modo_parada_manutencao', label: 'Modo de parada', type: 'select', options: [{ value: 'DECISAO_EXECUTOR', label: 'Decisão do executor' }, { value: 'OBRIGATORIA', label: 'Parada obrigatória' }, { value: 'SEM_PARADA', label: 'Executar sem parada' }] },
    ],
    defaults: { id: '', ativo_id: '', componente_id: '', nome: '', tipo: 'PREVENTIVA', criticidade: 'MEDIA', gatilho_tipo: 'DIAS', gatilho_valor: 30, unidade: 'dias', recorrencia_dias: 30, tempo_estimado_min: 60, requer_bloqueio: 'SIM', requer_evidencia: 'NAO', max_sessoes: 1, modo_parada_manutencao: 'DECISAO_EXECUTOR', status: 'INATIVO', workflow_status: 'RASCUNHO' },
  },
  plano_itens: {
    entity: 'plano_itens', singular: 'item', label: 'Itens de checklist', description: 'Itens técnicos dos planos.',
    columns: [{ key: 'ordem', label: 'Ordem' }, { key: 'titulo', label: 'Item' }, { key: 'plano_id', label: 'Plano' }, { key: 'tipo_resposta', label: 'Resposta' }, { key: 'obrigatorio', label: 'Obrigatório' }],
    fields: [], defaults: { id: '' },
  },
}

const SCOPE_ENTITIES: Record<AdminCatalogScope, AdminEntity[]> = {
  structure: ['plantas', 'setores', 'linhas'],
  assets: ['ativos', 'componentes'],
  inventory: ['materiais'],
  maintenance: ['planos'],
}

const SCOPE_REFERENCES: Record<AdminCatalogScope, AdminEntity[]> = {
  structure: ['plantas', 'setores', 'linhas'],
  assets: ['linhas', 'ativos', 'componentes'],
  inventory: ['materiais'],
  maintenance: ['ativos', 'componentes', 'planos'],
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatCell(key: string, value: unknown): string {
  if (key === 'saude_pct' && value !== '' && value !== undefined) return `${value}%`
  if (key.endsWith('_em') && value) {
    const date = new Date(String(value))
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
  }
  return valueText(value)
}

export function AdminCatalogWorkspace({
  scope,
  onSessionExpired,
  onOpenImports,
}: AdminCatalogWorkspaceProps) {
  const scopeEntities = SCOPE_ENTITIES[scope]
  const [selectedEntity, setSelectedEntity] = useState<AdminEntity>(scopeEntities[0])
  const [records, setRecords] = useState<Partial<Record<AdminEntity, AdminEntityRecord[]>>>({})
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AdminEntityRecord | null | undefined>(undefined)
  const [draft, setDraft] = useState<AdminEntityRecord>({ id: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setSelectedEntity(SCOPE_ENTITIES[scope][0])
    setSearch('')
    setEditing(undefined)
  }, [scope])

  const loadData = useCallback(async (signal?: AbortSignal) => {
    const entities = SCOPE_REFERENCES[scope]
    const lists = await Promise.all(entities.map((entity) => listAdminEntity(entity, signal)))
    setRecords(Object.fromEntries(lists.map((list) => [list.entidade, list.rows])))
  }, [scope])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void loadData(controller.signal)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (isGestorAuthenticationError(cause)) {
          onSessionExpired()
          return
        }
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os cadastros.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [loadData, onSessionExpired])

  const definition = ENTITY_DEFINITIONS[selectedEntity]
  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (records[selectedEntity] ?? []).filter((record) => (
      !term || Object.values(record).some((value) => valueText(value).toLowerCase().includes(term))
    ))
  }, [records, search, selectedEntity])

  function referenceLabel(entity: AdminEntity, id: unknown): string {
    const item = (records[entity] ?? []).find((record) => String(record.id) === String(id))
    return item ? `${valueText(item.tag || item.sku || item.id)} · ${valueText(item.nome)}` : valueText(id)
  }

  function displayCell(key: string, value: unknown): string {
    const relation: Partial<Record<string, AdminEntity>> = {
      planta_id: 'plantas', setor_id: 'setores', linha_id: 'linhas', ativo_id: 'ativos', componente_id: 'componentes', plano_id: 'planos',
    }
    return relation[key] ? referenceLabel(relation[key] as AdminEntity, value) : formatCell(key, value)
  }

  function openEditor(record?: AdminEntityRecord) {
    const next = record ? { ...record } : { ...definition.defaults }
    setEditing(record ?? null)
    setDraft(next)
    setError('')
    setNotice('')
  }

  function referenceOptions(field: FieldDefinition): AdminEntityRecord[] {
    let options = field.reference ? records[field.reference] ?? [] : []
    if (field.dependsOn) {
      const expected = draft[field.dependsOn.field]
      options = options.filter((item) => String(item[field.dependsOn?.targetField ?? '']) === String(expected))
    }
    return options
  }

  async function save() {
    const missing = definition.fields.filter((field) => field.required && valueText(draft[field.key]) === '—')
    if (missing.length) {
      setError(`Preencha: ${missing.map((field) => field.label).join(', ')}.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await saveAdminEntity(selectedEntity, draft)
      setRecords((current) => {
        const list = current[selectedEntity] ?? []
        const next = result.mode === 'update'
          ? list.map((record) => (record.id === result.row.id ? result.row : record))
          : [result.row, ...list]
        return { ...current, [selectedEntity]: next }
      })
      setEditing(undefined)
      setNotice(`${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} ${result.mode === 'insert' ? 'criado' : 'atualizado'} com auditoria.${selectedEntity === 'planos' ? ' O plano permanece em rascunho até a validação técnica.' : ''}`)
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cadastro.')
    } finally {
      setSaving(false)
    }
  }

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      await loadData()
      setNotice('Cadastros atualizados.')
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar os cadastros.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="dashboard-loading">Carregando cadastros administrativos…</div>

  return (
    <section className="admin-catalog-workspace">
      {error ? <div className="dashboard-error" role="alert"><strong>Cadastro não concluído.</strong><span>{error}</span></div> : null}
      {notice ? <div className="dashboard-notice" role="status">{notice}</div> : null}

      <section className="admin-catalog-summary">
        {scopeEntities.map((entity) => {
          const item = ENTITY_DEFINITIONS[entity]
          return <button key={entity} type="button" className={selectedEntity === entity ? 'is-active' : ''} onClick={() => { setSelectedEntity(entity); setSearch('') }}><AssetIcon /><span><strong>{records[entity]?.length ?? 0}</strong><small>{item.label}</small></span></button>
        })}
        <button type="button" className="admin-catalog-import" onClick={onOpenImports}><SettingsIcon /><span><strong>Importar</strong><small>Usar modelo .xlsx</small></span></button>
      </section>

      <section className="admin-catalog-panel">
        <header>
          <div><span className="eyebrow">CADASTRO MESTRE</span><h2>{definition.label}</h2><p>{definition.description}</p></div>
          <div><button type="button" onClick={() => void refresh()}><RefreshIcon />Atualizar</button><button className="primary-button" type="button" onClick={() => openEditor()}>Novo {definition.singular}</button></div>
        </header>
        {selectedEntity === 'planos' ? <div className="admin-plan-rule"><CheckIcon /><span><strong>Programação protegida</strong><small>Salvar cria um rascunho inativo. A liberação ao Operador só ocorre depois do checklist e da validação do Gestor.</small></span></div> : null}
        <label className="admin-catalog-search"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar em ${definition.label.toLowerCase()}`} /></label>
        <div className="admin-catalog-table">
          <table>
            <thead><tr>{definition.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Ações</th></tr></thead>
            <tbody>{visibleRecords.length ? visibleRecords.map((record) => <tr key={record.id}>{definition.columns.map((column) => <td key={column.key} title={displayCell(column.key, record[column.key])}><span className={column.key === 'status' || column.key === 'workflow_status' ? `admin-catalog-chip admin-catalog-chip--${String(record[column.key] || '').toLowerCase()}` : ''}>{displayCell(column.key, record[column.key])}</span></td>)}<td><button type="button" onClick={() => openEditor(record)}>Editar</button></td></tr>) : <tr><td colSpan={definition.columns.length + 1}><div className="admin-empty-state">Nenhum registro encontrado.</div></td></tr>}</tbody>
          </table>
        </div>
      </section>

      {editing !== undefined ? (
        <div className="admin-catalog-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(undefined) }}>
          <section role="dialog" aria-modal="true" aria-label={`${editing ? 'Editar' : 'Novo'} ${definition.singular}`}>
            <header><div><span className="eyebrow">{editing ? 'EDIÇÃO CONTROLADA' : 'NOVO CADASTRO'}</span><h2>{editing ? `Editar ${definition.singular}` : `Novo ${definition.singular}`}</h2></div><button type="button" disabled={saving} onClick={() => setEditing(undefined)}>×</button></header>
            <div className="admin-catalog-form">
              {definition.fields.map((field) => {
                const fieldValue = draft[field.key] ?? ''
                if (field.type === 'select') return <label key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span><select value={String(fieldValue)} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>{field.help ? <small>{field.help}</small> : null}</label>
                if (field.type === 'reference') return <label key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span><select value={String(fieldValue)} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">{field.required ? 'Selecione…' : 'Sem vínculo'}</option>{referenceOptions(field).map((option) => <option value={option.id} key={option.id}>{valueText(option.tag || option.sku || option.id)} · {valueText(option[field.referenceLabel ?? 'nome'])}</option>)}</select>{field.help ? <small>{field.help}</small> : null}</label>
                return <label key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span><input type={field.type === 'number' ? 'number' : 'text'} value={String(fieldValue)} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: field.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value }))} />{field.help ? <small>{field.help}</small> : null}</label>
              })}
            </div>
            <footer><span>{selectedEntity === 'planos' ? 'O backend força RASCUNHO e INATIVO.' : 'A alteração será registrada na auditoria.'}</span><div><button type="button" disabled={saving} onClick={() => setEditing(undefined)}>Cancelar</button><button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar cadastro'}</button></div></footer>
          </section>
        </div>
      ) : null}
    </section>
  )
}

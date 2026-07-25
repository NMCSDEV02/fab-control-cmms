import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getGestorNotifications,
  isGestorAuthenticationError,
  markGestorNotificationRead,
} from '../services/api/gestor'
import type { GestorNotification } from '../types/gestor'
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  RefreshIcon,
  SearchIcon,
} from './Icons'

type NotificationAudience = 'manager' | 'admin'
type NotificationScope = 'unread' | 'all'
type NotificationCategory = 'all' | 'technical' | 'operation' | 'system'

interface NotificationCenterProps {
  open: boolean
  audience?: NotificationAudience
  onClose: () => void
  onOpenNotification: (notification: GestorNotification) => void | Promise<void>
  onUnreadChange: (count: number) => void
  onSessionExpired: () => void
}

interface NotificationMetadata {
  category: Exclude<NotificationCategory, 'all'>
  typeLabel: string
  actionLabel: string
  entityLabel: string
}

function upper(value: unknown): string {
  return String(value ?? '').trim().toLocaleUpperCase('pt-BR')
}

function formatDate(value?: string): string {
  if (!value) return 'Agora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function isToday(value?: string): boolean {
  if (!value) return true
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const today = new Date()
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
}

function isUnread(notification: GestorNotification): boolean {
  return upper(notification.status) === 'NAO_LIDA'
}

function isCritical(notification: GestorNotification): boolean {
  return ['CRITICA', 'CRÍTICA', 'ALTA'].includes(upper(notification.prioridade))
}

function metadataOf(notification: GestorNotification): NotificationMetadata {
  const type = upper(notification.tipo)
  const entity = upper(notification.entidade_tipo)

  if (type === 'ANALISE_TECNICA' || entity === 'ANALISES_TECNICAS') {
    return {
      category: 'technical',
      typeLabel: 'Análise técnica',
      actionLabel: 'Abrir análise',
      entityLabel: 'Ocorrência analisada',
    }
  }

  if (
    type === 'DECISAO_TECNICA' ||
    type === 'DEMANDA_TECNICA' ||
    type === 'DEMANDA_ENCAMINHADA' ||
    entity === 'DEMANDAS_TECNICAS'
  ) {
    return {
      category: 'technical',
      typeLabel: type === 'DEMANDA_ENCAMINHADA' ? 'Encaminhamento' : 'Decisão técnica',
      actionLabel: 'Abrir solicitação',
      entityLabel: 'Fluxo técnico',
    }
  }

  if (
    type.includes('OCORRENCIA') ||
    entity === 'OCORRENCIAS_OPERACIONAIS' ||
    entity === 'OS_ACOES' ||
    entity === 'ORDENS_SERVICO'
  ) {
    return {
      category: 'operation',
      typeLabel: entity === 'OCORRENCIAS_OPERACIONAIS' ? 'Ocorrência' : 'Operação',
      actionLabel: entity === 'OCORRENCIAS_OPERACIONAIS' ? 'Analisar ocorrência' : 'Abrir operação',
      entityLabel: entity === 'OCORRENCIAS_OPERACIONAIS' ? 'Chão de fábrica' : 'Execução',
    }
  }

  if (entity === 'ATIVOS' || entity === 'PLANOS_MANUTENCAO' || entity === 'CHECKLIST_MODELO') {
    return {
      category: 'operation',
      typeLabel: entity === 'ATIVOS' ? 'Ativo monitorado' : 'Modelo operacional',
      actionLabel: entity === 'ATIVOS' ? 'Acompanhar ativo' : 'Abrir modelo',
      entityLabel: entity === 'ATIVOS' ? 'Ativo' : 'Planejamento',
    }
  }

  return {
    category: 'system',
    typeLabel: 'Aviso do sistema',
    actionLabel: 'Ver contexto',
    entityLabel: 'Governança',
  }
}

export function NotificationCenter({
  open,
  audience = 'manager',
  onClose,
  onOpenNotification,
  onUnreadChange,
  onSessionExpired,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<GestorNotification[]>([])
  const [scope, setScope] = useState<NotificationScope>('unread')
  const [category, setCategory] = useState<NotificationCategory>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [openingId, setOpeningId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const data = await getGestorNotifications(signal)
      setNotifications(data)
    } catch (cause) {
      if (signal?.aborted) return
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar as notificações.',
      )
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [onSessionExpired])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, open])

  const summary = useMemo(() => ({
    unread: notifications.filter(isUnread).length,
    critical: notifications.filter((item) => isUnread(item) && isCritical(item)).length,
    today: notifications.filter((item) => isToday(item.criado_em)).length,
  }), [notifications])

  useEffect(() => {
    onUnreadChange(summary.unread)
  }, [onUnreadChange, summary.unread])

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')

    return notifications.filter((item) => {
      const metadata = metadataOf(item)
      if (scope === 'unread' && !isUnread(item)) return false
      if (category !== 'all' && metadata.category !== category) return false
      if (!normalizedQuery) return true

      return [
        item.titulo,
        item.mensagem,
        item.tipo,
        item.entidade_tipo,
        metadata.typeLabel,
        metadata.entityLabel,
      ].some((value) => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalizedQuery))
    })
  }, [category, notifications, query, scope])

  const grouped = useMemo(() => ({
    today: visible.filter((item) => isToday(item.criado_em)),
    previous: visible.filter((item) => !isToday(item.criado_em)),
  }), [visible])

  function updateNotificationAsRead(notificationId: string) {
    setNotifications((current) => (
      current.map((item) => (
        item.id === notificationId
          ? { ...item, status: 'LIDA', lida_em: new Date().toISOString() }
          : item
      ))
    ))
  }

  async function openNotification(notification: GestorNotification) {
    if (openingId) return
    setOpeningId(notification.id)
    setError('')
    try {
      await onOpenNotification(notification)
      if (isUnread(notification)) {
        await markGestorNotificationRead(notification.id)
        updateNotificationAsRead(notification.id)
      }
      onClose()
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível abrir o contexto desta notificação.',
      )
    } finally {
      setOpeningId('')
    }
  }

  async function markAllAsRead() {
    const pending = notifications.filter(isUnread)
    if (!pending.length || markingAll) return

    setMarkingAll(true)
    setError('')
    try {
      for (const notification of pending) {
        await markGestorNotificationRead(notification.id)
      }
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => (
        isUnread(item) ? { ...item, status: 'LIDA', lida_em: readAt } : item
      )))
      setScope('all')
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir a leitura dos alertas.',
      )
      await load(undefined, true)
    } finally {
      setMarkingAll(false)
    }
  }

  if (!open) return null

  const audienceDescription = audience === 'admin'
    ? 'Análises, decisões e eventos que exigem governança.'
    : 'Prioridades técnicas e ocorrências do seu escopo.'

  return (
    <div className="manager-notification-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className={`manager-notification-center manager-notification-center--${audience}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-notification-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="manager-notification-header">
          <div>
            <span className="eyebrow">CENTRAL OPERACIONAL</span>
            <h2 id="manager-notification-title">Notificações</h2>
            <p>{audienceDescription}</p>
          </div>
          <div>
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={() => void load(undefined, true)}
              aria-label="Atualizar notificações"
              title="Atualizar"
            >
              <RefreshIcon />
            </button>
            <button type="button" onClick={onClose} aria-label="Fechar notificações">×</button>
          </div>
        </header>

        <section className="manager-notification-summary" aria-label="Resumo dos alertas">
          <article>
            <span>Não lidas</span>
            <strong>{summary.unread}</strong>
          </article>
          <article>
            <span>Hoje</span>
            <strong>{summary.today}</strong>
          </article>
          <article className={summary.critical > 0 ? 'is-critical' : ''}>
            <span>Críticas</span>
            <strong>{summary.critical}</strong>
          </article>
        </section>

        <section className="manager-notification-tools" aria-label="Filtros da central">
          <label>
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por ativo, ocorrência ou decisão"
              aria-label="Buscar notificações"
            />
          </label>
          <div>
            <div className="manager-notification-scope" role="group" aria-label="Situação">
              <button
                type="button"
                className={scope === 'unread' ? 'is-active' : ''}
                onClick={() => setScope('unread')}
              >
                Pendentes
              </button>
              <button
                type="button"
                className={scope === 'all' ? 'is-active' : ''}
                onClick={() => setScope('all')}
              >
                Todas
              </button>
            </div>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as NotificationCategory)}
              aria-label="Filtrar notificações por contexto"
            >
              <option value="all">Todos os contextos</option>
              <option value="technical">Técnico</option>
              <option value="operation">Operação</option>
              <option value="system">Sistema</option>
            </select>
          </div>
        </section>

        {error ? <div className="feedback feedback--error" role="alert">{error}</div> : null}

        <div className="manager-notification-scroll">
          {loading ? <p className="panel-state">Sincronizando alertas…</p> : null}

          {!loading && visible.length === 0 ? (
            <div className="manager-notification-empty">
              <CheckIcon />
              <strong>{notifications.length ? 'Nenhum alerta neste filtro' : 'Central em dia'}</strong>
              <span>
                {notifications.length
                  ? 'Ajuste a busca ou consulte todas as notificações.'
                  : 'Novas ocorrências, análises e decisões aparecerão aqui.'}
              </span>
              {notifications.length ? (
                <button type="button" onClick={() => {
                  setQuery('')
                  setCategory('all')
                  setScope('all')
                }}>
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : null}

          {grouped.today.length > 0 ? (
            <NotificationGroup
              title="Hoje"
              items={grouped.today}
              onOpen={(item) => void openNotification(item)}
              openingId={openingId}
            />
          ) : null}
          {grouped.previous.length > 0 ? (
            <NotificationGroup
              title="Anteriores"
              items={grouped.previous}
              onOpen={(item) => void openNotification(item)}
              openingId={openingId}
            />
          ) : null}
        </div>

        <footer className="manager-notification-footer">
          <span>
            <i className={summary.unread ? 'has-pending' : ''} aria-hidden="true" />
            {summary.unread
              ? `${summary.unread} ${summary.unread === 1 ? 'pendência requer' : 'pendências requerem'} atenção`
              : 'Nenhuma pendência de leitura'}
          </span>
          <button
            type="button"
            disabled={!summary.unread || markingAll}
            onClick={() => void markAllAsRead()}
          >
            <CheckIcon />
            {markingAll ? 'Confirmando…' : 'Marcar todas como lidas'}
          </button>
        </footer>
      </aside>
    </div>
  )
}

function NotificationGroup({
  title,
  items,
  onOpen,
  openingId,
}: {
  title: string
  items: GestorNotification[]
  onOpen: (notification: GestorNotification) => void
  openingId: string
}) {
  return (
    <section className="manager-notification-group">
      <header>
        <strong>{title}</strong>
        <span>{items.length}</span>
      </header>
      <div>
        {items.map((item) => {
          const unread = isUnread(item)
          const critical = isCritical(item)
          const metadata = metadataOf(item)

          return (
            <button
              className={`${unread ? 'is-unread' : ''}${critical ? ' is-critical' : ''}`}
              type="button"
              key={item.id}
              disabled={openingId === item.id}
              onClick={() => onOpen(item)}
            >
              <span className={critical ? 'is-critical' : ''}>
                {critical ? <AlertIcon /> : <BellIcon />}
              </span>
              <span className="manager-notification-card__content">
                <small>
                  <b>{metadata.typeLabel}</b>
                  <i aria-hidden="true">·</i>
                  {formatDate(item.criado_em)}
                </small>
                <strong>{item.titulo}</strong>
                <p>{item.mensagem || 'Abra para consultar o contexto relacionado.'}</p>
                <span>
                  <em>{metadata.entityLabel}</em>
                  {item.prioridade ? <em className={critical ? 'is-critical' : ''}>{upper(item.prioridade)}</em> : null}
                </span>
              </span>
              <span className="manager-notification-card__action">
                <small>{openingId === item.id ? 'Abrindo…' : metadata.actionLabel}</small>
                <ChevronRightIcon />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

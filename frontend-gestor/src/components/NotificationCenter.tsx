import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getGestorNotifications,
  isGestorAuthenticationError,
  markGestorNotificationRead,
} from '../services/api/gestor'
import type { GestorNotification } from '../types/gestor'
import { AlertIcon, BellIcon, CheckIcon, ChevronRightIcon, RefreshIcon } from './Icons'

interface NotificationCenterProps {
  open: boolean
  onClose: () => void
  onOpenNotification: (notification: GestorNotification) => void
  onUnreadChange: (count: number) => void
  onSessionExpired: () => void
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
    : 'Atualização'
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

export function NotificationCenter({
  open,
  onClose,
  onOpenNotification,
  onUnreadChange,
  onSessionExpired,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<GestorNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const data = await getGestorNotifications(signal)
      setNotifications(data)
      onUnreadChange(data.filter((item) => upper(item.status) === 'NAO_LIDA').length)
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
  }, [onSessionExpired, onUnreadChange])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, open])

  const grouped = useMemo(() => {
    const unread = notifications.filter((item) => upper(item.status) === 'NAO_LIDA')
    const read = notifications.filter((item) => upper(item.status) !== 'NAO_LIDA')
    return { unread, read }
  }, [notifications])

  async function openNotification(notification: GestorNotification) {
    if (upper(notification.status) === 'NAO_LIDA') {
      try {
        await markGestorNotificationRead(notification.id)
        setNotifications((current) => {
          const next = current.map((item) => (
            item.id === notification.id
              ? { ...item, status: 'LIDA', lida_em: new Date().toISOString() }
              : item
          ))
          onUnreadChange(next.filter((item) => upper(item.status) === 'NAO_LIDA').length)
          return next
        })
      } catch (cause) {
        if (isGestorAuthenticationError(cause)) {
          onSessionExpired()
          return
        }
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível confirmar a leitura.',
        )
        return
      }
    }

    onOpenNotification(notification)
    onClose()
  }

  if (!open) return null

  return (
    <div className="manager-notification-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="manager-notification-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-notification-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">CENTRAL DE ALERTAS</span>
            <h2 id="manager-notification-title">Notificações</h2>
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

        {error ? <div className="feedback feedback--error" role="alert">{error}</div> : null}

        <div className="manager-notification-scroll">
          {loading ? <p className="panel-state">Sincronizando alertas…</p> : null}
          {!loading && notifications.length === 0 ? (
            <div className="manager-notification-empty">
              <CheckIcon />
              <strong>Nenhuma notificação pendente</strong>
              <span>Ocorrências, decisões e mudanças críticas aparecerão aqui.</span>
            </div>
          ) : null}

          {grouped.unread.length > 0 ? (
            <NotificationGroup
              title="Novas"
              items={grouped.unread}
              onOpen={(item) => void openNotification(item)}
            />
          ) : null}
          {grouped.read.length > 0 ? (
            <NotificationGroup
              title="Anteriores"
              items={grouped.read}
              onOpen={(item) => void openNotification(item)}
            />
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function NotificationGroup({
  title,
  items,
  onOpen,
}: {
  title: string
  items: GestorNotification[]
  onOpen: (notification: GestorNotification) => void
}) {
  return (
    <section className="manager-notification-group">
      <header>
        <strong>{title}</strong>
        <span>{items.length}</span>
      </header>
      <div>
        {items.map((item) => {
          const unread = upper(item.status) === 'NAO_LIDA'
          const critical = ['CRITICA', 'CRÍTICA', 'ALTA'].includes(upper(item.prioridade))
          return (
            <button
              className={unread ? 'is-unread' : ''}
              type="button"
              key={item.id}
              onClick={() => onOpen(item)}
            >
              <span className={critical ? 'is-critical' : ''}>
                {critical ? <AlertIcon /> : <BellIcon />}
              </span>
              <span>
                <small>{humanize(item.tipo)} · {formatDate(item.criado_em)}</small>
                <strong>{item.titulo}</strong>
                <p>{item.mensagem || 'Abra para consultar o contexto relacionado.'}</p>
              </span>
              <ChevronRightIcon />
            </button>
          )
        })}
      </div>
    </section>
  )
}

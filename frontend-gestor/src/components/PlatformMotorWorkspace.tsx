import { useCallback, useEffect, useMemo, useState } from 'react'
import { APP_RELEASE_VERSION } from '../release'
import type { GestorSession } from '../services/api/auth'
import { getAdminCommercialAccess } from '../services/api/admin'
import { isGestorAuthenticationError } from '../services/api/gestor'
import type { AdminCommercialAccess } from '../types/admin'

interface PlatformMotorWorkspaceProps {
  session: GestorSession
  loggingOut: boolean
  onSessionExpired: () => void
  onLogout: () => void
}

function formatDate(value?: string): string {
  if (!value) return 'Não informado'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed)
}

function countdown(expiresAt: number, now: number): string {
  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function PlatformMotorWorkspace({
  session,
  loggingOut,
  onSessionExpired,
  onLogout,
}: PlatformMotorWorkspaceProps) {
  const [access, setAccess] = useState<AdminCommercialAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getAdminCommercialAccess()
      if (!result.acesso_integral || !result.manutencao.aberta) {
        onSessionExpired()
        return
      }
      setAccess(result)
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível validar a janela interna.')
    } finally {
      setLoading(false)
    }
  }, [onSessionExpired])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const remaining = useMemo(
    () => countdown(session.expiresAt, now),
    [now, session.expiresAt],
  )

  return (
    <main className="platform-motor-shell">
      <header className="platform-motor-topbar">
        <div className="platform-motor-brand">
          <span aria-hidden="true">FC</span>
          <div>
            <strong>Fab Control</strong>
            <small>Núcleo protegido do Motor</small>
          </div>
        </div>

        <div className="platform-motor-session">
          <span className="platform-motor-live"><i aria-hidden="true" />Janela ativa</span>
          <span><strong>{session.user.nome}</strong><small>SISTEMA</small></span>
          <b>{remaining}</b>
          <button type="button" disabled={loggingOut} onClick={onLogout}>
            {loggingOut ? 'Encerrando…' : 'Encerrar sessão'}
          </button>
        </div>
      </header>

      <section className="platform-motor-content">
        <div className="platform-motor-heading">
          <div>
            <span className="eyebrow">ACESSO INTERNO TEMPORÁRIO</span>
            <h1>Motor de plataforma</h1>
            <p>A sessão está vinculada à empresa, ao ambiente e à janela assinada.</p>
          </div>
          <button type="button" disabled={loading} onClick={() => void load()}>
            {loading ? 'Validando…' : 'Validar novamente'}
          </button>
        </div>

        {error ? <p className="feedback feedback--error">{error}</p> : null}

        <section className="platform-motor-status-grid" aria-label="Estado do acesso interno">
          <article>
            <span>Ambiente</span>
            <strong>{access?.manutencao.ambiente || access?.identidade_interna?.ambiente || 'Validando'}</strong>
            <small>Vinculado ao envelope assinado</small>
          </article>
          <article>
            <span>Janela</span>
            <strong>{access?.manutencao.estado || 'VALIDANDO'}</strong>
            <small>Expira em {formatDate(access?.manutencao.expira_em)}</small>
          </article>
          <article>
            <span>Assinatura do cliente</span>
            <strong>{access ? `Plano ${access.plano.nome}` : 'Validando'}</strong>
            <small>{access?.recursos.length ?? 0} grupo(s) contratado(s)</small>
          </article>
          <article>
            <span>Privilégio</span>
            <strong>{access?.acesso_integral ? 'INTEGRAL' : 'BLOQUEADO'}</strong>
            <small>Revalidado em todas as requisições</small>
          </article>
        </section>

        <section className="platform-motor-boundaries">
          <div>
            <span className="eyebrow">BARREIRAS ATIVAS</span>
            <h2>Proteção da manutenção</h2>
          </div>
          <ul>
            <li><strong>Código de uso único</strong><span>Uma nova entrada exige outra janela assinada.</span></li>
            <li><strong>Sessão curta</strong><span>Máximo de 30 minutos e nunca além da janela.</span></li>
            <li><strong>Isolamento por empresa</strong><span>Tenant e ambiente precisam coincidir no servidor.</span></li>
            <li><strong>Revogação imediata</strong><span>Alterar ou encerrar a janela invalida a próxima requisição.</span></li>
          </ul>
        </section>

        <footer className="platform-motor-footer">
          <span>Versão {APP_RELEASE_VERSION}</span>
          <span>Janela {access?.manutencao.janela_id || 'protegida'}</span>
        </footer>
      </section>
    </main>
  )
}

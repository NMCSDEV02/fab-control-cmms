import { useState, type FormEvent } from 'react'
import { ApiConnectionPanel } from '../components/ApiConnectionPanel'
import { API_COMPATIBLE_RELEASE, APP_RELEASE_VERSION } from '../release'
import {
  completeFirstAccess,
  loginGestor,
  type GestorSession,
} from '../services/api/auth'
import { ApiRequestError } from '../services/api/client'
import { getApiUrl } from '../services/api/config'

export interface LoginPageProps {
  onAuthenticated: (session: GestorSession) => void
}

type LoginView = 'login' | 'first-access'

function passwordMeetsRules(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  )
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [view, setView] = useState<LoginView>('login')
  const [registration, setRegistration] = useState('')
  const [password, setPassword] = useState('')
  const [firstAccessRegistration, setFirstAccessRegistration] = useState('')
  const [changeToken, setChangeToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConnection, setShowConnection] = useState(() => !getApiUrl())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function clearFeedback() {
    setError('')
    setMessage('')
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()

    const normalizedRegistration = registration.trim()
    if (!normalizedRegistration || !password) {
      setError('Informe a matrícula e a senha para continuar.')
      return
    }

    setSubmitting(true)
    try {
      const result = await loginGestor(normalizedRegistration, password)

      if (result.requires_password_change) {
        if (!result.change_token) {
          throw new ApiRequestError(
            'A API não forneceu a autorização de primeiro acesso.',
            'CHANGE_TOKEN_MISSING',
          )
        }

        setFirstAccessRegistration(result.usuario.matricula || normalizedRegistration)
        setChangeToken(result.change_token)
        setNewPassword('')
        setConfirmation('')
        setPassword('')
        setView('first-access')
        return
      }

      if (!result.token || !result.expira_ms) {
        throw new ApiRequestError(
          'A API não retornou uma sessão válida.',
          'AUTH_SESSION_INVALID',
        )
      }

      onAuthenticated({
        token: result.token,
        startedAt: new Date().toISOString(),
        expiresAt: result.expira_ms,
        user: result.usuario,
      })
    } catch (cause) {
      if (cause instanceof ApiRequestError) {
        if (cause.code === 'ROLE_NOT_ALLOWED') {
          setError(cause.message)
          return
        }

        if (cause.code === 'ACCOUNT_LOCKED') {
          setError('Conta temporariamente bloqueada. Aguarde a liberação administrativa.')
          return
        }

        if (cause.code === 'USER_INACTIVE') {
          setError('Conta inativa. Solicite a regularização ao administrador.')
          return
        }

        if (
          [
            'API_TIMEOUT',
            'NETWORK_ERROR',
            'HTTP_ERROR',
            'INVALID_JSON',
            'API_URL_MISSING',
            'VERSION_MISMATCH',
          ].includes(cause.code)
        ) {
          setError(cause.message)
          return
        }
      }

      setError('Matrícula ou senha inválida. Verifique os dados informados.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitFirstAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()

    if (!passwordMeetsRules(newPassword)) {
      setError(
        'A nova senha deve ter ao menos 8 caracteres, com letra maiúscula, minúscula e número.',
      )
      return
    }

    if (newPassword !== confirmation) {
      setError('A confirmação não corresponde à nova senha.')
      return
    }

    if (!changeToken) {
      setError('A autorização de primeiro acesso expirou. Entre novamente.')
      return
    }

    setSubmitting(true)
    try {
      await completeFirstAccess(changeToken, newPassword)
      setRegistration(firstAccessRegistration)
      setChangeToken('')
      setNewPassword('')
      setConfirmation('')
      setView('login')
      setMessage('Nova senha definida. Entre novamente para continuar.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir o primeiro acesso.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">FC</span>
          <div>
            <span className="eyebrow">FAB CONTROL</span>
            <h1 id="auth-title">Acesso do Gestor</h1>
          </div>
        </div>

        <p className="auth-intro">
          Supervisão de ações, paradas, ocorrências e auditoria operacional.
        </p>

        {!getApiUrl() ? (
          <p className="feedback feedback--warning">
            Configure a URL publicada da API antes de entrar.
          </p>
        ) : null}

        {view === 'login' ? (
          <form className="auth-form" onSubmit={submitLogin}>
            <label>
              Matrícula
              <input
                value={registration}
                onChange={(event) => setRegistration(event.target.value)}
                autoComplete="username"
                inputMode="numeric"
                disabled={submitting}
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={submitting}
              />
            </label>

            {message ? <p className="feedback feedback--success">{message}</p> : null}
            {error ? <p className="feedback feedback--error">{error}</p> : null}

            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitFirstAccess}>
            <div className="first-access-summary">
              Primeiro acesso da matrícula <strong>{firstAccessRegistration}</strong>
            </div>

            <label>
              Nova senha
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </label>

            <label>
              Confirmar nova senha
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </label>

            <p className="password-rule">
              Mínimo de 8 caracteres, com maiúscula, minúscula e número.
            </p>

            {error ? <p className="feedback feedback--error">{error}</p> : null}

            <div className="auth-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setView('login')
                  setChangeToken('')
                  setError('')
                }}
              >
                Voltar
              </button>

              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? 'Salvando…' : 'Definir nova senha'}
              </button>
            </div>
          </form>
        )}

        <footer className="auth-footer">
          <span>Aplicativo {APP_RELEASE_VERSION} · API compatível {API_COMPATIBLE_RELEASE}</span>
          <button
            type="button"
            onClick={() => setShowConnection((current) => !current)}
          >
            {showConnection ? 'Ocultar configuração' : 'Configurar conexão'}
          </button>
        </footer>

        {showConnection ? (
          <ApiConnectionPanel
            compact
            onSaved={() => {
              setShowConnection(false)
              setMessage('Conexão validada. Informe suas credenciais.')
            }}
          />
        ) : null}
      </section>
    </main>
  )
}

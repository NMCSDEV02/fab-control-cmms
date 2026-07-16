import { useEffect, useState, type FormEvent } from 'react'
import { getApiUrl } from '../services/api/config'
import { getSystemHealth } from '../services/api/operator'
import {
  consumeAuthenticationNotice,
  hasCompletedStartup,
  markStartupCompleted,
} from '../services/auth/session'

export interface PreviewAuthenticationOptions {
  expiresInMs?: number
}

export interface LoginPageProps {
  onPreviewAuthenticated: (
    registration: string,
    options?: PreviewAuthenticationOptions,
  ) => void
}

type LoginView =
  | 'startup'
  | 'login'
  | 'recovery'
  | 'recovery-confirmation'
  | 'first-access'
  | 'locked'
  | 'connection-error'

type StartupState = 'checking' | 'online' | 'offline' | 'local'

const PREVIEW_EXPIRATION_TEST_MS = 6_000

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function passwordMeetsPreviewRules(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  )
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
      <path d="M9.9 4.3A10.7 10.7 0 0 1 12 4c5.5 0 9 5.2 9 5.2a15.9 15.9 0 0 1-2.4 2.8" />
      <path d="M6.6 6.6A16.5 16.5 0 0 0 3 9.2S6.5 14.4 12 14.4c1 0 2-.2 2.8-.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12s3.5-5.2 9-5.2 9 5.2 9 5.2-3.5 5.2-9 5.2S3 12 3 12Z" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  )
}

export function LoginPage({ onPreviewAuthenticated }: LoginPageProps) {
  const [view, setView] = useState<LoginView>(
    () => hasCompletedStartup() ? 'login' : 'startup',
  )
  const [startupLabel, setStartupLabel] = useState('Carregando o sistema…')
  const [startupState, setStartupState] = useState<StartupState>('checking')
  const [registration, setRegistration] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryRegistration, setRecoveryRegistration] = useState('')
  const [recoveryRequestId, setRecoveryRequestId] = useState('')
  const [firstAccessRegistration, setFirstAccessRegistration] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showNewPasswordConfirmation, setShowNewPasswordConfirmation] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(() => {
    return consumeAuthenticationNotice() === 'session-expired'
      ? 'Sua sessão expirou. Entre novamente para continuar.'
      : ''
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function prepareSystem() {
      if (hasCompletedStartup()) {
        setView('login')
        return
      }

      setStartupLabel('Preparando a interface…')
      await wait(360)
      if (!active) return

      setStartupLabel('Verificando a configuração local…')
      await wait(360)
      if (!active) return

      const apiConfigured = Boolean(getApiUrl())
      if (!apiConfigured) {
        setStartupState('local')
        setStartupLabel('Ambiente local preparado')
        await wait(520)
        if (active) {
          markStartupCompleted()
          setView('login')
        }
        return
      }

      setStartupLabel('Conferindo a conexão com a API…')
      const abortTimer = window.setTimeout(() => controller.abort(), 1_600)

      try {
        await getSystemHealth(controller.signal)
        if (!active) return
        setStartupState('online')
        setStartupLabel('Sincronização inicial concluída')
      } catch {
        if (!active) return
        setStartupState('offline')
        setStartupLabel('Modo de acesso preparado')
      } finally {
        window.clearTimeout(abortTimer)
      }

      await wait(520)
      if (active) {
        markStartupCompleted()
        setView('login')
      }
    }

    void prepareSystem()

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  function clearFeedback() {
    setError('')
    setMessage('')
  }

  function returnToLogin(messageText = '') {
    setView('login')
    setPassword('')
    setNewPassword('')
    setNewPasswordConfirmation('')
    setError('')
    setMessage(messageText)
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()

    const normalizedRegistration = registration.trim()
    if (!normalizedRegistration || !password) {
      setError('Informe a matrícula e a senha para continuar.')
      return
    }

    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)

      const scenario = `${normalizedRegistration}:${password}`.toUpperCase()

      if (scenario.includes('INVALIDA') || scenario.includes('INVALIDO')) {
        setError('Matrícula ou senha inválida. Verifique os dados informados.')
        return
      }

      if (scenario.includes('BLOQUEADO')) {
        setView('locked')
        return
      }

      if (scenario.includes('OFFLINE')) {
        setView('connection-error')
        return
      }

      if (scenario.includes('PRIMEIRO')) {
        setFirstAccessRegistration(normalizedRegistration)
        setNewPassword('')
        setNewPasswordConfirmation('')
        setView('first-access')
        return
      }

      if (scenario.includes('EXPIRAR')) {
        onPreviewAuthenticated(normalizedRegistration, {
          expiresInMs: PREVIEW_EXPIRATION_TEST_MS,
        })
        return
      }

      onPreviewAuthenticated(normalizedRegistration)
    }, 450)
  }

  function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()

    const normalizedRegistration = recoveryRegistration.trim()
    if (!normalizedRegistration) {
      setError('Informe sua matrícula para solicitar a recuperação.')
      return
    }

    const requestId = `REC-${Date.now().toString(36).toUpperCase()}`
    setRecoveryRegistration(normalizedRegistration)
    setRecoveryRequestId(requestId)
    setView('recovery-confirmation')
  }

  function submitFirstAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()

    if (!passwordMeetsPreviewRules(newPassword)) {
      setError(
        'A nova senha deve ter ao menos 8 caracteres, com letra maiúscula, minúscula e número.',
      )
      return
    }

    if (newPassword !== newPasswordConfirmation) {
      setError('A confirmação não corresponde à nova senha.')
      return
    }

    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      setRegistration(firstAccessRegistration)
      returnToLogin('Nova senha definida para homologação. Entre novamente para continuar.')
    }, 450)
  }

  if (view === 'startup') {
    return (
      <main className="auth-shell auth-shell--startup">
        <section className="auth-startup" aria-live="polite" aria-busy="true">
          <span className="auth-brand__mark auth-brand__mark--startup" aria-hidden="true">FC</span>
          <div className="auth-startup__spinner" aria-hidden="true" />
          <h1>FAB Control</h1>
          <p>{startupLabel}</p>
          <div className="auth-startup__progress" aria-hidden="true">
            <span />
          </div>
          <small>
            {startupState === 'online'
              ? 'API disponível'
              : startupState === 'offline'
                ? 'A conexão será retomada após o acesso'
                : startupState === 'local'
                  ? 'Configuração técnica será concluída na integração'
                  : 'Inicializando recursos essenciais'}
          </small>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">FC</span>
          <div>
            <span className="auth-brand__eyebrow">Operação industrial</span>
            <h1 id="auth-title">FAB Control</h1>
          </div>
        </header>

        {view === 'login' && (
          <>
            <div className="auth-intro">
              <span className="auth-intro__kicker">Acesso do operador</span>
              <h2>Inicie sua sessão</h2>
              <p>Acesse as rotinas, checklists e registros do seu turno.</p>
            </div>

            <form className="auth-form" onSubmit={submitLogin} noValidate>
              <label className="auth-field">
                <span>Matrícula</span>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  value={registration}
                  onChange={(event) => setRegistration(event.target.value)}
                  placeholder="Digite sua matrícula"
                  disabled={submitting}
                />
              </label>

              <label className="auth-field">
                <span>Senha</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  disabled={submitting}
                />
              </label>

              {error && <p className="auth-feedback auth-feedback--error" role="alert">{error}</p>}
              {message && <p className="auth-feedback auth-feedback--warning" role="status">{message}</p>}

              <button className="auth-primary-button" type="submit" disabled={submitting}>
                {submitting ? 'Validando acesso…' : 'Entrar'}
              </button>

              <button
                className="auth-link-button"
                type="button"
                onClick={() => {
                  setView('recovery')
                  clearFeedback()
                }}
                disabled={submitting}
              >
                Esqueci minha senha
              </button>
            </form>
          </>
        )}

        {view === 'recovery' && (
          <>
            <div className="auth-intro">
              <span className="auth-intro__kicker">Suporte de acesso</span>
              <h2>Recuperar acesso</h2>
              <p>Informe sua matrícula para solicitar uma nova senha ao administrador.</p>
            </div>

            <form className="auth-form" onSubmit={submitRecovery} noValidate>
              <label className="auth-field">
                <span>Matrícula</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={recoveryRegistration}
                  onChange={(event) => setRecoveryRegistration(event.target.value)}
                  placeholder="Digite sua matrícula"
                />
              </label>

              {error && <p className="auth-feedback auth-feedback--error" role="alert">{error}</p>}
              {message && <p className="auth-feedback auth-feedback--success" role="status">{message}</p>}

              <button className="auth-primary-button" type="submit">
                Solicitar nova senha
              </button>

              <button
                className="auth-link-button"
                type="button"
                onClick={() => returnToLogin()}
              >
                Voltar para o login
              </button>
            </form>
          </>
        )}

        {view === 'recovery-confirmation' && (
          <section className="auth-state" aria-live="polite">
            <span className="auth-state__icon auth-state__icon--success" aria-hidden="true">✓</span>
            <span className="auth-intro__kicker">Recuperação de acesso</span>
            <h2>Solicitação preparada</h2>
            <p>
              A matrícula foi validada na interface e está pronta para ser enviada ao administrador
              quando a integração da API for ativada.
            </p>

            <div className="auth-recovery-summary">
              <div>
                <span>Matrícula</span>
                <strong>{recoveryRegistration}</strong>
              </div>
              <div>
                <span>Referência local</span>
                <strong>{recoveryRequestId}</strong>
              </div>
              <div>
                <span>Status atual</span>
                <strong>Pendente de integração</strong>
              </div>
            </div>

            <div className="auth-state__note auth-state__note--neutral">
              Nenhuma mensagem foi enviada neste ambiente de homologação.
            </div>

            <button
              className="auth-primary-button"
              type="button"
              onClick={() => returnToLogin('Solicitação local registrada para homologação.')}
            >
              Voltar para o login
            </button>
          </section>
        )}

        {view === 'first-access' && (
          <>
            <div className="auth-intro">
              <span className="auth-intro__kicker">Primeiro acesso</span>
              <h2>Crie sua nova senha</h2>
              <p>A senha temporária deve ser substituída antes de acessar o aplicativo.</p>
            </div>

            <form className="auth-form" onSubmit={submitFirstAccess} noValidate>
              <div className="auth-account-reference">
                <span>Matrícula</span>
                <strong>{firstAccessRegistration}</strong>
              </div>

              <label className="auth-field">
                <span>Nova senha</span>
                <div className="auth-password-input">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Crie uma senha segura"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNewPassword((visible) => !visible)}
                    aria-label={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                    title={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                    disabled={submitting}
                  >
                    <PasswordVisibilityIcon visible={showNewPassword} />
                  </button>
                </div>
              </label>

              <label className="auth-field">
                <span>Confirmar nova senha</span>
                <div className="auth-password-input">
                  <input
                    type={showNewPasswordConfirmation ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPasswordConfirmation}
                    onChange={(event) => setNewPasswordConfirmation(event.target.value)}
                    placeholder="Repita a nova senha"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNewPasswordConfirmation((visible) => !visible)}
                    aria-label={
                      showNewPasswordConfirmation
                        ? 'Ocultar confirmação da senha'
                        : 'Mostrar confirmação da senha'
                    }
                    title={
                      showNewPasswordConfirmation
                        ? 'Ocultar confirmação da senha'
                        : 'Mostrar confirmação da senha'
                    }
                    disabled={submitting}
                  >
                    <PasswordVisibilityIcon visible={showNewPasswordConfirmation} />
                  </button>
                </div>
              </label>

              <div className="auth-password-rules">
                <strong>Requisitos mínimos</strong>
                <span>8 caracteres · letra maiúscula · letra minúscula · número</span>
              </div>

              {error && <p className="auth-feedback auth-feedback--error" role="alert">{error}</p>}

              <button className="auth-primary-button" type="submit" disabled={submitting}>
                {submitting ? 'Definindo senha…' : 'Definir nova senha'}
              </button>

              <button
                className="auth-link-button"
                type="button"
                onClick={() => returnToLogin()}
                disabled={submitting}
              >
                Cancelar
              </button>
            </form>
          </>
        )}

        {view === 'locked' && (
          <section className="auth-state" aria-live="polite">
            <span className="auth-state__icon auth-state__icon--error" aria-hidden="true">!</span>
            <span className="auth-intro__kicker">Acesso bloqueado</span>
            <h2>Conta temporariamente bloqueada</h2>
            <p>
              O acesso foi bloqueado após tentativas inválidas. Solicite a liberação ao administrador.
            </p>
            <div className="auth-state__note">
              A recuperação automática não desbloqueia uma conta protegida.
            </div>
            <button className="auth-primary-button" type="button" onClick={() => returnToLogin()}>
              Voltar para o login
            </button>
          </section>
        )}

        {view === 'connection-error' && (
          <section className="auth-state" aria-live="polite">
            <span className="auth-state__icon" aria-hidden="true">↻</span>
            <span className="auth-intro__kicker">Falha de conexão</span>
            <h2>Não foi possível validar o acesso</h2>
            <p>
              Verifique a rede do dispositivo e tente novamente. Nenhuma credencial foi alterada.
            </p>
            <div className="auth-state__actions">
              <button className="auth-primary-button" type="button" onClick={() => returnToLogin()}>
                Tentar novamente
              </button>
              <button
                className="auth-link-button"
                type="button"
                onClick={() => {
                  setView('recovery')
                  clearFeedback()
                }}
              >
                Solicitar suporte de acesso
              </button>
            </div>
          </section>
        )}

        <footer className="auth-footer">
          Acesso exclusivo para profissionais cadastrados.
        </footer>
      </section>
    </main>
  )
}

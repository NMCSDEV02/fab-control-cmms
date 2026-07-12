import { useEffect, useState } from 'react'
import {
  getApiUrl,
  getOperatorToken,
  saveApiUrl,
  saveOperatorToken,
} from '../services/api/config'

export interface SettingsPageProps {
  apiOnline: boolean
  apiVersion: string
  onConfigurationSaved: () => void
  onTestConnection: () => Promise<void>
}

export function SettingsPage({
  apiOnline,
  apiVersion,
  onConfigurationSaved,
  onTestConnection,
}: SettingsPageProps) {
  const [apiUrl, setApiUrl] = useState('')
  const [token, setToken] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setApiUrl(getApiUrl())
    setToken(getOperatorToken())
  }, [])

  function save() {
    saveApiUrl(apiUrl)
    saveOperatorToken(token)
    onConfigurationSaved()
  }

  async function test() {
    saveApiUrl(apiUrl)
    saveOperatorToken(token)
    setTesting(true)
    try {
      await onTestConnection()
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="screen settings-page">
      <header className="screen-heading">
        <span>Configurações</span>
        <h1>Integração do operador</h1>
        <p>Configuração local usada no ambiente de desenvolvimento.</p>
      </header>

      <article className="settings-form-card">
        <label>
          <span>URL publicada do Apps Script</span>
          <input
            type="url"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            autoComplete="off"
          />
        </label>

        <label>
          <span>Token do operador</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="FAB-..."
            autoComplete="off"
          />
          <small>O token fica somente nesta sessão do navegador e não vai para o GitHub.</small>
        </label>

        <div className="settings-actions">
          <button type="button" className="secondary-button" onClick={test} disabled={testing}>
            {testing ? 'Testando…' : 'Testar conexão'}
          </button>
          <button type="button" className="primary-button" onClick={save}>
            Salvar configuração
          </button>
        </div>
      </article>

      <article className="settings-card">
        <div>
          <strong>API</strong>
          <p>{apiVersion ? `Versão ${apiVersion}` : 'Versão ainda não identificada.'}</p>
        </div>
        <span className={apiOnline ? 'status-chip status-chip--online' : 'status-chip'}>
          {apiOnline ? 'Online' : 'Offline'}
        </span>
      </article>

      <article className="settings-card">
        <div>
          <strong>Interface</strong>
          <p>Mockup 17 Definitivo · integração real da fila do operador.</p>
        </div>
        <span className="status-chip">Fase 2</span>
      </article>
    </section>
  )
}

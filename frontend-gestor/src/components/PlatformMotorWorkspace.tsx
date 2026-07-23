import { useCallback, useEffect, useMemo, useState } from 'react'
import { APP_RELEASE_VERSION } from '../release'
import type { GestorSession } from '../services/api/auth'
import {
  getAdminCommercialAccess,
  getPlatformMotorCatalog,
} from '../services/api/admin'
import { isGestorAuthenticationError } from '../services/api/gestor'
import type {
  AdminCommercialAccess,
  AdminCommercialFeatureCode,
  PlatformMotorCatalog,
} from '../types/admin'

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

function subscriptionSource(value?: string): string {
  if (value === 'ASSINATURA_DE_PLATAFORMA') return 'Assinatura interna validada'
  if (value === 'COMPATIBILIDADE_1_4_0') return 'Compatibilidade segura'
  return 'Política interna protegida'
}

export function PlatformMotorWorkspace({
  session,
  loggingOut,
  onSessionExpired,
  onLogout,
}: PlatformMotorWorkspaceProps) {
  const [access, setAccess] = useState<AdminCommercialAccess | null>(null)
  const [catalog, setCatalog] = useState<PlatformMotorCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [result, catalogResult] = await Promise.all([
        getAdminCommercialAccess(),
        getPlatformMotorCatalog(),
      ])
      if (!result.acesso_integral || !result.manutencao.aberta) {
        onSessionExpired()
        return
      }
      setAccess(result)
      setCatalog(catalogResult)
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
  const policyCoverage = useMemo(() => {
    if (!catalog) return []
    const featureNames = new Map(
      catalog.recursos.map((feature) => [feature.codigo, feature.nome]),
    )
    const totals = new Map<AdminCommercialFeatureCode, number>()
    catalog.politicas.regras.forEach((rule) => {
      totals.set(rule.recurso, (totals.get(rule.recurso) ?? 0) + 1)
    })
    return [...totals.entries()]
      .map(([code, total]) => ({
        code,
        name: featureNames.get(code) ?? code,
        total,
      }))
      .sort((left, right) => right.total - left.total)
  }, [catalog])

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

        <section className="platform-motor-catalog">
          <div className="platform-motor-section-heading">
            <div>
              <span className="eyebrow">CATÁLOGO COMERCIAL</span>
              <h2>Recursos por assinatura</h2>
              <p>A visão interna mostra a composição efetiva sem permitir alterações diretas nesta etapa.</p>
            </div>
            <span className="platform-motor-readonly">Somente leitura</span>
          </div>

          <div className="platform-motor-plan-grid">
            {catalog?.planos.map((plan) => (
              <article
                key={plan.codigo}
                className={plan.codigo === catalog.assinatura.plano.codigo ? 'is-current' : ''}
              >
                <header>
                  <div>
                    <span>{plan.codigo}</span>
                    <h3>{plan.nome}</h3>
                  </div>
                  {plan.codigo === catalog.assinatura.plano.codigo ? <b>Atual</b> : null}
                </header>
                <ul>
                  {catalog.recursos.map((feature) => {
                    const enabled = plan.recursos.includes(feature.codigo)
                    return (
                      <li key={feature.codigo} className={enabled ? 'is-enabled' : ''}>
                        <i aria-hidden="true">{enabled ? '✓' : '—'}</i>
                        <span>{feature.nome}</span>
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="platform-motor-governance">
          <div className="platform-motor-section-heading">
            <div>
              <span className="eyebrow">GOVERNANÇA DE ROTAS</span>
              <h2>Cobertura das políticas</h2>
              <p>Ações novas continuam bloqueadas até receberem classificação comercial explícita.</p>
            </div>
          </div>

          <div className="platform-motor-governance-grid">
            <article className="platform-motor-governance-summary">
              <div>
                <span>Regras classificadas</span>
                <strong>{catalog?.politicas.regras.length ?? 0}</strong>
              </div>
              <div>
                <span>Ações do núcleo</span>
                <strong>{catalog?.politicas.acoes_nucleo.length ?? 0}</strong>
              </div>
              <div>
                <span>Política padrão</span>
                <strong>Negar</strong>
              </div>
              <small>{subscriptionSource(catalog?.assinatura.origem)}</small>
            </article>

            <article className="platform-motor-policy-list">
              <header>
                <strong>Distribuição por recurso</strong>
                <span>{policyCoverage.length} grupos cobertos</span>
              </header>
              <ul>
                {policyCoverage.map((item) => (
                  <li key={item.code}>
                    <span>{item.name}</span>
                    <b>{item.total} política(s)</b>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <footer className="platform-motor-footer">
          <span>Versão {APP_RELEASE_VERSION}</span>
          <span>Janela {access?.manutencao.janela_id || 'protegida'}</span>
        </footer>
      </section>
    </main>
  )
}

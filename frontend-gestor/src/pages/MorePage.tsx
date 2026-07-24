import type { GestorSection } from '../components/AppNavigation'
import { ApiConnectionPanel } from '../components/ApiConnectionPanel'
import { AssetIcon, SettingsIcon, UsersIcon, ValidationIcon } from '../components/Icons'
import { API_COMPATIBLE_RELEASE, APP_RELEASE_VERSION } from '../release'
import type { GestorSession } from '../services/api/auth'

export interface MorePageProps {
  session: GestorSession
  onNavigate: (section: GestorSection) => void
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function MorePage({ session, onNavigate }: MorePageProps) {
  const isAdmin = session.user.perfil.trim().toUpperCase() === 'ADMIN'
  return (
    <main className="content more-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">GESTÃO E CONFIGURAÇÃO</span>
          <h1>Mais recursos</h1>
          <p>Conexão, identidade da sessão e atalhos do ambiente do gestor.</p>
        </div>
      </section>

      <section className="more-grid">
        <button className="more-card" type="button" onClick={() => onNavigate('validations')}>
          <span className="more-card__icon"><ValidationIcon /></span>
          <span><strong>Central de trabalho</strong><small>Solicitações, execuções, checklists, ocorrências e paradas em uma única entrada.</small></span>
        </button>
        <button className="more-card" type="button" onClick={() => onNavigate('assets')}>
          <span className="more-card__icon"><AssetIcon /></span>
          <span><strong>Biblioteca de ativos</strong><small>Consulta segura de equipamentos e componentes.</small></span>
        </button>
        {isAdmin ? (
          <button className="more-card" type="button" onClick={() => onNavigate('admin')}>
            <span className="more-card__icon"><UsersIcon /></span>
            <span><strong>Usuários e permissões</strong><small>Perfis, sessões, recuperação de acesso e matriz de capacidades.</small></span>
          </button>
        ) : null}
        <article className="more-card more-card--static">
          <span className="more-card__icon"><SettingsIcon /></span>
          <span><strong>Governança técnica</strong><small>Roteamento por área e cargo, assinatura interna, SLA, análise de ocorrências e OEE baseado em apontamentos reais.</small></span>
        </article>
      </section>

      <section className="more-layout">
        <ApiConnectionPanel />

        <section className="session-panel">
          <div className="connection-panel__heading">
            <div><span className="eyebrow">SESSÃO ATUAL</span><h2>Identidade autenticada</h2></div>
            <span className="status-chip status-chip--success">Ativa</span>
          </div>
          <dl>
            <div><dt>Nome</dt><dd>{session.user.nome}</dd></div>
            <div><dt>Matrícula</dt><dd>{session.user.matricula}</dd></div>
            <div><dt>Perfil</dt><dd>{session.user.perfil}</dd></div>
            <div><dt>Início</dt><dd>{formatDate(session.startedAt)}</dd></div>
            <div><dt>Expiração</dt><dd>{formatDate(new Date(session.expiresAt).toISOString())}</dd></div>
            <div><dt>Aplicativo</dt><dd>{APP_RELEASE_VERSION}</dd></div>
            <div><dt>Contrato da API</dt><dd>{API_COMPATIBLE_RELEASE}</dd></div>
          </dl>
        </section>
      </section>
    </main>
  )
}

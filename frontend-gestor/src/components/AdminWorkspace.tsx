import { APP_RELEASE_VERSION } from '../release'
import type { GestorSession } from '../services/api/auth'
import { AdminPage, type AdminModule } from '../pages/AdminPage'
import { HomeIcon, SettingsIcon, ShieldIcon, UsersIcon } from './Icons'

interface AdminWorkspaceProps {
  session: GestorSession
  activeModule: AdminModule
  loggingOut: boolean
  onModuleChange: (module: AdminModule) => void
  onSessionExpired: () => void
  onLogout: () => void
}

const MODULES: Array<{
  id: AdminModule
  label: string
  description: string
  Icon: typeof HomeIcon
}> = [
  { id: 'overview', label: 'Visão geral', description: 'Estado do sistema', Icon: HomeIcon },
  { id: 'configuration', label: 'Motor', description: 'Configuração versionada', Icon: SettingsIcon },
  { id: 'users', label: 'Usuários', description: 'Identidades e acessos', Icon: UsersIcon },
  { id: 'permissions', label: 'Permissões', description: 'Matriz de capacidades', Icon: ShieldIcon },
]

const MODULE_HEADINGS: Record<AdminModule, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: 'CENTRO DE COMANDO',
    title: 'Visão geral administrativa',
    subtitle: 'Controle a configuração, identidades e políticas que governam toda a operação.',
  },
  configuration: {
    eyebrow: 'GOVERNANÇA DO RUNTIME',
    title: 'Motor de Configuração',
    subtitle: 'Prepare, valide, publique e restaure configurações sem editar o núcleo da aplicação.',
  },
  users: {
    eyebrow: 'IDENTIDADES',
    title: 'Diretório de usuários',
    subtitle: 'Administre acessos, áreas técnicas, sessões e recuperação de credenciais.',
  },
  permissions: {
    eyebrow: 'CONTROLE DE ACESSO',
    title: 'Matriz de capacidades',
    subtitle: 'Defina o que cada perfil pode executar sem comprometer as regras protegidas.',
  },
}

export function AdminWorkspace({
  session,
  activeModule,
  loggingOut,
  onModuleChange,
  onSessionExpired,
  onLogout,
}: AdminWorkspaceProps) {
  const heading = MODULE_HEADINGS[activeModule]

  return (
    <div className="admin-command-shell">
      <section className="admin-command-mobile-block">
        <ShieldIcon />
        <h1>Command Workspace</h1>
        <p>O ambiente administrativo é exclusivo para computador. Use uma tela com pelo menos 901 px de largura.</p>
        <button type="button" disabled={loggingOut} onClick={onLogout}>{loggingOut ? 'Saindo…' : 'Sair'}</button>
      </section>

      <aside className="admin-command-sidebar">
        <div className="admin-command-brand">
          <span aria-hidden="true">FC</span>
          <div><strong>Fab Control</strong><small>Command Workspace</small></div>
        </div>

        <div className="admin-command-environment">
          <i aria-hidden="true" />
          <span><strong>Sistema conectado</strong><small>Release controlada v{APP_RELEASE_VERSION}</small></span>
        </div>

        <nav aria-label="Módulos administrativos">
          <span className="admin-command-nav-label">ADMINISTRAÇÃO</span>
          {MODULES.map(({ id, label, description, Icon }) => (
            <button
              key={id}
              type="button"
              className={activeModule === id ? 'is-active' : ''}
              aria-current={activeModule === id ? 'page' : undefined}
              onClick={() => onModuleChange(id)}
            >
              <Icon />
              <span><strong>{label}</strong><small>{description}</small></span>
            </button>
          ))}
        </nav>

        <div className="admin-command-sidebar__footer">
          <ShieldIcon />
          <span><strong>Núcleo protegido</strong><small>Alterações críticas exigem validação e versão imutável.</small></span>
        </div>
      </aside>

      <section className="admin-command-stage">
        <header className="admin-command-topbar">
          <div className="admin-command-breadcrumb">
            <span>Workspace</span><i>/</i><strong>{MODULES.find((item) => item.id === activeModule)?.label}</strong>
          </div>
          <div className="admin-command-user">
            <span className="connection-chip"><i aria-hidden="true" />Online</span>
            <span className="admin-command-avatar">{session.user.nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
            <span><strong>{session.user.nome}</strong><small>Administrador</small></span>
            <button type="button" disabled={loggingOut} onClick={onLogout}>{loggingOut ? 'Saindo…' : 'Sair'}</button>
          </div>
        </header>

        <main className="admin-command-main">
          <header className="admin-command-heading">
            <span>{heading.eyebrow}</span>
            <h1>{heading.title}</h1>
            <p>{heading.subtitle}</p>
          </header>
          <AdminPage
            session={session}
            onSessionExpired={onSessionExpired}
            activeModule={activeModule}
            embedded
            onModuleChange={onModuleChange}
          />
        </main>
      </section>
    </div>
  )
}

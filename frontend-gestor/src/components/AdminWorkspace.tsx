import { APP_RELEASE_VERSION } from '../release'
import type { GestorSession } from '../services/api/auth'
import { AdminPage, type AdminModule } from '../pages/AdminPage'
import { AssetIcon, CheckIcon, HomeIcon, SettingsIcon, ShieldIcon, UsersIcon, WrenchIcon } from './Icons'

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
  { id: 'overview', label: 'Dashboard técnico', description: 'Visão consolidada', Icon: HomeIcon },
  { id: 'structure', label: 'Estrutura fabril', description: 'Plantas, setores e linhas', Icon: AssetIcon },
  { id: 'assets', label: 'Cadastro técnico', description: 'Ativos e componentes', Icon: WrenchIcon },
  { id: 'checklists', label: 'Construtor de checklist', description: 'Modelos e roteamento', Icon: CheckIcon },
  { id: 'maintenance', label: 'Planos programados', description: 'Gatilhos e recorrências', Icon: SettingsIcon },
  { id: 'inventory', label: 'Materiais e peças', description: 'Estoque técnico', Icon: AssetIcon },
  { id: 'workforce', label: 'Áreas e cargos', description: 'Filtros e assinaturas', Icon: UsersIcon },
  { id: 'operations', label: 'Intervenções e OS', description: 'Criar, validar e liberar', Icon: WrenchIcon },
  { id: 'analytics', label: 'Indicadores e relatórios', description: 'KPI e exportação', Icon: HomeIcon },
  { id: 'imports', label: 'Implantação e importação', description: 'Modelos de planilhas', Icon: SettingsIcon },
  { id: 'configuration', label: 'Motor de configuração', description: 'Runtime versionado', Icon: SettingsIcon },
  { id: 'users', label: 'Usuários e perfis', description: 'Identidades e acessos', Icon: UsersIcon },
  { id: 'permissions', label: 'Segurança e continuidade', description: 'Matriz de capacidades', Icon: ShieldIcon },
]

const MODULE_HEADINGS: Record<AdminModule, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: 'CENTRO DE COMANDO',
    title: 'Visão geral administrativa',
    subtitle: 'Controle a configuração, identidades e políticas que governam toda a operação.',
  },
  structure: {
    eyebrow: 'ESTRUTURA ORGANIZACIONAL',
    title: 'Plantas, setores e linhas',
    subtitle: 'Cadastre a hierarquia fabril com seleção assistida e vínculos validados pelo servidor.',
  },
  assets: {
    eyebrow: 'CADASTRO TÉCNICO',
    title: 'Equipamentos e componentes',
    subtitle: 'Organize TAGs, criticidade, saúde e componentes por equipamento sem repetir informações.',
  },
  checklists: {
    eyebrow: 'AUTORIA E GOVERNANÇA',
    title: 'Construtor de checklist',
    subtitle: 'Monte rotinas dinâmicas e envie ao filtro técnico antes da liberação ao Operador.',
  },
  maintenance: {
    eyebrow: 'PROGRAMAÇÃO',
    title: 'Planos de manutenção',
    subtitle: 'Defina gatilhos, recorrência, bloqueio e parada. Novos planos permanecem em rascunho.',
  },
  inventory: {
    eyebrow: 'ALMOXARIFADO TÉCNICO',
    title: 'Materiais e peças',
    subtitle: 'Cadastre itens de consumo e acompanhe saldo e estoque mínimo para as execuções.',
  },
  workforce: {
    eyebrow: 'ESTRUTURA TÉCNICA',
    title: 'Áreas e cargos especialistas',
    subtitle: 'Defina os destinos do fluxo, os cargos de cada área e quem pode assinar uma liberação.',
  },
  operations: {
    eyebrow: 'PLANEJAMENTO OPERACIONAL',
    title: 'Intervenções e ordens de serviço',
    subtitle: 'Crie rascunhos e encaminhe ao filtro técnico; o Operador só recebe a ação depois da liberação.',
  },
  analytics: {
    eyebrow: 'INTELIGÊNCIA OPERACIONAL',
    title: 'Indicadores e relatórios técnicos',
    subtitle: 'Analise MTTR, MTBF, lead time, SLA, disponibilidade e OEE por equipamento e período.',
  },
  imports: {
    eyebrow: 'IMPLANTAÇÃO E GOVERNANÇA DE DADOS',
    title: 'Central de Importação',
    subtitle: 'Baixe modelos, valide vínculos e confirme cadastros, planos e checklists com rollback auditável.',
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

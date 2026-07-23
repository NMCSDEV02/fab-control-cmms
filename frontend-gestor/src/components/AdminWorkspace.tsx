import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { APP_RELEASE_VERSION } from '../release'
import type { GestorSession } from '../services/api/auth'
import { AdminPage, type AdminModule } from '../pages/AdminPage'
import {
  AssetIcon,
  AuditIcon,
  BellIcon,
  CalendarIcon,
  ChartIcon,
  ChecklistIcon,
  DashboardIcon,
  DatabaseIcon,
  DocumentIcon,
  FactoryIcon,
  KeyIcon,
  PackageIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
  UserDirectoryIcon,
  UsersIcon,
  WindowsIcon,
  WrenchIcon,
} from './Icons'

interface AdminWorkspaceProps {
  session: GestorSession
  activeModule: AdminModule
  loggingOut: boolean
  onModuleChange: (module: AdminModule) => void
  onSessionExpired: () => void
  onLogout: () => void
}

interface WorkspaceModule {
  id: AdminModule
  code: string
  label: string
  description: string
  Icon: typeof DashboardIcon
}

interface WorkspaceWindow {
  module: AdminModule
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  minimized: boolean
  maximized: boolean
  layoutHidden: boolean
}

interface DragState {
  module: AdminModule
  offsetX: number
  offsetY: number
}

type WindowLayout = 'smart' | 'focus' | 'columns' | 'rows' | 'grid' | 'cascade'

const MODULES: WorkspaceModule[] = [
  { id: 'overview', code: 'VG', label: 'Visão geral', description: 'Centro de comando', Icon: DashboardIcon },
  { id: 'structure', code: 'EF', label: 'Estrutura fabril', description: 'Plantas, setores e linhas', Icon: FactoryIcon },
  { id: 'assets', code: 'AT', label: 'Cadastro técnico', description: 'Ativos e componentes', Icon: AssetIcon },
  { id: 'checklists', code: 'CK', label: 'Checklists', description: 'Construtor e roteamento', Icon: ChecklistIcon },
  { id: 'maintenance', code: 'PM', label: 'Programação', description: 'Planos e recorrências', Icon: CalendarIcon },
  { id: 'inventory', code: 'MP', label: 'Materiais e peças', description: 'Estoque técnico', Icon: PackageIcon },
  { id: 'workforce', code: 'EQ', label: 'Equipes técnicas', description: 'Áreas, cargos e assinatura', Icon: UsersIcon },
  { id: 'operations', code: 'OS', label: 'Intervenções e OS', description: 'Planejar, validar e liberar', Icon: WrenchIcon },
  { id: 'analytics', code: 'BI', label: 'Indicadores', description: 'OEE, horas, custos e SLA', Icon: ChartIcon },
  { id: 'documents', code: 'DT', label: 'Documentos', description: 'Arquivos e revisões', Icon: DocumentIcon },
  { id: 'imports', code: 'IM', label: 'Importar planilhas', description: 'Modelos e implantação', Icon: UploadIcon },
  { id: 'configuration', code: 'MC', label: 'Motor', description: 'Configuração versionada', Icon: SettingsIcon },
  { id: 'users', code: 'US', label: 'Usuários', description: 'Identidades e acessos', Icon: UserDirectoryIcon },
  { id: 'permissions', code: 'PE', label: 'Permissões', description: 'Matriz de capacidades', Icon: KeyIcon },
  { id: 'governance', code: 'AU', label: 'Auditoria', description: 'Integridade e trilha', Icon: AuditIcon },
  { id: 'backup', code: 'BK', label: 'Continuidade', description: 'Backup e restauração', Icon: DatabaseIcon },
]

const MODULE_HEADINGS: Record<AdminModule, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: 'CENTRO DE COMANDO',
    title: 'Visão geral administrativa',
    subtitle: 'Abra módulos em paralelo e acompanhe a operação sem perder o contexto.',
  },
  structure: {
    eyebrow: 'ESTRUTURA ORGANIZACIONAL',
    title: 'Plantas, setores e linhas',
    subtitle: 'Cadastros assistidos com vínculos encadeados e validação no servidor.',
  },
  assets: {
    eyebrow: 'CADASTRO TÉCNICO',
    title: 'Equipamentos e componentes',
    subtitle: 'TAGs, criticidade, localização e componentes com seleções guiadas.',
  },
  checklists: {
    eyebrow: 'AUTORIA E GOVERNANÇA',
    title: 'Construtor de checklist',
    subtitle: 'Crie rotinas técnicas, assinaturas e destinos antes da liberação ao Gestor.',
  },
  maintenance: {
    eyebrow: 'PROGRAMAÇÃO',
    title: 'Planos de manutenção',
    subtitle: 'Programe preventivas, periodicidade, ativo, responsável e próxima execução.',
  },
  inventory: {
    eyebrow: 'ALMOXARIFADO TÉCNICO',
    title: 'Materiais e peças',
    subtitle: 'Controle itens, unidades, saldo mínimo, custo e aplicação por ativo.',
  },
  workforce: {
    eyebrow: 'ESTRUTURA TÉCNICA',
    title: 'Áreas, cargos e responsáveis',
    subtitle: 'Defina equipes, especialidades, filtros técnicos e poder de assinatura.',
  },
  operations: {
    eyebrow: 'PLANEJAMENTO OPERACIONAL',
    title: 'Intervenções e ordens de serviço',
    subtitle: 'Planeje, encaminhe ao filtro técnico e libere a execução ao Operador.',
  },
  analytics: {
    eyebrow: 'INTELIGÊNCIA OPERACIONAL',
    title: 'Indicadores e relatórios',
    subtitle: 'OEE, MTTR, MTBF, horas, atendimentos, custos, lead time e SLA.',
  },
  documents: {
    eyebrow: 'GESTÃO DOCUMENTAL',
    title: 'Documentos técnicos',
    subtitle: 'Manuais, diagramas, laudos e certificados com revisão e validade.',
  },
  governance: {
    eyebrow: 'AUDITORIA E OBSERVABILIDADE',
    title: 'Integridade e trilha administrativa',
    subtitle: 'Monitore a base e investigue alterações com dados sensíveis protegidos.',
  },
  backup: {
    eyebrow: 'CONTINUIDADE OPERACIONAL',
    title: 'Backup e recuperação',
    subtitle: 'Crie pontos integrais e restaure dados operacionais com dupla confirmação.',
  },
  imports: {
    eyebrow: 'GOVERNANÇA DE DADOS',
    title: 'Central de importação',
    subtitle: 'Suba modelos, valide vínculos e confirme lotes com rollback auditável.',
  },
  configuration: {
    eyebrow: 'NÚCLEO PROTEGIDO',
    title: 'Motor de configuração',
    subtitle: 'Prepare, valide, publique e restaure versões sem editar o runtime ativo.',
  },
  users: {
    eyebrow: 'IDENTIDADES',
    title: 'Diretório de usuários',
    subtitle: 'Administre acessos, área, cargo, sessões e recuperação de credenciais.',
  },
  permissions: {
    eyebrow: 'CONTROLE DE ACESSO',
    title: 'Matriz de capacidades',
    subtitle: 'Defina permissões por perfil sem comprometer as barreiras protegidas.',
  },
}

function getModule(module: AdminModule): WorkspaceModule {
  return MODULES.find((item) => item.id === module) ?? MODULES[0]
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
}

function createWindow(module: AdminModule, index: number, zIndex: number): WorkspaceWindow {
  const availableWidth = Math.max(760, window.innerWidth - 50)
  const availableHeight = Math.max(520, window.innerHeight - 73)
  const offset = Math.min(index, 5) * 26
  return {
    module,
    x: 18 + offset,
    y: 18 + offset,
    width: Math.min(1180, availableWidth - 42),
    height: Math.min(760, availableHeight - 42),
    zIndex,
    minimized: false,
    maximized: true,
    layoutHidden: false,
  }
}

export function AdminWorkspace({
  session,
  activeModule,
  loggingOut,
  onModuleChange,
  onSessionExpired,
  onLogout,
}: AdminWorkspaceProps) {
  const zIndexRef = useRef(2)
  const lastActiveModuleRef = useRef(activeModule)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const windowsRef = useRef<WorkspaceWindow[]>([])
  const dragRef = useRef<DragState | null>(null)
  const paletteInputRef = useRef<HTMLInputElement | null>(null)
  const [windows, setWindows] = useState<WorkspaceWindow[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [windowManagerOpen, setWindowManagerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const [windowLayout, setWindowLayout] = useState<WindowLayout>('smart')
  const [autoArrange, setAutoArrange] = useState(false)
  const [cacheBaseMb, setCacheBaseMb] = useState(10)
  const [cacheMessage, setCacheMessage] = useState('Uso normal. Nenhuma ação necessária.')
  windowsRef.current = windows

  const filteredModules = useMemo(() => {
    const term = paletteQuery.trim().toLocaleLowerCase('pt-BR')
    if (!term) return MODULES
    return MODULES.filter((module) => (
      `${module.code} ${module.label} ${module.description}`.toLocaleLowerCase('pt-BR').includes(term)
    ))
  }, [paletteQuery])

  const openModule = useCallback((module: AdminModule, notify = true) => {
    const nextZIndex = ++zIndexRef.current
    setWindows((current) => {
      const existing = current.find((item) => item.module === module)
      if (existing) {
        return current.map((item) => (
          item.module === module
            ? { ...item, minimized: false, layoutHidden: false, zIndex: nextZIndex }
            : item
        ))
      }
      return [...current, createWindow(module, current.length, nextZIndex)]
    })
    setPaletteOpen(false)
    setWindowManagerOpen(false)
    setProfileOpen(false)
    if (notify) onModuleChange(module)
  }, [onModuleChange])

  useEffect(() => {
    if (lastActiveModuleRef.current === activeModule) return
    lastActiveModuleRef.current = activeModule
    if (!windowsRef.current.some((item) => item.module === activeModule)) {
      openModule(activeModule, false)
    }
  }, [activeModule, openModule])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('pt-BR') === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setWindowManagerOpen(false)
        setHelpOpen(false)
        setProfileOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!paletteOpen) return
    const timeout = window.setTimeout(() => paletteInputRef.current?.focus(), 20)
    return () => window.clearTimeout(timeout)
  }, [paletteOpen])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current
      const workspace = workspaceRef.current
      if (!drag || !workspace) return
      const bounds = workspace.getBoundingClientRect()
      setWindows((current) => current.map((item) => {
        if (item.module !== drag.module || item.maximized) return item
        const maximumX = Math.max(0, bounds.width - Math.min(item.width, 260))
        const maximumY = Math.max(0, bounds.height - 34)
        return {
          ...item,
          x: Math.max(0, Math.min(maximumX, event.clientX - bounds.left - drag.offsetX)),
          y: Math.max(0, Math.min(maximumY, event.clientY - bounds.top - drag.offsetY)),
        }
      }))
    }

    function handlePointerUp() {
      dragRef.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  function focusWindow(module: AdminModule) {
    const nextZIndex = ++zIndexRef.current
    setWindows((current) => current.map((item) => (
      item.module === module ? { ...item, minimized: false, layoutHidden: false, zIndex: nextZIndex } : item
    )))
    onModuleChange(module)
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, item: WorkspaceWindow) {
    if (item.maximized || (event.target as HTMLElement).closest('button')) return
    const workspace = workspaceRef.current
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    dragRef.current = {
      module: item.module,
      offsetX: event.clientX - bounds.left - item.x,
      offsetY: event.clientY - bounds.top - item.y,
    }
    setDragging(true)
    focusWindow(item.module)
    event.preventDefault()
  }

  function toggleMaximize(module: AdminModule) {
    const nextZIndex = ++zIndexRef.current
    setWindows((current) => current.map((item) => (
      item.module === module
        ? { ...item, minimized: false, maximized: !item.maximized, layoutHidden: false, zIndex: nextZIndex }
        : item
    )))
    onModuleChange(module)
  }

  function minimizeWindow(module: AdminModule) {
    setWindows((current) => current.map((item) => (
      item.module === module ? { ...item, minimized: true, layoutHidden: false } : item
    )))
  }

  function closeWindow(module: AdminModule) {
    setWindows((current) => current.filter((item) => item.module !== module))
  }

  const arrangeWindows = useCallback((layout: WindowLayout) => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    const gap = 10

    setWindows((current) => current.map((item) => {
      const available = current.filter((windowItem) => !windowItem.minimized)
      const focused = [...available].sort((left, right) => right.zIndex - left.zIndex)[0]
      const arranged = layout === 'focus' && focused ? [focused] : available
      const index = arranged.findIndex((visibleItem) => visibleItem.module === item.module)
      if (layout === 'focus' && !item.minimized && item.module !== focused?.module) {
        return { ...item, layoutHidden: true }
      }
      if (index < 0) return item

      if (layout === 'focus') {
        return {
          ...item,
          x: 0,
          y: 0,
          width: bounds.width,
          height: bounds.height,
          maximized: true,
          layoutHidden: false,
          zIndex: ++zIndexRef.current,
        }
      }

      if (layout === 'cascade') {
        return {
          ...item,
          maximized: false,
          layoutHidden: false,
          x: gap + index * 28,
          y: gap + index * 28,
          width: Math.max(320, Math.min(1040, bounds.width - 90)),
          height: Math.max(230, Math.min(700, bounds.height - 90)),
          zIndex: ++zIndexRef.current,
        }
      }

      const count = arranged.length
      const columns = layout === 'columns'
        ? Math.min(2, count)
        : layout === 'rows'
          ? Math.ceil(count / Math.min(2, count))
          : layout === 'grid'
            ? Math.ceil(Math.sqrt(count))
            : count === 1
              ? 1
              : count === 2
                ? 2
                : Math.ceil(Math.sqrt(count))
      const rows = Math.ceil(count / columns)
      const column = index % columns
      const row = Math.floor(index / columns)
      const width = Math.max(320, (bounds.width - gap * (columns + 1)) / columns)
      const height = Math.max(230, (bounds.height - gap * (rows + 1)) / rows)
      return {
        ...item,
        maximized: layout === 'smart' && count === 1,
        layoutHidden: false,
        x: gap + column * (width + gap),
        y: gap + row * (height + gap),
        width,
        height,
        zIndex: ++zIndexRef.current,
      }
    }))
    setWindowLayout(layout)
    setWindowManagerOpen(false)
  }, [])

  useEffect(() => {
    if (!autoArrange || windows.length < 2) return
    arrangeWindows(windowLayout)
  }, [arrangeWindows, autoArrange, windowLayout, windows.length])

  const visibleWindowCount = windows.filter((item) => !item.minimized && !item.layoutHidden).length
  const memoryMb = cacheBaseMb + windows.length * 7
  const memoryPercent = Math.min(96, Math.max(7, Math.round(memoryMb / 1.15)))
  const layoutLabels: Record<WindowLayout, string> = {
    smart: 'automático',
    focus: 'foco',
    columns: '2 colunas',
    rows: '2 linhas',
    grid: 'grade',
    cascade: 'cascata',
  }

  function optimizeCache() {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('fab_control_workspace_cache_'))
      .forEach((key) => window.localStorage.removeItem(key))
    setCacheBaseMb(8)
    setCacheMessage('Cache temporário limpo. A sessão e os dados do sistema foram preservados.')
  }

  return (
    <div className={`admin-desktop-shell${dragging ? ' is-dragging' : ''}`}>
      <section className="admin-command-mobile-block">
        <ShieldIcon />
        <h1>Command Workspace</h1>
        <p>O ambiente administrativo é exclusivo para computador. Use uma tela com pelo menos 901 px de largura.</p>
        <button type="button" disabled={loggingOut} onClick={onLogout}>{loggingOut ? 'Saindo…' : 'Sair'}</button>
      </section>

      <header className="admin-desktop-topbar">
        <div className="admin-desktop-brand">
          <span aria-hidden="true">TOZ</span>
          <strong>tozzi</strong>
        </div>

        <button className="admin-desktop-command" type="button" onClick={() => setPaletteOpen(true)}>
          <span>Pesquisar módulos e comandos — Ctrl + K</span>
        </button>

        <div className="admin-desktop-top-actions">
          <button type="button" title="Gerenciador de janelas" aria-label="Gerenciador de janelas" onClick={() => setWindowManagerOpen((current) => !current)}><WindowsIcon /></button>
          <button className="admin-notification-button" type="button" title="Avisos operacionais" aria-label="Avisos operacionais" onClick={() => openModule('operations')}><BellIcon /><span>6</span></button>
          <button type="button" title="Ajuda do Workspace" aria-label="Ajuda do Workspace" onClick={() => setHelpOpen(true)}>?</button>
          <button
            className="admin-desktop-avatar"
            type="button"
            aria-label="Abrir menu do perfil"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((current) => !current)}
          >
            {getInitials(session.user.nome)}
          </button>
          {profileOpen ? (
            <aside className="admin-profile-menu" aria-label="Menu do perfil">
              <header><span>{getInitials(session.user.nome)}</span><div><strong>{session.user.nome}</strong><small>Empresa Demonstração</small></div></header>
              <button type="button" onClick={() => openModule('configuration')}>Personalizar sistema</button>
              <button type="button" onClick={() => openModule('configuration')}>Parâmetros técnicos</button>
              <button type="button" onClick={() => openModule('users')}>Meu perfil</button>
              <button type="button" disabled={loggingOut} onClick={onLogout}>{loggingOut ? 'Saindo…' : 'Sair'}</button>
            </aside>
          ) : null}
        </div>
      </header>

      <div className="admin-desktop-content">
        <nav className="admin-desktop-rail" aria-label="Aplicativos administrativos">
          {MODULES.map(({ id, label, Icon }) => {
            const windowItem = windows.find((item) => item.module === id)
            const focused = windowItem && windowItem.zIndex === Math.max(0, ...windows.map((item) => item.zIndex))
            return (
              <button
                key={id}
                type="button"
                className={focused && !windowItem?.minimized ? 'is-active' : ''}
                data-tip={label}
                aria-label={label}
                onClick={() => openModule(id)}
              >
                <Icon />
                {windowItem?.minimized ? <i aria-hidden="true" /> : null}
              </button>
            )
          })}
        </nav>

        <div className="admin-desktop-workspace" ref={workspaceRef}>
          {!visibleWindowCount ? (
            <section className="admin-desktop-welcome">
              <div>
                <h1>Command Workspace — vFinal Enterprise</h1>
                <p>Seu ambiente de implantação, configuração, governança e análise técnica. A vFinal Enterprise inclui estoque, custos, equipes, documentos, segurança e continuidade.</p>
                <div className="admin-welcome-tips">
                  <article><b>Acesso rápido</b><span>Pressione <kbd>Ctrl</kbd> + <kbd>K</kbd> e digite o nome ou código do módulo.</span></article>
                  <article><b>Janelas livres</b><span>Arraste uma janela para sair do modo organizado. Encoste nas bordas para encaixar.</span></article>
                  <article><b>Organização</b><span>Use o gerenciador inferior para focar, dividir, agrupar ou otimizar o cache.</span></article>
                </div>
              </div>
            </section>
          ) : null}

          <div className="admin-desktop-window-layer">
            {windows.map((item) => {
              const module = getModule(item.module)
              const heading = MODULE_HEADINGS[item.module]
              return (
                <section
                  key={item.module}
                  className={`admin-app-window${item.maximized ? ' is-maximized' : ''}${item.minimized ? ' is-minimized' : ''}${item.layoutHidden ? ' is-layout-hidden' : ''}`}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.width,
                    height: item.height,
                    zIndex: item.zIndex,
                  }}
                  aria-label={module.label}
                  onPointerDown={() => focusWindow(item.module)}
                >
                  <div
                    className="admin-app-window__bar"
                    onPointerDown={(event) => beginDrag(event, item)}
                    onDoubleClick={() => toggleMaximize(item.module)}
                  >
                    <span className="admin-app-window__code">{module.code}</span>
                    <strong>{module.label}</strong>
                    <span className="admin-app-window__state">Conectado</span>
                    <div className="admin-app-window__controls">
                      <button type="button" aria-label={`Minimizar ${module.label}`} title="Minimizar" onClick={() => minimizeWindow(item.module)}>—</button>
                      <button type="button" aria-label={`${item.maximized ? 'Restaurar' : 'Maximizar'} ${module.label}`} title={item.maximized ? 'Restaurar' : 'Maximizar'} onClick={() => toggleMaximize(item.module)}>{item.maximized ? '❐' : '□'}</button>
                      <button className="is-close" type="button" aria-label={`Fechar ${module.label}`} title="Fechar" onClick={() => closeWindow(item.module)}>×</button>
                    </div>
                  </div>
                  <div className="admin-app-window__body">
                    <header className="admin-window-module-heading">
                      <div><span>{heading.eyebrow}</span><h1>{heading.title}</h1><p>{heading.subtitle}</p></div>
                      <span className="admin-window-release">v{APP_RELEASE_VERSION}</span>
                    </header>
                    <AdminPage
                      session={session}
                      onSessionExpired={onSessionExpired}
                      activeModule={item.module}
                      embedded
                      onModuleChange={(nextModule) => openModule(nextModule)}
                    />
                  </div>
                </section>
              )
            })}
          </div>

          <footer className="admin-desktop-statusbar">
            <button type="button" onClick={() => setWindowManagerOpen((current) => !current)}>
              {windows.length} {windows.length === 1 ? 'janela' : 'janelas'}
            </button>
            <span>Modo: {layoutLabels[windowLayout]}</span>
            <span>Empresa: Empresa Demonstração</span>
            <div className="admin-desktop-statusbar__right">
              <button type="button" onClick={optimizeCache}>Otimizar cache</button>
              <span>Workspace: {memoryMb} MB</span>
              <span className="admin-memory-track" aria-label={`Uso estimado do Workspace: ${memoryMb} MB`}><i style={{ width: `${memoryPercent}%` }} /></span>
            </div>
          </footer>
        </div>
      </div>

      {paletteOpen ? (
        <div className="admin-desktop-overlay" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setPaletteOpen(false)
        }}>
          <section className="admin-command-palette" role="dialog" aria-modal="true" aria-label="Pesquisar comandos">
            <label><SearchIcon /><input ref={paletteInputRef} value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Digite o módulo ou ação…" /></label>
            <div>
              {filteredModules.map((module) => (
                <button key={module.id} type="button" onClick={() => openModule(module.id)}>
                  <span>{module.code}</span>
                  <span><strong>{module.label}</strong><small>{module.description}</small></span>
                  <kbd>Enter</kbd>
                </button>
              ))}
              {!filteredModules.length ? <p>Nenhum módulo encontrado.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {windowManagerOpen ? (
        <aside className="admin-window-manager" aria-label="Gerenciador de janelas">
          <header><strong>Gerenciador de janelas</strong><button type="button" aria-label="Fechar" onClick={() => setWindowManagerOpen(false)}>×</button></header>
          <section>
            <span>ORGANIZAÇÃO</span>
            <div className="admin-window-manager__layouts">
              <button className={windowLayout === 'smart' ? 'is-active' : ''} type="button" onClick={() => arrangeWindows('smart')}>Auto</button>
              <button className={windowLayout === 'focus' ? 'is-active' : ''} type="button" onClick={() => arrangeWindows('focus')}>Foco</button>
              <button className={windowLayout === 'columns' ? 'is-active' : ''} type="button" onClick={() => arrangeWindows('columns')}>2 colunas</button>
              <button className={windowLayout === 'rows' ? 'is-active' : ''} type="button" onClick={() => arrangeWindows('rows')}>2 linhas</button>
              <button className={windowLayout === 'grid' ? 'is-active' : ''} type="button" onClick={() => arrangeWindows('grid')}>Grade</button>
              <button className={windowLayout === 'cascade' ? 'is-active' : ''} type="button" onClick={() => arrangeWindows('cascade')}>Cascata</button>
            </div>
            <label className="admin-window-manager__auto"><span><strong>Organizar ao abrir</strong><small>Novas janelas entram no layout atual.</small></span><input type="checkbox" checked={autoArrange} onChange={(event) => setAutoArrange(event.target.checked)} /><i aria-hidden="true" /></label>
          </section>
          <section>
            <span>JANELAS ABERTAS</span>
            <div className="admin-window-manager__list">
              {windows.map((item) => {
                const module = getModule(item.module)
                return (
                  <article key={item.module}>
                    <b>{module.code}</b>
                    <button type="button" onClick={() => focusWindow(item.module)}><strong>{module.label}</strong><small>{item.minimized ? 'Minimizada' : item.maximized ? 'Maximizada' : 'Em janela'}</small></button>
                    <button type="button" aria-label={`Fechar ${module.label}`} onClick={() => closeWindow(item.module)}>×</button>
                  </article>
                )
              })}
              {!windows.length ? <p>Nenhuma janela aberta.</p> : null}
            </div>
          </section>
          <section>
            <span>DESEMPENHO DO WORKSPACE</span>
            <div className="admin-window-manager__performance">
              <header><small>Uso estimado</small><strong>{memoryMb} MB</strong></header>
              <div><i style={{ width: `${memoryPercent}%` }} /></div>
              <p>{cacheMessage}</p>
              <button type="button" onClick={optimizeCache}>Limpar cache temporário</button>
            </div>
          </section>
        </aside>
      ) : null}

      {helpOpen ? (
        <div className="admin-desktop-overlay" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setHelpOpen(false)
        }}>
          <section className="admin-workspace-help" role="dialog" aria-modal="true" aria-label="Ajuda do Workspace">
            <header><strong>Como usar o Command Workspace</strong><button type="button" aria-label="Fechar" onClick={() => setHelpOpen(false)}>×</button></header>
            <div>
              <article><kbd>Ctrl K</kbd><span><strong>Pesquisa rápida</strong><small>Abra qualquer cadastro, programação ou comando.</small></span></article>
              <article><kbd>Arrastar</kbd><span><strong>Janela livre</strong><small>Mova módulos e compare informações lado a lado.</small></span></article>
              <article><kbd>2× clique</kbd><span><strong>Maximizar</strong><small>Expanda ou restaure uma janela pelo título.</small></span></article>
              <article><kbd>▦</kbd><span><strong>Organizar</strong><small>Use foco, colunas, linhas, grade ou cascata para as janelas abertas.</small></span></article>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

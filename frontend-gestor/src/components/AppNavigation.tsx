import {
  AssetIcon,
  HomeIcon,
  MoreIcon,
  UsersIcon,
  ValidationIcon,
} from './Icons'

export type GestorSection = 'home' | 'validations' | 'assets' | 'admin' | 'more'

export interface AppNavigationProps {
  active: GestorSection
  validationCount: number
  showAdmin: boolean
  onNavigate: (section: GestorSection) => void
}

const ITEMS = [
  { id: 'home' as const, label: 'Início', Icon: HomeIcon },
  { id: 'validations' as const, label: 'Validar', Icon: ValidationIcon },
  { id: 'assets' as const, label: 'Ativos', Icon: AssetIcon },
  { id: 'admin' as const, label: 'Admin', Icon: UsersIcon },
  { id: 'more' as const, label: 'Mais', Icon: MoreIcon },
]

export function AppNavigation({
  active,
  validationCount,
  showAdmin,
  onNavigate,
}: AppNavigationProps) {
  const visibleItems = ITEMS.filter((item) => item.id !== 'admin' || showAdmin)
  return (
    <nav className={`app-navigation app-navigation--${visibleItems.length}`} aria-label="Navegação principal do gestor">
      {visibleItems.map(({ id, label, Icon }) => (
        <button
          className={active === id ? 'app-navigation__item is-active' : 'app-navigation__item'}
          type="button"
          key={id}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onNavigate(id)}
        >
          <span className="app-navigation__icon">
            <Icon />
            {id === 'validations' && validationCount > 0 ? (
              <span className="app-navigation__badge">
                {validationCount > 99 ? '99+' : validationCount}
              </span>
            ) : null}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

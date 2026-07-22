import {
  AssetIcon,
  HomeIcon,
  MoreIcon,
  ValidationIcon,
} from './Icons'

export type GestorSection = 'home' | 'validations' | 'assets' | 'more'

export interface AppNavigationProps {
  active: GestorSection
  validationCount: number
  onNavigate: (section: GestorSection) => void
}

const ITEMS = [
  { id: 'home' as const, label: 'Início', Icon: HomeIcon },
  { id: 'validations' as const, label: 'Validar', Icon: ValidationIcon },
  { id: 'assets' as const, label: 'Ativos', Icon: AssetIcon },
  { id: 'more' as const, label: 'Mais', Icon: MoreIcon },
]

export function AppNavigation({
  active,
  validationCount,
  onNavigate,
}: AppNavigationProps) {
  return (
    <nav className="app-navigation" aria-label="Navegação principal do gestor">
      {ITEMS.map(({ id, label, Icon }) => (
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

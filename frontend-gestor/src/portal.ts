export type PortalProfile = 'GESTOR' | 'ADMIN' | 'SHARED'

export interface PortalPresentation {
  profile: PortalProfile
  eyebrow: string
  title: string
  intro: string
  exclusiveProfileLabel: string
}

export interface PortalIdentity {
  perfil: string
  tipo_conta?: 'OPERADOR' | 'TECNICO_MANUTENCAO' | 'COMANDO_INTERNO'
  papeis?: string[]
  capacidades?: string[]
  personas?: string[]
  especialidades?: string[]
  area_id?: string | null
  cargo_tecnico_id?: string | null
  escopo_ids?: string[]
}

function identityRoles(identity: PortalIdentity | string): string[] {
  if (typeof identity === 'string') return [identity.trim().toUpperCase()]
  return [identity.perfil, ...(identity.papeis ?? [])]
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean)
}

export function isAdministrator(identity: PortalIdentity | string): boolean {
  return identityRoles(identity).includes('ADMIN')
}

export function isInternalCommand(identity: PortalIdentity | string): boolean {
  return typeof identity !== 'string' && identity.tipo_conta === 'COMANDO_INTERNO'
}

export function isPcmIdentity(identity: PortalIdentity | string): boolean {
  if (typeof identity === 'string') return false
  return identity.tipo_conta === 'TECNICO_MANUTENCAO' &&
    (identity.personas ?? []).some((persona) => persona.trim().toUpperCase() === 'PCM')
}

export function isGestorIdentity(identity: PortalIdentity | string): boolean {
  if (typeof identity !== 'string' && identity.tipo_conta !== undefined) {
    return identity.tipo_conta === 'TECNICO_MANUTENCAO' || identity.tipo_conta === 'COMANDO_INTERNO'
  }
  const roles = identityRoles(identity)
  return roles.includes('GESTOR') || roles.includes('GESTOR_TECNICO') || isAdministrator(identity)
}

function readPortalProfile(): PortalProfile {
  const configured = String(import.meta.env.VITE_PORTAL_PROFILE ?? '')
    .trim()
    .toUpperCase()

  if (configured === 'ADMIN') return 'ADMIN'
  if (configured === 'GESTOR') return 'GESTOR'
  return 'SHARED'
}

export const PORTAL_PROFILE = readPortalProfile()

export function portalAllowsProfile(identity: PortalIdentity | string): boolean {
  if (PORTAL_PROFILE === 'SHARED') return isGestorIdentity(identity)
  return PORTAL_PROFILE === 'ADMIN'
    ? isInternalCommand(identity) || isAdministrator(identity)
    : isGestorIdentity(identity) && !isInternalCommand(identity) && !isAdministrator(identity)
}

export function getPortalPresentation(): PortalPresentation {
  if (PORTAL_PROFILE === 'ADMIN') {
    return {
      profile: 'ADMIN',
      eyebrow: 'VORQIX · COMANDO INTERNO',
      title: 'Acesso ao Comando Interno',
      intro: 'Continuidade, versões, governança protegida e suporte técnico da plataforma.',
      exclusiveProfileLabel: 'Comando Interno',
    }
  }

  if (PORTAL_PROFILE === 'GESTOR') {
    return {
      profile: 'GESTOR',
      eyebrow: 'VORQIX · PCM',
      title: 'Acesso técnico operacional',
      intro: 'Planejamento, controle de manutenção, decisões, indicadores e fila técnica.',
      exclusiveProfileLabel: 'Técnico de manutenção',
    }
  }

  return {
    profile: 'SHARED',
    eyebrow: 'VORQIX',
    title: 'Acesso técnico',
    intro: 'Planejamento e execução de manutenção dentro do escopo autorizado.',
    exclusiveProfileLabel: 'Técnico de manutenção',
  }
}

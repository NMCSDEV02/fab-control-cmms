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
  papeis?: string[]
  capacidades?: string[]
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

export function isGestorIdentity(identity: PortalIdentity | string): boolean {
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
  return PORTAL_PROFILE === 'ADMIN' ? isAdministrator(identity) : isGestorIdentity(identity) && !isAdministrator(identity)
}

export function getPortalPresentation(): PortalPresentation {
  if (PORTAL_PROFILE === 'ADMIN') {
    return {
      profile: 'ADMIN',
      eyebrow: 'FAB CONTROL · ADMINISTRAÇÃO',
      title: 'Acesso do Administrador',
      intro: 'Configuração, governança, cadastros e controle integral do ambiente industrial.',
      exclusiveProfileLabel: 'Administrador',
    }
  }

  if (PORTAL_PROFILE === 'GESTOR') {
    return {
      profile: 'GESTOR',
      eyebrow: 'FAB CONTROL · GESTÃO',
      title: 'Acesso do Gestor',
      intro: 'Supervisão técnica, decisões, indicadores e liberação do trabalho operacional.',
      exclusiveProfileLabel: 'Gestor',
    }
  }

  return {
    profile: 'SHARED',
    eyebrow: 'FAB CONTROL',
    title: 'Acesso de Gestão',
    intro: 'Supervisão técnica e administração do ambiente industrial.',
    exclusiveProfileLabel: 'Gestor ou Administrador',
  }
}

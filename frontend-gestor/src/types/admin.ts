export type AdminUserProfile = 'ADMIN' | 'GESTOR' | 'OPERADOR'
export type AdminUserStatus = 'ATIVO' | 'INATIVO'

export interface AdminUser {
  id: string
  nome: string
  email: string
  matricula: string
  perfil: AdminUserProfile
  status: AdminUserStatus
  primeiro_acesso?: string
  tentativas_login?: number | string
  bloqueado_ate?: string
  ultimo_login_em?: string
  senha_atualizada_em?: string
  recuperacao_referencia?: string
  recuperacao_solicitada_em?: string
  recuperacao_pendente?: boolean
  sessoes_ativas?: number
  criado_em?: string
  atualizado_em?: string
  area_id?: string
  cargo_id?: string
  especialidades_json?: string
  escopo_ids_json?: string
}

export interface AdminUserInput {
  id?: string
  nome: string
  email: string
  matricula: string
  perfil: AdminUserProfile
  status: AdminUserStatus
  senha_temporaria?: string
  area_id?: string
  cargo_id?: string
  especialidades?: string[]
  escopo_ids?: string[]
}

export interface TechnicalArea {
  id: string
  codigo: string
  nome: string
  descricao?: string
  status: AdminUserStatus
  exige_assinatura_padrao?: string
}

export interface TechnicalRole {
  id: string
  area_id: string
  codigo: string
  nome: string
  descricao?: string
  status: AdminUserStatus
  pode_assinar?: string
}

export interface AdminUserListFilters {
  busca?: string
  perfil?: AdminUserProfile | ''
  status?: AdminUserStatus | ''
}

export interface AdminUserSaveResult {
  saved: boolean
  mode: 'insert' | 'update'
  usuario: AdminUser
  sessoes_revogadas: number
}

export interface AdminPasswordResetResult {
  password_reset: boolean
  usuario_id: string
  primeiro_acesso: boolean
  sessoes_revogadas: number
}

export interface AdminSessionRevokeResult {
  revoked: boolean
  usuario_id: string
  sessoes_revogadas: number
}

export interface AdminPermissionCapability {
  id: string
  nome: string
  descricao: string
  permitido: boolean
  padrao: boolean
  acoes: string[]
}

export interface AdminPermissionProfile {
  perfil: AdminUserProfile
  editavel: boolean
  acesso_total?: boolean
  capacidades: AdminPermissionCapability[]
}

export interface AdminPermissionMatrix {
  chave: string
  perfis: AdminPermissionProfile[]
}

export interface AdminPermissionSaveResult {
  saved: boolean
  perfil: AdminUserProfile
  matriz: AdminPermissionProfile
}

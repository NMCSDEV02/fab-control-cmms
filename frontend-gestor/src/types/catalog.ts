export type AdminEntity =
  | 'plantas'
  | 'setores'
  | 'linhas'
  | 'ativos'
  | 'componentes'
  | 'materiais'
  | 'planos'
  | 'plano_itens'

export type AdminEntityRecord = Record<string, string | number | boolean | null | undefined> & {
  id: string
  criado_em?: string
  atualizado_em?: string
}

export interface AdminEntityList {
  entidade: AdminEntity
  total: number
  rows: AdminEntityRecord[]
}

export interface AdminEntitySaveResult {
  saved: boolean
  mode: 'insert' | 'update'
  entidade: AdminEntity
  row: AdminEntityRecord
}

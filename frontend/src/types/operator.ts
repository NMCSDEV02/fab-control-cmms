export type ActionStatus =
  | 'PENDENTE'
  | 'EM_EXECUCAO'
  | 'AGUARDANDO_VALIDACAO'
  | 'CONCLUIDA'

export type ActionGroup = 'NAO_PROGRAMADA' | 'PROGRAMADA'
export type ActionPriority = 'NORMAL' | 'ALTA' | 'CRITICA'

export interface OperatorAction {
  id: string
  group: ActionGroup
  type: string
  title: string
  assetTag: string
  assetName: string
  componentTag: string
  componentName: string
  description: string
  priority: ActionPriority
  status: ActionStatus
  startAt: string
  durationMinutes?: number
  crew: string[]
  progress?: {
    total: number
    answered: number
    pending: number
    percentage: number
  }
}

export interface AssetParameter {
  id: string
  name: string
  value: number
  unit: string
  min: number
  max: number
  measuredAt: string
}

export interface AssetHistoryItem {
  id: string
  title: string
  detail: string
  date: string
  status: 'CONCLUIDA' | 'PROGRAMADA' | 'AGUARDANDO_INSPECAO'
}

export interface AssetSummary {
  id: string
  name: string
  location: string
  status: 'OPERANDO' | 'PARADO'
  parameters: AssetParameter[]
  history: AssetHistoryItem[]
}

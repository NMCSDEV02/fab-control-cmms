export type ActionStatus='PENDENTE'|'EM_EXECUCAO'|'AGUARDANDO_VALIDACAO'|'CONCLUIDA'
export interface OperatorActionCard{id:string;acao_id:string;title:string;subtitle:string;description:string;status:{state:string;label:string;tone:string};progress:{total:number;respondidos:number;pendentes:number;percentual:number}}

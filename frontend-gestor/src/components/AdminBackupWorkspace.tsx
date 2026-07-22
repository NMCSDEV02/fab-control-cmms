import { useCallback, useEffect, useState } from 'react'
import { createAdminBackup, listAdminBackups } from '../services/api/governance'
import { isGestorAuthenticationError } from '../services/api/gestor'
import type { AdminBackup } from '../types/governance'
import { RefreshIcon, ShieldIcon } from './Icons'

interface AdminBackupWorkspaceProps {
  onSessionExpired: () => void
}

function formatDate(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR')
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${(value / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

export function AdminBackupWorkspace({ onSessionExpired }: AdminBackupWorkspaceProps) {
  const [backups, setBackups] = useState<AdminBackup[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reasonType, setReasonType] = useState('ANTES_DE_CONFIGURACAO')
  const [reasonDetail, setReasonDetail] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const handleFailure = useCallback((cause: unknown) => {
    if (isGestorAuthenticationError(cause)) {
      onSessionExpired()
      return
    }
    setError(cause instanceof Error ? cause.message : 'Não foi possível consultar os backups.')
  }, [onSessionExpired])

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await listAdminBackups(signal)
    setBackups(data.backups)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void load(controller.signal).catch((cause) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      handleFailure(cause)
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [handleFailure, load])

  async function createBackup() {
    const reasonLabels: Record<string, string> = {
      ANTES_DE_CONFIGURACAO: 'Antes de alteração de configuração',
      ANTES_DE_IMPORTACAO: 'Antes de importação de dados',
      FECHAMENTO_DE_TURNO: 'Fechamento de turno',
      MARCO_DE_RELEASE: 'Marco de release',
      OUTRO: 'Outro motivo',
    }
    if (!confirmed) {
      setError('Confirme que deseja criar uma cópia integral da base.')
      return
    }
    const reason = `${reasonLabels[reasonType]}${reasonDetail.trim() ? `: ${reasonDetail.trim()}` : ''}`
    setCreating(true)
    setError('')
    try {
      await createAdminBackup(reason, 'CRIAR BACKUP')
      setDialogOpen(false)
      setConfirmed(false)
      setReasonDetail('')
      setNotice('Backup integral criado e registrado na auditoria.')
      await load()
    } catch (cause) {
      handleFailure(cause)
    } finally {
      setCreating(false)
    }
  }

  if (loading && !backups.length) return <div className="dashboard-loading">Consultando continuidade e backups…</div>

  return (
    <section className="admin-backup-workspace">
      {error ? <div className="dashboard-error" role="alert"><strong>Continuidade.</strong><span>{error}</span></div> : null}
      {notice ? <div className="dashboard-notice" role="status">{notice}</div> : null}

      <section className="admin-continuity-summary">
        <article><ShieldIcon /><span><small>Política atual</small><strong>Cópia integral privada</strong><i>planilha e estrutura operacional</i></span></article>
        <article><ShieldIcon /><span><small>Backups disponíveis</small><strong>{backups.length}</strong><i>armazenados no Drive do ambiente</i></span></article>
        <article><ShieldIcon /><span><small>Última cópia</small><strong>{backups[0] ? formatDate(backups[0].criado_em) : 'Ainda não criada'}</strong><i>{backups[0]?.nome || 'Crie o primeiro ponto de restauração'}</i></span></article>
      </section>

      <section className="admin-continuity-warning"><ShieldIcon /><span><strong>Restauração protegida</strong><small>A restauração permanece desativada nesta versão porque substitui dados operacionais. O bloco seguro de dupla confirmação será publicado separadamente.</small></span><button type="button" disabled>Restaurar indisponível</button></section>

      <section className="admin-governance-table-card">
        <header><div><span className="eyebrow">CONTINUIDADE OPERACIONAL</span><h2>Pontos de backup</h2></div><div className="admin-backup-header-actions"><button type="button" onClick={() => void load()}><RefreshIcon />Atualizar</button><button className="primary-button" type="button" onClick={() => { setDialogOpen(true); setError(''); setNotice('') }}>Criar backup</button></div></header>
        <div className="admin-governance-table-wrap"><table className="admin-governance-table"><thead><tr><th>Arquivo</th><th>Data de criação</th><th>Tamanho</th><th>Armazenamento</th><th>Ação segura</th></tr></thead><tbody>
          {backups.map((backup) => <tr key={backup.id}><td><strong>{backup.nome}</strong><small>{backup.id}</small></td><td><strong>{formatDate(backup.criado_em)}</strong><small>cópia imutável</small></td><td><strong>{formatBytes(backup.tamanho_bytes)}</strong><small>base integral</small></td><td><strong>Drive privado</strong><small>acesso controlado pela conta proprietária</small></td><td><button type="button" onClick={() => window.open(backup.url, '_blank', 'noopener,noreferrer')}>Abrir no Drive</button></td></tr>)}
          {!backups.length ? <tr><td colSpan={5}><div className="admin-empty-state">Nenhum backup administrativo foi criado.</div></td></tr> : null}
        </tbody></table></div>
      </section>

      {dialogOpen ? <div className="admin-catalog-dialog" role="dialog" aria-modal="true" aria-label="Criar backup"><section>
        <header><div><span className="eyebrow">OPERAÇÃO AUDITADA</span><h2>Criar ponto de backup</h2></div><button type="button" onClick={() => setDialogOpen(false)}>Fechar</button></header>
        <div className="admin-backup-form">
          <label><span>Motivo *</span><select value={reasonType} onChange={(event) => setReasonType(event.target.value)}><option value="ANTES_DE_CONFIGURACAO">Antes de alteração de configuração</option><option value="ANTES_DE_IMPORTACAO">Antes de importação de dados</option><option value="FECHAMENTO_DE_TURNO">Fechamento de turno</option><option value="MARCO_DE_RELEASE">Marco de release</option><option value="OUTRO">Outro motivo</option></select></label>
          <label><span>Complemento</span><textarea rows={3} value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} placeholder="Informe o contexto para a auditoria" /></label>
          <label className="admin-backup-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Confirmo a criação da cópia integral</strong><small>Esta operação não altera nem interrompe a produção.</small></span></label>
        </div>
        <footer><div><button type="button" onClick={() => setDialogOpen(false)}>Cancelar</button><button className="primary-button" type="button" disabled={creating || !confirmed} onClick={() => void createBackup()}>{creating ? 'Criando cópia…' : 'Confirmar backup'}</button></div></footer>
      </section></div> : null}
    </section>
  )
}

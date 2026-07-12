import { useEffect, useMemo, useRef, useState } from 'react'
import { ActiveStopBanner } from '../components/ActiveStopBanner'
import { QrIcon, ScanIcon } from '../components/Icons'
import {
  finishOperatorStop,
  getOperatorQrContext,
  registerOperatorOccurrence,
  registerOperatorParameter,
  startOperatorStop,
} from '../services/api/operator'
import { readQrContextCache, writeQrContextCache } from '../services/storage/operatorCache'
import type {
  FinishStopResponseData,
  OperatorQrContextData,
  QrParameterData,
} from '../types/api'

type BarcodeDetectorResult = { rawValue?: string }
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]> }
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance

export interface QrPageProps {
  onNotify: (message: string) => void
  onOpenAction: (actionId: string) => void
}

function formatDate(value?: string): string {
  if (!value) return 'Data não informada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function displayName(value?: string): string {
  if (!value) return 'Parâmetro'
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function latestParameters(context: OperatorQrContextData): QrParameterData[] {
  if (context.parametros_atuais?.length) return context.parametros_atuais
  if (context.parametros_recentes?.length) {
    const seen = new Set<string>()
    return context.parametros_recentes.filter((item) => {
      const key = `${item.componente_id ?? ''}|${item.parametro ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (context.ativo?.horimetro_atual !== undefined && context.ativo.horimetro_atual !== '') {
    return [{
      id: 'HORIMETRO-ATIVO',
      ativo_id: context.ativo.id,
      parametro: 'HORIMETRO',
      valor: context.ativo.horimetro_atual,
      unidade: 'h',
      origem: context.horimetro?.automatico ? 'TELEMETRIA' : 'ATIVO',
      registrado_em: context.horimetro?.atualizado_em,
    }]
  }
  return []
}

export function QrPage({ onNotify, onOpenAction }: QrPageProps) {
  const [query, setQuery] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [context, setContext] = useState<OperatorQrContextData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [parameterOpen, setParameterOpen] = useState(false)
  const [parameterName, setParameterName] = useState('HORIMETRO')
  const [parameterValue, setParameterValue] = useState('')
  const [parameterUnit, setParameterUnit] = useState('h')
  const [componentId, setComponentId] = useState('')
  const [savingParameter, setSavingParameter] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [stopReason, setStopReason] = useState('')
  const [savingStop, setSavingStop] = useState(false)
  const [returnCategory, setReturnCategory] = useState('')
  const [returnJustification, setReturnJustification] = useState('')
  const [returnValidation, setReturnValidation] = useState<FinishStopResponseData | null>(null)
  const [occurrenceOpen, setOccurrenceOpen] = useState(false)
  const [occurrenceTitle, setOccurrenceTitle] = useState('')
  const [occurrenceDescription, setOccurrenceDescription] = useState('')
  const [occurrenceSeverity, setOccurrenceSeverity] = useState('MEDIA')
  const [occurrenceComponentId, setOccurrenceComponentId] = useState('')
  const [savingOccurrence, setSavingOccurrence] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const parameters = useMemo(() => context ? latestParameters(context) : [], [context])

  async function lookup(payload = query) {
    const normalized = payload.trim()
    if (!normalized) {
      setError('Informe o QR, a TAG ou o ID do equipamento.')
      return
    }

    const cached = await readQrContextCache(normalized)
    if (cached?.found) {
      setContext(cached)
      setLastQuery(normalized)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError('')

    try {
      const result = await getOperatorQrContext(normalized)
      setContext(result)
      setLastQuery(normalized)
      await writeQrContextCache(normalized, result)
      if (!result.found) setError(result.mensagem_operador || 'Equipamento não encontrado.')
      else onNotify(result.mensagem_operador || 'Equipamento identificado')
    } catch (cause) {
      if (!cached) {
        setContext(null)
        setError(cause instanceof Error ? cause.message : 'Falha ao consultar o QR Code.')
      } else {
        onNotify('Exibindo consulta salva. Atualização online indisponível.')
      }
    } finally {
      setLoading(false)
    }
  }

  function stopCamera() {
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current)
    scanTimerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  useEffect(() => () => stopCamera(), [])

  useEffect(() => {
    if (!cameraActive) return
    let cancelled = false

    const start = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
      if (!Detector) {
        setCameraError('Este navegador não possui leitura nativa de QR. Use o campo de código abaixo.')
        setCameraActive(false)
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (cancelled) return stream.getTracks().forEach((track) => track.stop())
        streamRef.current = stream
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new Detector({ formats: ['qr_code'] })
        const scan = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const results = await detector.detect(videoRef.current)
            const raw = results.find((item) => item.rawValue)?.rawValue?.trim()
            if (raw) {
              setQuery(raw)
              stopCamera()
              await lookup(raw)
              return
            }
          } catch {
            // Quadro sem QR é esperado durante a leitura.
          }
          scanTimerRef.current = window.setTimeout(() => void scan(), 350)
        }
        void scan()
      } catch (cause) {
        setCameraError(cause instanceof Error ? `Não foi possível abrir a câmera: ${cause.message}` : 'Não foi possível abrir a câmera.')
        setCameraActive(false)
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [cameraActive])

  async function saveParameter() {
    if (!context?.ativo?.id) return
    const value = Number(parameterValue.replace(',', '.'))
    if (!Number.isFinite(value)) return onNotify('Informe um valor numérico válido')
    setSavingParameter(true)
    try {
      await registerOperatorParameter({
        ativo_id: context.ativo.id,
        componente_id: componentId || context.componente?.id || '',
        parametro: parameterName,
        valor: value,
        unidade: parameterName === 'HORIMETRO' ? 'h' : parameterUnit,
      })
      setParameterOpen(false)
      setParameterValue('')
      onNotify('Leitura registrada')
      await lookup(lastQuery || context.ativo.tag || context.ativo.id)
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Falha ao registrar parâmetro')
    } finally {
      setSavingParameter(false)
    }
  }

  async function startStop() {
    if (!context?.ativo?.id) return
    setSavingStop(true)
    try {
      await startOperatorStop({ ativo_id: context.ativo.id, componente_id: context.componente?.id || '', motivo_parada: stopReason.trim() || 'Parada operacional iniciada pelo operador.' })
      setStopOpen(false)
      setStopReason('')
      onNotify('Parada operacional iniciada')
      await lookup(lastQuery || context.ativo.tag || context.ativo.id)
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Falha ao iniciar a parada')
    } finally {
      setSavingStop(false)
    }
  }

  async function finishStop() {
    if (!context?.parada_ativa?.id || !context.ativo?.id) return
    setSavingStop(true)
    try {
      const result = await finishOperatorStop({
        parada_id: context.parada_ativa.id,
        ativo_id: context.ativo.id,
        categoria_retorno: returnCategory,
        justificativa_divergencia: returnJustification.trim(),
      })
      setReturnValidation(result)
      if (result.requires_justification) return onNotify('Justifique o intervalo antes do retorno')
      setStopOpen(false)
      setReturnValidation(null)
      setReturnCategory('')
      setReturnJustification('')
      onNotify('Parada finalizada. Equipamento em operação.')
      await lookup(lastQuery || context.ativo.tag || context.ativo.id)
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Falha ao finalizar a parada')
    } finally {
      setSavingStop(false)
    }
  }

  async function saveOccurrence() {
    if (!context?.ativo?.id) return
    if (!occurrenceTitle.trim() || occurrenceDescription.trim().length < 5) return onNotify('Informe título e descrição da ocorrência')
    setSavingOccurrence(true)
    try {
      await registerOperatorOccurrence({
        ativo_id: context.ativo.id,
        componente_id: occurrenceComponentId || context.componente?.id || '',
        titulo: occurrenceTitle.trim(),
        descricao: occurrenceDescription.trim(),
        severidade: occurrenceSeverity,
      })
      setOccurrenceOpen(false)
      setOccurrenceTitle('')
      setOccurrenceDescription('')
      onNotify('Ocorrência enviada para análise')
      await lookup(lastQuery || context.ativo.tag || context.ativo.id)
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Falha ao registrar ocorrência')
    } finally {
      setSavingOccurrence(false)
    }
  }

  function reset() {
    stopCamera()
    setContext(null)
    setError('')
    setQuery('')
    setLastQuery('')
  }

  if (!context?.found) {
    return (
      <section className="screen qr-page-real">
        <header className="screen-heading">
          <span>Consulta técnica</span>
          <h1>Equipamento por QR Code</h1>
          <p>Leia o código ou informe a TAG para consultar ações, parâmetros e histórico.</p>
        </header>
        <article className="qr-reader-card">
          <div className={cameraActive ? 'qr-camera qr-camera--active' : 'qr-camera'}>
            {cameraActive ? <><video ref={videoRef} muted playsInline /><div className="qr-camera__frame" /><button type="button" onClick={stopCamera}>Cancelar câmera</button></> : <span className="qr-reader-card__icon"><QrIcon /></span>}
          </div>
          <h2>{cameraActive ? 'Aponte para o QR Code' : 'Identificar equipamento'}</h2>
          <p>A câmera é usada apenas durante a leitura. Também é possível digitar a TAG ou o ID.</p>
          {!cameraActive && <button className="qr-camera-button" type="button" onClick={() => { setCameraError(''); setCameraActive(true) }}><ScanIcon /> Abrir câmera</button>}
          {cameraError && <div className="inline-warning"><span>{cameraError}</span></div>}
          <form className="qr-manual-form" onSubmit={(event) => { event.preventDefault(); void lookup() }}>
            <label><span>QR, TAG ou ID</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: TMP-001" autoCapitalize="characters" /></label>
            <button type="submit" disabled={loading}>{loading ? 'Consultando…' : 'Consultar'}</button>
          </form>
        </article>
        {error && <article className="state-panel state-panel--error qr-error-panel"><h2>{error}</h2><button type="button" onClick={() => void lookup(lastQuery || query)}>Tentar novamente</button></article>}
      </section>
    )
  }

  const asset = context.ativo
  const action = context.proxima_acao
  const health = context.saude?.pct ?? asset?.saude_pct

  return (
    <section className="screen qr-asset-page">
      {action?.id && <button className="qr-action-available" type="button" onClick={() => onOpenAction(action.id)}><div><span>Ação disponível</span><strong>{action.titulo || action.plano?.nome || 'Ação de manutenção'}</strong><small>{action.componente_nome || action.componente_id || asset?.nome}</small></div><b>Abrir agora →</b></button>}

      <article className="asset-hero asset-hero--real">
        <div className="asset-hero__status-line"><span className="status-chip status-chip--online">Equipamento identificado</span><button type="button" onClick={reset}>Ler outro</button></div>
        <h1>{asset?.tag || asset?.id} — {asset?.nome || 'Equipamento'}</h1>
        <p>{asset?.localizacao_tecnica || asset?.tipo || 'Localização não informada'}</p>
        <div className="asset-data-grid">
          <div><span>Status</span><strong>{context.parada_ativa ? 'PARADO' : (asset?.status || 'Não informado')}</strong></div>
          <div><span>Saúde</span><strong>{health !== undefined && health !== '' ? `${health}%` : 'Não informada'}</strong></div>
          <div><span>Criticidade</span><strong>{asset?.criticidade || 'Não informada'}</strong></div>
          <div><span>Horímetro total</span><strong>{asset?.horimetro_atual !== undefined && asset?.horimetro_atual !== '' ? `${asset.horimetro_atual} h` : 'Não informado'}</strong></div>
          <div><span>Desde último serviço</span><strong>{context.horimetro?.contador_servico_horas === null || context.horimetro?.contador_servico_horas === undefined ? 'Não iniciado' : `${context.horimetro.contador_servico_horas} h`}</strong></div>
          <div><span>Leitura</span><strong>{context.horimetro?.automatico ? 'Automática' : 'Manual'}</strong></div>
        </div>
      </article>

      {context.parada_ativa && <ActiveStopBanner stop={context.parada_ativa} />}

      <section className="content-section">
        <div className="section-heading section-heading--button"><div><h2>Parâmetros do equipamento</h2><p>Últimas leituras registradas.</p></div><button type="button" onClick={() => setParameterOpen((value) => !value)}>{parameterOpen ? 'Fechar' : 'Registrar leitura'}</button></div>
        {parameterOpen && <article className="parameter-entry-card">
          {parameterName === 'HORIMETRO' && <div className="horimeter-qr-note"><strong>Horímetro acumulativo</strong><span>O total não pode diminuir nem ser zerado. A administração reinicia somente o contador desde o último serviço.</span></div>}
          <div className="parameter-form-grid">
            <label><span>Parâmetro</span><select value={parameterName} onChange={(event) => { setParameterName(event.target.value); if (event.target.value === 'HORIMETRO') setParameterUnit('h') }}><option value="HORIMETRO">Horímetro</option><option value="TEMPERATURA">Temperatura</option><option value="VIBRACAO">Vibração</option><option value="PRESSAO">Pressão</option><option value="CORRENTE">Corrente</option><option value="TENSAO">Tensão</option></select></label>
            <label><span>Valor</span><input inputMode="decimal" value={parameterName === 'HORIMETRO' && context.horimetro?.automatico ? String(context.horimetro.total_horas ?? asset?.horimetro_atual ?? '') : parameterValue} readOnly={parameterName === 'HORIMETRO' && Boolean(context.horimetro?.automatico)} onChange={(event) => setParameterValue(event.target.value)} placeholder={parameterName === 'HORIMETRO' ? String(asset?.horimetro_atual ?? '0') : '0,00'} /></label>
            <label><span>Unidade</span><input value={parameterName === 'HORIMETRO' ? 'h' : parameterUnit} disabled={parameterName === 'HORIMETRO'} onChange={(event) => setParameterUnit(event.target.value)} /></label>
            <label><span>Componente</span><select value={componentId} onChange={(event) => setComponentId(event.target.value)}><option value="">Equipamento geral</option>{(context.componentes ?? []).map((component) => <option key={component.id} value={component.id}>{component.tag || component.id} — {component.nome}</option>)}</select></label>
          </div>
          <button type="button" onClick={() => void saveParameter()} disabled={savingParameter || (parameterName === 'HORIMETRO' && Boolean(context.horimetro?.automatico))}>{parameterName === 'HORIMETRO' && context.horimetro?.automatico ? 'Atualizado pela telemetria' : savingParameter ? 'Registrando…' : 'Confirmar leitura'}</button>
        </article>}
        {parameters.length > 0 ? (
          <div className="parameter-grid parameter-grid--real">{parameters.map((parameter) => <article className="parameter-card parameter-card--real" key={parameter.id}><div><strong>{displayName(parameter.parametro)}</strong><span>{parameter.componente_id ? `Componente: ${parameter.componente_id}` : 'Equipamento geral'}</span><small>{formatDate(parameter.registrado_em || parameter.criado_em)}</small></div><div className="parameter-value">{parameter.valor ?? '—'} {parameter.unidade || ''}</div></article>)}</div>
        ) : (
          <article className="empty-panel qr-empty-panel"><strong>Nenhuma leitura registrada</strong><p>Use “Registrar leitura” para incluir o primeiro parâmetro operacional.</p></article>
        )}
      </section>

      {(context.ocorrencias_abertas?.length ?? 0) > 0 && (
        <section className="content-section">
          <div className="section-heading"><div><h2>Ocorrências aguardando análise</h2><p>Registros enviados para gestão e administração.</p></div><span>{context.ocorrencias_abertas?.length ?? 0}</span></div>
          <div className="history-list">{context.ocorrencias_abertas?.map((item) => <article className="history-card occurrence-card" key={item.id}><div><strong>{item.titulo}</strong><p>{item.descricao}</p><small>{formatDate(item.criado_em)}</small></div><span className="history-status">{item.severidade}</span></article>)}</div>
        </section>
      )}

      <section className="content-section">
        <div className="section-heading"><div><h2>Histórico do equipamento</h2><p>Manutenções, componentes, lubrificações e eventos técnicos.</p></div><span>{context.historico_recente?.length ?? 0}</span></div>
        <div className="history-list">{(context.historico_recente ?? []).map((item) => <article className="history-card" key={item.id}><div><strong>{displayName(item.evento || 'Evento técnico')}</strong><p>{item.descricao || 'Sem descrição.'}</p><small>{formatDate(item.criado_em)}</small></div><span className="history-status">{item.perfil || 'SISTEMA'}</span></article>)}</div>
      </section>

      <div className="qr-next-actions"><button type="button" className="secondary-action" onClick={() => setOccurrenceOpen(true)}>Informar ocorrência</button><button type="button" className={context.parada_ativa ? 'danger-action danger-action--finish' : 'danger-action'} onClick={() => { setReturnValidation(null); setStopOpen(true) }}>{context.parada_ativa ? 'Finalizar parada' : 'Registrar parada'}</button></div>

      {occurrenceOpen && <div className="evidence-modal-backdrop"><form className="evidence-modal operational-modal" onSubmit={(event) => { event.preventDefault(); void saveOccurrence() }}><div><span>Ocorrência operacional</span><h2>Informar condição do equipamento</h2></div><label><span>Título</span><input value={occurrenceTitle} onChange={(event) => setOccurrenceTitle(event.target.value)} /></label><label><span>Descrição</span><textarea value={occurrenceDescription} onChange={(event) => setOccurrenceDescription(event.target.value)} /></label><label><span>Severidade</span><select value={occurrenceSeverity} onChange={(event) => setOccurrenceSeverity(event.target.value)}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label><label><span>Componente</span><select value={occurrenceComponentId} onChange={(event) => setOccurrenceComponentId(event.target.value)}><option value="">Equipamento geral</option>{(context.componentes ?? []).map((component) => <option key={component.id} value={component.id}>{component.tag || component.id} — {component.nome}</option>)}</select></label><div className="evidence-modal__actions"><button type="button" className="secondary-button" onClick={() => setOccurrenceOpen(false)}>Cancelar</button><button type="submit" disabled={savingOccurrence}>{savingOccurrence ? 'Enviando…' : 'Registrar ocorrência'}</button></div></form></div>}

      {stopOpen && (
        <div className="evidence-modal-backdrop">
          <form
            className="evidence-modal operational-modal"
            onSubmit={(event) => {
              event.preventDefault()
              if (context.parada_ativa) void finishStop()
              else void startStop()
            }}
          >
            <div>
              <span>Controle de parada operacional</span>
              <h2>{context.parada_ativa ? 'Confirmar retorno à operação' : 'Iniciar parada agora'}</h2>
            </div>

            {!context.parada_ativa ? (
              <label>
                <span>Motivo resumido</span>
                <textarea value={stopReason} onChange={(event) => setStopReason(event.target.value)} />
              </label>
            ) : (
              <>
                <ActiveStopBanner stop={context.parada_ativa} compact />
                {returnValidation?.requires_justification && (
                  <>
                    <label>
                      <span>Motivo do intervalo</span>
                      <select value={returnCategory} onChange={(event) => setReturnCategory(event.target.value)}>
                        <option value="">Selecione</option>
                        {(returnValidation.categories ?? []).map((category) => (
                          <option key={category} value={category}>{displayName(category)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Justificativa</span>
                      <textarea value={returnJustification} onChange={(event) => setReturnJustification(event.target.value)} />
                    </label>
                  </>
                )}
              </>
            )}

            <div className="evidence-modal__actions">
              <button type="button" className="secondary-button" onClick={() => setStopOpen(false)}>Cancelar</button>
              <button
                type="submit"
                className={context.parada_ativa ? 'primary-button' : 'primary-button danger-confirm-button'}
                disabled={savingStop}
              >
                {savingStop ? 'Processando…' : context.parada_ativa ? 'Confirmar retorno' : 'Iniciar parada'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

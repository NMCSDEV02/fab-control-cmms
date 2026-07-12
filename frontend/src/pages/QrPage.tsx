import { useEffect, useMemo, useRef, useState } from 'react'
import { QrIcon, ScanIcon } from '../components/Icons'
import { getOperatorQrContext, registerOperatorParameter } from '../services/api/operator'
import type { OperatorQrContextData, QrParameterData } from '../types/api'

type BarcodeDetectorResult = { rawValue?: string }
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance

export interface QrPageProps {
  onNotify: (message: string) => void
  onOpenAction: (actionId: string) => void
}

function formatDate(value?: string): string {
  if (!value) return 'Data não informada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function displayParameterName(value?: string): string {
  if (!value) return 'Parâmetro'
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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

  if (context.ativo?.horimetro_atual !== undefined && context.ativo?.horimetro_atual !== '') {
    return [{
      id: 'HORIMETRO-ATIVO',
      ativo_id: context.ativo.id,
      parametro: 'HORIMETRO',
      valor: context.ativo.horimetro_atual,
      unidade: 'h',
      origem: 'ATIVO',
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

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorTimerRef = useRef<number | null>(null)

  const parameters = useMemo(() => context ? latestParameters(context) : [], [context])

  async function lookup(payload = query) {
    const normalized = payload.trim()
    if (!normalized) {
      setError('Informe o QR, a TAG ou o ID do equipamento.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await getOperatorQrContext(normalized)
      setLastQuery(normalized)
      setContext(result)
      if (!result.found) setError(result.mensagem_operador || 'Equipamento não encontrado.')
      else onNotify(result.mensagem_operador || 'Equipamento identificado')
    } catch (cause) {
      setContext(null)
      setError(cause instanceof Error ? cause.message : 'Falha ao consultar o QR Code.')
    } finally {
      setLoading(false)
    }
  }

  function stopCamera() {
    if (detectorTimerRef.current !== null) {
      window.clearTimeout(detectorTimerRef.current)
      detectorTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  useEffect(() => () => stopCamera(), [])

  useEffect(() => {
    if (!cameraActive) return

    let cancelled = false
    const run = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
      if (!Detector) {
        setCameraError('Este navegador não possui leitura nativa de QR. Use o campo de código abaixo.')
        setCameraActive(false)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
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
            // Quadros sem leitura são esperados durante a varredura.
          }
          detectorTimerRef.current = window.setTimeout(() => void scan(), 350)
        }
        void scan()
      } catch (cause) {
        setCameraError(
          cause instanceof Error
            ? `Não foi possível abrir a câmera: ${cause.message}`
            : 'Não foi possível abrir a câmera.',
        )
        setCameraActive(false)
      }
    }

    void run()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [cameraActive])

  async function saveParameter() {
    if (!context?.ativo?.id) return
    const value = Number(parameterValue.replace(',', '.'))
    if (!parameterName.trim() || !Number.isFinite(value)) {
      onNotify('Informe o parâmetro e um valor numérico válido')
      return
    }

    setSavingParameter(true)
    try {
      await registerOperatorParameter({
        ativo_id: context.ativo.id,
        componente_id: componentId || context.componente?.id || '',
        parametro: parameterName,
        valor: value,
        unidade: parameterUnit,
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

  function reset() {
    stopCamera()
    setContext(null)
    setError('')
    setLastQuery('')
    setQuery('')
    setParameterOpen(false)
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
            {cameraActive ? (
              <>
                <video ref={videoRef} muted playsInline aria-label="Câmera para leitura de QR Code" />
                <div className="qr-camera__frame" aria-hidden="true" />
                <button type="button" onClick={stopCamera}>Cancelar câmera</button>
              </>
            ) : (
              <span className="qr-reader-card__icon"><QrIcon /></span>
            )}
          </div>

          <h2>{cameraActive ? 'Aponte para o QR Code' : 'Identificar equipamento'}</h2>
          <p>A câmera é usada somente durante a leitura. Também é possível digitar a TAG ou o ID.</p>

          {!cameraActive && (
            <button
              className="qr-camera-button"
              type="button"
              onClick={() => {
                setCameraError('')
                setCameraActive(true)
              }}
            >
              <ScanIcon /> Abrir câmera
            </button>
          )}

          {cameraError && <div className="inline-warning"><span>{cameraError}</span></div>}

          <form
            className="qr-manual-form"
            onSubmit={(event) => {
              event.preventDefault()
              void lookup()
            }}
          >
            <label>
              <span>QR, TAG ou ID</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex.: TMP-001 ou ATV-TMP-001"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <button type="submit" disabled={loading}>{loading ? 'Consultando…' : 'Consultar'}</button>
          </form>
        </article>

        {error && (
          <article className="state-panel state-panel--error qr-error-panel">
            <span className="state-panel__kicker">Consulta não concluída</span>
            <h2>{error}</h2>
            <button type="button" onClick={() => void lookup(lastQuery || query)}>Tentar novamente</button>
          </article>
        )}
      </section>
    )
  }

  const asset = context.ativo
  const action = context.proxima_acao
  const health = context.saude?.pct ?? asset?.saude_pct

  return (
    <section className="screen qr-asset-page">
      {action?.id && (
        <button className="qr-action-available" type="button" onClick={() => onOpenAction(action.id)}>
          <div>
            <span>Ação disponível</span>
            <strong>{action.titulo || action.plano?.nome || 'Ação de manutenção'}</strong>
            <small>{action.componente_nome || action.componente_id || asset?.nome}</small>
          </div>
          <b>Abrir agora →</b>
        </button>
      )}

      <article className="asset-hero asset-hero--real">
        <div className="asset-hero__status-line">
          <span className="status-chip status-chip--online">Equipamento identificado</span>
          <button type="button" onClick={reset}>Ler outro</button>
        </div>
        <h1>{asset?.tag || asset?.id} — {asset?.nome || 'Equipamento'}</h1>
        <p>{asset?.localizacao_tecnica || asset?.tipo || 'Localização não informada'}</p>
        <div className="asset-data-grid">
          <div><span>Status</span><strong>{asset?.status || 'Não informado'}</strong></div>
          <div><span>Saúde</span><strong>{health !== undefined && health !== '' ? `${health}%` : 'Não informada'}</strong></div>
          <div><span>Criticidade</span><strong>{asset?.criticidade || 'Não informada'}</strong></div>
          <div><span>Horímetro</span><strong>{asset?.horimetro_atual !== undefined && asset?.horimetro_atual !== '' ? `${asset.horimetro_atual} h` : 'Não informado'}</strong></div>
        </div>
      </article>

      <section className="content-section">
        <div className="section-heading section-heading--button">
          <div>
            <h2>Parâmetros do equipamento</h2>
            <p>Últimas leituras registradas para o ativo e seus componentes.</p>
          </div>
          <button type="button" onClick={() => setParameterOpen((value) => !value)}>
            {parameterOpen ? 'Fechar' : 'Registrar leitura'}
          </button>
        </div>

        {parameterOpen && (
          <article className="parameter-entry-card">
            <div className="parameter-form-grid">
              <label>
                <span>Parâmetro</span>
                <select value={parameterName} onChange={(event) => setParameterName(event.target.value)}>
                  <option value="HORIMETRO">Horímetro</option>
                  <option value="TEMPERATURA">Temperatura</option>
                  <option value="VIBRACAO">Vibração</option>
                  <option value="PRESSAO">Pressão</option>
                  <option value="CORRENTE">Corrente</option>
                  <option value="TENSAO">Tensão</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </label>
              <label>
                <span>Valor</span>
                <input
                  inputMode="decimal"
                  value={parameterValue}
                  onChange={(event) => setParameterValue(event.target.value)}
                  placeholder="0,00"
                />
              </label>
              <label>
                <span>Unidade</span>
                <input value={parameterUnit} onChange={(event) => setParameterUnit(event.target.value)} placeholder="h, °C, bar…" />
              </label>
              <label>
                <span>Componente</span>
                <select value={componentId} onChange={(event) => setComponentId(event.target.value)}>
                  <option value="">Equipamento geral</option>
                  {(context.componentes ?? []).map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.tag || component.id} — {component.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" onClick={() => void saveParameter()} disabled={savingParameter}>
              {savingParameter ? 'Registrando…' : 'Confirmar leitura'}
            </button>
          </article>
        )}

        {parameters.length > 0 ? (
          <div className="parameter-grid parameter-grid--real">
            {parameters.map((parameter) => (
              <article className="parameter-card parameter-card--real" key={parameter.id}>
                <div>
                  <strong>{displayParameterName(parameter.parametro)}</strong>
                  <span>{parameter.componente_id ? `Componente: ${parameter.componente_id}` : 'Equipamento geral'}</span>
                  <small>{formatDate(parameter.registrado_em || parameter.criado_em)}</small>
                </div>
                <div className="parameter-value">
                  {parameter.valor ?? '—'} {parameter.unidade || ''}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <article className="empty-panel qr-empty-panel">
            <strong>Nenhuma leitura registrada</strong>
            <p>Use “Registrar leitura” para incluir o primeiro parâmetro operacional.</p>
          </article>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Histórico do equipamento</h2>
            <p>Manutenções, componentes, lubrificações e demais eventos técnicos.</p>
          </div>
          <span>{context.historico_recente?.length ?? 0}</span>
        </div>

        {context.historico_recente?.length ? (
          <div className="history-list">
            {context.historico_recente.map((item) => (
              <article className="history-card" key={item.id}>
                <div>
                  <strong>{displayParameterName(item.evento || 'Evento técnico')}</strong>
                  <p>{item.descricao || 'Sem descrição.'}</p>
                  <small>{formatDate(item.criado_em)}</small>
                </div>
                <span className="history-status">{item.perfil || 'SISTEMA'}</span>
              </article>
            ))}
          </div>
        ) : (
          <article className="empty-panel qr-empty-panel">
            <strong>Histórico ainda vazio</strong>
            <p>Eventos de manutenção aparecerão aqui após os registros operacionais.</p>
          </article>
        )}
      </section>

      <div className="qr-next-actions">
        <button type="button" className="secondary-action" onClick={() => onNotify('Registro de ocorrência será ligado na próxima fase.')}>Informar ocorrência</button>
        <button type="button" className="danger-action" onClick={() => onNotify('Controle de parada será ligado na próxima fase.')}>Registrar parada</button>
      </div>
    </section>
  )
}

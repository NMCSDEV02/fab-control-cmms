import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AssetIcon,
  CameraIcon,
  CheckIcon,
  SearchIcon,
  WrenchIcon,
} from '../components/Icons'
import {
  getGestorAssetJourney,
  isGestorAuthenticationError,
  registerGestorParameter,
} from '../services/api/gestor'
import type { GestorAssetJourney } from '../types/gestor'

type BarcodeDetectorResult = { rawValue?: string }
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>
}
type BarcodeDetectorConstructor = new (options: {
  formats: string[]
}) => BarcodeDetectorInstance

const PARAMETER_OPTIONS = [
  { value: 'HORIMETRO', label: 'Horímetro', unit: 'h' },
  { value: 'TEMPERATURA', label: 'Temperatura', unit: '°C' },
  { value: 'VIBRACAO', label: 'Vibração', unit: 'mm/s' },
  { value: 'PRESSAO', label: 'Pressão', unit: 'bar' },
  { value: 'CORRENTE', label: 'Corrente', unit: 'A' },
  { value: 'TENSAO', label: 'Tensão', unit: 'V' },
] as const

interface GestorQrWorkspaceProps {
  onOpenAsset: (assetId: string) => void
  onSessionExpired: () => void
}

function formatDate(value?: string): string {
  if (!value) return 'Sem data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function humanize(value: unknown): string {
  const text = String(value ?? '').trim().replaceAll('_', ' ').toLocaleLowerCase('pt-BR')
  return text
    ? text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1)
    : 'Sem registro'
}

export function GestorQrWorkspace({
  onOpenAsset,
  onSessionExpired,
}: GestorQrWorkspaceProps) {
  const [query, setQuery] = useState('')
  const [journey, setJourney] = useState<GestorAssetJourney | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cameraActive, setCameraActive] = useState(true)
  const [cameraError, setCameraError] = useState('')
  const [parameterOpen, setParameterOpen] = useState(false)
  const [parameterName, setParameterName] =
    useState<(typeof PARAMETER_OPTIONS)[number]['value']>('HORIMETRO')
  const [parameterValue, setParameterValue] = useState('')
  const [componentId, setComponentId] = useState('')
  const [saving, setSaving] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)

  const parameterDefinition = useMemo(
    () => PARAMETER_OPTIONS.find((item) => item.value === parameterName) ??
      PARAMETER_OPTIONS[0],
    [parameterName],
  )

  const stopCamera = useCallback((updateState = true) => {
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current)
    scanTimerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (updateState) setCameraActive(false)
  }, [])

  const lookup = useCallback(async (rawValue: string) => {
    const payload = rawValue.trim()
    if (!payload || loading) return
    setLoading(true)
    setError('')
    try {
      const data = await getGestorAssetJourney(payload)
      if (!data.found || !data.ativo) {
        setJourney(null)
        setError('Nenhum equipamento ou componente foi encontrado para este código.')
        return
      }
      setJourney(data)
      setQuery(payload)
      setComponentId(data.componente?.id ?? '')
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setJourney(null)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível consultar o código informado.',
      )
    } finally {
      setLoading(false)
    }
  }, [loading, onSessionExpired])

  useEffect(() => () => stopCamera(false), [stopCamera])

  useEffect(() => {
    if (!cameraActive) return
    let cancelled = false

    async function startCamera() {
      const Detector = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector
      if (!Detector) {
        setCameraError('A leitura nativa não está disponível neste navegador. Digite o código abaixo.')
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
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new Detector({ formats: ['qr_code'] })

        const scan = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const results = await detector.detect(videoRef.current)
            const rawValue = results.find((item) => item.rawValue)?.rawValue?.trim()
            if (rawValue) {
              stopCamera()
              await lookup(rawValue)
              return
            }
          } catch {
            // Quadros sem QR fazem parte da leitura contínua.
          }
          scanTimerRef.current = window.setTimeout(() => void scan(), 350)
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

    void startCamera()
    return () => {
      cancelled = true
      stopCamera(false)
    }
  }, [cameraActive, lookup, stopCamera])

  async function saveParameter() {
    if (!journey?.ativo?.id || saving) return
    const value = Number(parameterValue.replace(',', '.'))
    if (!Number.isFinite(value)) {
      setError('Informe um valor numérico válido para registrar a leitura.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await registerGestorParameter({
        ativo_id: journey.ativo.id,
        componente_id: componentId || undefined,
        parametro: parameterName,
        valor: value,
        unidade: parameterDefinition.unit,
      })
      setParameterOpen(false)
      setParameterValue('')
      await lookup(query || journey.ativo.tag || journey.ativo.id)
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível registrar a leitura.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="content manager-qr-workspace">
      <header className="manager-qr-heading">
        <div>
          <span className="eyebrow">INSPEÇÃO EM CAMPO</span>
          <h1>Ler equipamento</h1>
          <p>Aponte para o QR Code ou informe a TAG para abrir o histórico técnico.</p>
        </div>
      </header>

      <section className="manager-qr-scanner">
        {cameraActive ? (
          <div className="manager-qr-camera">
            <video ref={videoRef} muted playsInline aria-label="Leitor de QR Code" />
            <span aria-hidden="true"><i /><i /><i /><i /></span>
            <b>Centralize o código</b>
          </div>
        ) : (
          <button
            className="manager-qr-camera manager-qr-camera--idle"
            type="button"
            onClick={() => {
              setCameraError('')
              setCameraActive(true)
            }}
          >
            <CameraIcon />
            <strong>Abrir câmera</strong>
            <span>Use a câmera traseira para ler a identificação do ativo.</span>
          </button>
        )}

        {cameraError ? <p className="manager-qr-camera-error">{cameraError}</p> : null}

        <form
          className="manager-qr-search"
          onSubmit={(event) => {
            event.preventDefault()
            stopCamera()
            void lookup(query)
          }}
        >
          <label>
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="TAG, código do equipamento ou componente"
              aria-label="Código do equipamento ou componente"
            />
          </label>
          <button type="submit" disabled={!query.trim() || loading}>
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
        </form>
      </section>

      {error ? <div className="dashboard-error" role="alert">{error}</div> : null}

      {journey?.ativo ? (
        <section className="manager-qr-result">
          <header>
            <span><AssetIcon /></span>
            <div>
              <small>{journey.ativo.tag || journey.ativo.id}</small>
              <h2>{journey.ativo.nome || 'Equipamento sem nome'}</h2>
              <p>
                {journey.componente
                  ? `${journey.componente.tag || journey.componente.id} · ${journey.componente.nome || 'Componente'}`
                  : journey.ativo.localizacao_tecnica || 'Equipamento completo'}
              </p>
            </div>
            <b className={journey.parada_ativa ? 'is-alert' : ''}>
              {journey.parada_ativa ? 'Em parada' : humanize(journey.ativo.status)}
            </b>
          </header>

          <div className="manager-qr-facts">
            <article>
              <small>Saúde</small>
              <strong>{journey.saude?.pct !== undefined ? `${journey.saude.pct}%` : 'Sem base'}</strong>
            </article>
            <article>
              <small>Ações abertas</small>
              <strong>{journey.acoes_pendentes.length}</strong>
            </article>
            <article>
              <small>Ocorrências</small>
              <strong>{journey.ocorrencias_abertas.length}</strong>
            </article>
            <article>
              <small>Última leitura</small>
              <strong>{formatDate(journey.parametros_recentes[0]?.registrado_em)}</strong>
            </article>
          </div>

          <section className="manager-qr-readings">
            <header>
              <div>
                <span className="eyebrow">PARÂMETROS ATUAIS</span>
                <h3>Leituras do equipamento</h3>
              </div>
              <button type="button" onClick={() => setParameterOpen(true)}>
                Registrar leitura
              </button>
            </header>
            <div>
              {journey.parametros_atuais.slice(0, 6).map((parameter) => (
                <article key={parameter.id}>
                  <small>{humanize(parameter.parametro)}</small>
                  <strong>{parameter.valor ?? '—'} <span>{parameter.unidade}</span></strong>
                  <p>{formatDate(parameter.registrado_em || parameter.criado_em)}</p>
                </article>
              ))}
              {!journey.parametros_atuais.length ? (
                <div className="manager-qr-empty">
                  <WrenchIcon />
                  <span>Nenhuma leitura registrada. Faça a primeira inspeção.</span>
                </div>
              ) : null}
            </div>
          </section>

          <footer>
            <button
              type="button"
              onClick={() => onOpenAsset(journey.ativo?.id ?? '')}
            >
              Abrir ficha completa
            </button>
          </footer>
        </section>
      ) : null}

      {parameterOpen && journey?.ativo ? (
        <div
          className="manager-qr-dialog-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!saving) setParameterOpen(false)
          }}
        >
          <section
            className="manager-qr-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-parameter-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">LEITURA RASTREÁVEL</span>
                <h2 id="manager-parameter-title">Registrar parâmetro</h2>
              </div>
              <button
                type="button"
                disabled={saving}
                aria-label="Fechar"
                onClick={() => setParameterOpen(false)}
              >×</button>
            </header>
            <div>
              <label>
                <span>Aplicar em</span>
                <select
                  value={componentId}
                  onChange={(event) => setComponentId(event.target.value)}
                >
                  <option value="">Equipamento completo</option>
                  {journey.componentes.map((component) => (
                    <option value={component.id} key={component.id}>
                      {component.tag || component.id} · {component.nome || 'Componente'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Parâmetro</span>
                <select
                  value={parameterName}
                  onChange={(event) => setParameterName(
                    event.target.value as (typeof PARAMETER_OPTIONS)[number]['value'],
                  )}
                >
                  {PARAMETER_OPTIONS.map((item) => (
                    <option value={item.value} key={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Valor ({parameterDefinition.unit})</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={parameterValue}
                  onChange={(event) => setParameterValue(event.target.value)}
                  autoFocus
                />
              </label>
            </div>
            <footer>
              <span><CheckIcon /> A leitura será vinculada ao seu usuário.</span>
              <button
                type="button"
                disabled={saving || !parameterValue.trim()}
                onClick={() => void saveParameter()}
              >
                {saving ? 'Registrando…' : 'Confirmar leitura'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  )
}

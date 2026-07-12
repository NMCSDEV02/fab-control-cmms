import { useState } from 'react'
import type { AssetSummary } from '../types/operator'
import { QrIcon, ScanIcon } from '../components/Icons'

export interface QrPageProps {
  asset: AssetSummary
  onNotify: (message: string) => void
}

function statusLabel(status: AssetSummary['history'][number]['status']) {
  if (status === 'CONCLUIDA') return 'Concluída'
  if (status === 'PROGRAMADA') return 'Programada'
  return 'Aguardando inspeção'
}

export function QrPage({ asset, onNotify }: QrPageProps) {
  const [identified, setIdentified] = useState(false)

  if (!identified) {
    return (
      <section className="screen qr-page">
        <header className="screen-heading">
          <span>Consulta técnica</span>
          <h1>Equipamento por QR Code</h1>
          <p>Consulte parâmetros, histórico e ações disponíveis para o ativo.</p>
        </header>

        <article className="empty-card">
          <span className="empty-card__icon">
            <QrIcon />
          </span>
          <h2>Ler QR Code do equipamento</h2>
          <p>Esta primeira fase utiliza uma leitura simulada para validar a interface.</p>
          <button type="button" onClick={() => setIdentified(true)}>
            <ScanIcon />
            Simular leitura
          </button>
        </article>
      </section>
    )
  }

  return (
    <section className="screen asset-page">
      <article className="asset-hero">
        <span className="status-chip status-chip--online">Equipamento identificado</span>
        <h1>
          {asset.id} — {asset.name}
        </h1>
        <p>{asset.location}</p>
        <div className="asset-state">
          <span>Status atual</span>
          <strong>{asset.status === 'OPERANDO' ? 'Operando' : 'Parado'}</strong>
        </div>
      </article>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Parâmetros cadastrados</h2>
            <p>Leituras operacionais definidas para o equipamento.</p>
          </div>
          <span>{asset.parameters.length}</span>
        </div>
        <div className="parameter-grid">
          {asset.parameters.map((parameter) => {
            const outside = parameter.value < parameter.min || parameter.value > parameter.max
            return (
              <article className="parameter-card" key={parameter.id}>
                <div>
                  <strong>{parameter.name}</strong>
                  <span>
                    Faixa: {parameter.min} a {parameter.max} {parameter.unit}
                  </span>
                  <small>{parameter.measuredAt}</small>
                </div>
                <div className={outside ? 'parameter-value parameter-value--alert' : 'parameter-value'}>
                  {parameter.value} {parameter.unit}
                </div>
                <button
                  type="button"
                  onClick={() => onNotify(`Medição de ${parameter.name} será ligada à API na próxima fase.`)}
                >
                  Medir agora
                </button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Histórico do equipamento</h2>
            <p>Manutenções, lubrificações e atividades programadas.</p>
          </div>
        </div>
        <div className="history-list">
          {asset.history.map((item) => (
            <article className="history-card" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <small>{item.date}</small>
              </div>
              <span className={`history-status history-status--${item.status.toLowerCase()}`}>
                {statusLabel(item.status)}
              </span>
            </article>
          ))}
        </div>
      </section>

      <div className="asset-actions">
        <button type="button" className="secondary-action" onClick={() => onNotify('Ocorrência aberta no modo de interface.')}>Informar ocorrência</button>
        <button type="button" className="danger-action" onClick={() => onNotify('Controle de parada será integrado ao back-end em etapa própria.')}>Iniciar parada</button>
      </div>
    </section>
  )
}

import type { EvidencePhotoUploadInput } from '../../types/api'

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.78

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler a imagem.'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Não foi possível processar ${file.name}.`))
    }
    image.src = url
  })
}

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} não é uma imagem.`)
  const image = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Navegador sem suporte para compactação da foto.')
  context.drawImage(image, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Falha ao compactar a foto.')),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export async function prepareEvidencePhoto(
  file: File,
  checklistExecutionId: string,
  observation: string,
): Promise<EvidencePhotoUploadInput> {
  const compressed = await compressImage(file)
  const base64 = await blobToBase64(compressed)
  const safeBase = file.name.replace(/\.[^.]+$/, '').trim() || 'evidencia'
  return {
    checklist_execucao_id: checklistExecutionId,
    nome_arquivo: `${safeBase}.jpg`,
    mime_type: 'image/jpeg',
    tamanho_bytes: compressed.size,
    base64_data: base64,
    observacao: observation,
  }
}

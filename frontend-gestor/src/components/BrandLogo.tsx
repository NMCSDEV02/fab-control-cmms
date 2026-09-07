import { useState } from 'react'

const officialBrandAsset = String(
  import.meta.env.VITE_VORQIX_BRAND_ASSET ?? '/assets/brand/vorqix-logo.png',
).trim()

interface BrandLogoProps {
  className?: string
  decorative?: boolean
}

/**
 * Mantém a marca oficial desacoplada da autenticação e permite uma URL de
 * distribuição específica por ambiente sem alterar os portais.
 */
export function BrandLogo({ className = '', decorative = false }: BrandLogoProps) {
  const [assetUnavailable, setAssetUnavailable] = useState(false)
  const showOfficialAsset = Boolean(officialBrandAsset) && !assetUnavailable

  return (
    <span
      className={`brand-logo ${className}`.trim()}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Logomarca VORQIX'}
      role={decorative ? undefined : 'img'}
      data-brand-placeholder={showOfficialAsset ? undefined : 'official-asset-pending'}
    >
      {showOfficialAsset ? (
        <img
          src={officialBrandAsset}
          alt=""
          onError={() => setAssetUnavailable(true)}
        />
      ) : null}
    </span>
  )
}

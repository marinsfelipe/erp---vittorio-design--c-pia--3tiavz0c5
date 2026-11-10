import React from 'react'
import logoSrc from '@/assets/logo-png-5b32d.png'
import { cn } from '@/lib/utils'

interface VittorioLogoProps {
  /** Altura desejada da imagem do logo em pixels ou classes tailwind */
  className?: string
  /** Se deve renderizar dentro de um cartão/moldura escura contrastante para fundos claros */
  surface?: 'auto' | 'dark-card' | 'dark-banner' | 'none'
  /** Tamanho pré-definido: sm (sidebar/header), md (login), lg */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Componente oficial de exibição da marca Vittorio Design.
 * Preserva proporção e qualidade do asset original sem redesenho nem recoloração.
 * Em superfícies claras, aplica moldura/faixa escura para garantir contraste dos tons dourados.
 */
export const VittorioLogo: React.FC<VittorioLogoProps> = ({
  className,
  surface = 'none',
  size = 'md',
}) => {
  const imageSizeClasses =
    size === 'sm'
      ? 'h-9 w-auto max-w-[130px]'
      : size === 'lg'
        ? 'h-24 w-auto max-w-[260px]'
        : 'h-16 w-auto max-w-[200px]'

  const imgElement = (
    <img
      src={logoSrc}
      alt="Vittorio Design"
      className={cn('object-contain shrink-0 transition-opacity', imageSizeClasses, className)}
      loading="eager"
    />
  )

  if (surface === 'dark-card') {
    return (
      <div className="inline-flex items-center justify-center p-3 sm:p-4 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-xl shadow-black/40">
        {imgElement}
      </div>
    )
  }

  if (surface === 'dark-banner') {
    return (
      <div className="w-full flex items-center justify-center py-4 px-6 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-xl shadow-black/40">
        {imgElement}
      </div>
    )
  }

  return imgElement
}

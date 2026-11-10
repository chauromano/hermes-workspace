import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PixelAvatar } from '@/components/agent-swarm/pixel-avatar'

export type ProfileAvatarProps = {
  name: string
  avatar?: string | null
  emoji?: string | null
  color?: string | null
  size?: number
  className?: string
  fallbackTextClassName?: string
}

export function ProfileAvatar({
  name,
  avatar,
  emoji,
  color,
  size = 24,
  className,
  fallbackTextClassName,
}: ProfileAvatarProps) {
  const [imgError, setImgError] = useState(false)

  if (avatar && !imgError) {
    if (avatar === 'pixel') {
      const pixelSize = Math.max(12, Math.round(size * 0.75))
      return (
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-white dark:border-neutral-700/60 dark:bg-neutral-900',
            className,
          )}
          style={{ width: size, height: size }}
        >
          <PixelAvatar size={pixelSize} color={color || '#6366f1'} />
        </span>
      )
    }

    return (
      <span
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 dark:border-white/10 bg-primary-100 dark:bg-neutral-800',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <img
          src={avatar}
          alt={name}
          className="size-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      </span>
    )
  }

  if (emoji) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-primary-100/80 text-center dark:bg-neutral-800',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <span
          className={cn('select-none leading-none', fallbackTextClassName)}
          style={{ fontSize: Math.max(10, Math.round(size * 0.55)) }}
        >
          {emoji}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold uppercase text-primary-600 dark:bg-primary-800 dark:text-primary-200',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) }}
    >
      {name ? name.slice(0, 1).toUpperCase() : '?'}
    </span>
  )
}

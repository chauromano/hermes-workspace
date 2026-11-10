import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { PixelAvatar } from '@/components/agent-swarm/pixel-avatar'

type AvatarProps = {
  size?: number
  className?: string
  src?: string
}

/**
 * Assistant avatar — displays the active agent profile picture or caduceus default.
 */
function AssistantAvatarComponent({ size = 28, className, src }: AvatarProps) {
  const profilesQuery = useQuery<{
    profiles?: Array<{ name: string; avatar?: string; color?: string; active?: boolean }>
    activeProfile?: string
  }>({
    queryKey: ['profiles', 'composer'],
    staleTime: 60_000,
  })

  const profilesData = profilesQuery.data
  const activeProfile = profilesData?.profiles?.find(
    (p) => p.name === profilesData.activeProfile || p.active,
  )

  const effectiveSrc = src || activeProfile?.avatar || '/claude-avatar.webp'

  if (effectiveSrc === 'pixel') {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-white dark:border-neutral-700 dark:bg-neutral-900',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <PixelAvatar size={Math.round(size * 0.8)} color={activeProfile?.color || '#6366f1'} />
      </span>
    )
  }

  return (
    <img
      src={effectiveSrc}
      alt={activeProfile?.name || 'Hermes Agent'}
      className={cn('shrink-0 object-cover', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.15)),
      }}
      onError={(e) => {
        ;(e.target as HTMLImageElement).src = '/claude-avatar.webp'
      }}
    />
  )
}

export const AssistantAvatar = memo(AssistantAvatarComponent)

'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { BrainIcon, CodeIcon, PuzzleIcon } from '@hugeicons/core-free-icons'
import { motion } from 'motion/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'

type ProfileSummary = {
  name: string
  model?: string
  description?: string
  avatarUrl?: string
  active?: boolean
}

type SuggestionChip = {
  label: string
  prompt: string
  icon: unknown
}

const SUGGESTIONS: Array<SuggestionChip> = [
  {
    label: 'Analyze workspace',
    prompt:
      'Analyze this workspace structure and give me 3 engineering risks. Use tools and keep it concise.',
    icon: CodeIcon,
  },
  {
    label: 'Save a preference',
    prompt:
      'Save this to memory exactly: "For demos, respond in 3 bullets max and put risk first." Then confirm saved.',
    icon: BrainIcon,
  },
  {
    label: 'Create a file',
    prompt: 'Create demo-checklist.md with 5 launch checks for this app.',
    icon: PuzzleIcon,
  },
]

type ChatEmptyStateProps = {
  onSuggestionClick?: (prompt: string) => void
  compact?: boolean
}

export function ChatEmptyState({
  onSuggestionClick,
  compact = false,
}: ChatEmptyStateProps) {
  const queryClient = useQueryClient()

  const profilesQuery = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/profiles/list')
      if (!res.ok) return { profiles: [], activeProfile: 'default' }
      return res.json() as Promise<{
        profiles: Array<ProfileSummary>
        activeProfile: string
      }>
    },
    staleTime: 30_000,
  })

  const profiles = profilesQuery.data?.profiles || []
  const activeProfile =
    profiles.find((p) => p.active) ||
    profiles.find((p) => p.name === profilesQuery.data?.activeProfile) ||
    profiles[0]

  const handleSelectProfile = async (name: string) => {
    hapticTap()
    try {
      await fetch('/api/profiles/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    } catch {}
  }

  const heroAvatar =
    activeProfile?.avatarUrl ||
    (activeProfile?.name === 'antigravity'
      ? '/antigravity-avatar.webp'
      : '/claude-avatar.webp')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex h-full flex-col items-center justify-center px-4 py-8 overflow-y-auto"
    >
      <div className="flex max-w-xl w-full flex-col items-center text-center">
        {/* Avatar in editorial frame, no glow — architectural restraint */}
        <div className="relative mb-4">
          <img
            src={heroAvatar}
            alt={activeProfile?.name || 'Hermes Agent'}
            className="relative size-20 rounded-xl object-cover shadow-sm"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).src = '/claude-avatar.webp'
            }}
            style={{
              border: '1px solid var(--theme-border)',
              padding: '4px',
              background: 'var(--theme-card)',
            }}
          />
        </div>

        {/* Editorial micro-label */}
        <p
          className="micro-label mb-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--theme-muted)' }}
        >
          Hermes Workspace
        </p>

        {/* Editorial display title */}
        <h2
          className="editorial-display text-3xl font-bold tracking-tight"
          style={{ color: 'var(--theme-text)' }}
        >
          Begin a session
        </h2>

        {activeProfile && (
          <span className="mt-1.5 text-xs font-medium" style={{ color: 'var(--theme-accent)' }}>
            @{activeProfile.name}
            {activeProfile.model ? ` · ${activeProfile.model.split('/').pop()}` : ''}
          </span>
        )}

        {!compact && (
          <p className="mt-2 text-xs" style={{ color: 'var(--theme-muted)' }}>
            Select a specialized profile or pick a starter prompt below
          </p>
        )}

        {/* Profile Picker Cards */}
        {profiles.length > 0 && (
          <div className="mt-5 w-full">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-400 dark:text-neutral-500 mb-2 text-left">
              Choose Persona
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-left">
              {profiles.map((p) => {
                const isSelected = p.name === activeProfile?.name
                const avatar =
                  p.avatarUrl ||
                  (p.name === 'antigravity'
                    ? '/antigravity-avatar.webp'
                    : '/claude-avatar.webp')

                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => void handleSelectProfile(p.name)}
                    className={cn(
                      'group flex items-start gap-2.5 rounded-xl p-2.5 transition-all text-left border cursor-pointer select-none',
                      isSelected
                        ? 'border-accent-500/60 bg-accent-500/10 shadow-xs ring-1 ring-accent-500/30'
                        : 'border-primary-200/60 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 hover:border-primary-300 dark:hover:border-neutral-700 hover:bg-primary-50/50 dark:hover:bg-neutral-800/50'
                    )}
                  >
                    <img
                      src={avatar}
                      alt={p.name}
                      className="size-8 rounded-full object-cover shrink-0 mt-0.5 border border-primary-200 dark:border-neutral-700"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).src = '/claude-avatar.webp'
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            'text-xs font-semibold truncate',
                            isSelected
                              ? 'text-accent-600 dark:text-accent-400'
                              : 'text-primary-900 dark:text-neutral-200'
                          )}
                        >
                          @{p.name}
                        </span>
                      </div>
                      {p.model && (
                        <span className="block text-[10px] text-primary-400 dark:text-neutral-500 truncate font-mono">
                          {p.model.split('/').pop()}
                        </span>
                      )}
                      {p.description && (
                        <span className="block text-[10px] text-primary-500 dark:text-neutral-400 truncate mt-0.5 line-clamp-1">
                          {p.description}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Prompt chips */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onSuggestionClick?.(suggestion.prompt)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                background: 'var(--theme-card)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--theme-card2)'
                e.currentTarget.style.borderColor = 'var(--theme-accent-border)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--theme-card)'
                e.currentTarget.style.borderColor = 'var(--theme-border)'
              }}
            >
              <HugeiconsIcon
                icon={suggestion.icon as any}
                size={14}
                strokeWidth={1.5}
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>{suggestion.label}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

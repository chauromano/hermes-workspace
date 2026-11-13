import { HugeiconsIcon } from '@hugeicons/react'
import { BrainIcon, CodeIcon, PuzzleIcon } from '@hugeicons/core-free-icons'
import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { formatModelName } from '@/lib/format-model-name'
import { ProfileAvatar } from '@/components/avatars'

type ProfileSummary = {
  name: string
  model?: string
  active?: boolean
  avatar?: string
  emoji?: string
  color?: string
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
  model?: string
  profile?: ProfileSummary | null
}

export function ChatEmptyState({
  onSuggestionClick,
  compact = false,
  model,
  profile,
}: ChatEmptyStateProps) {
  const profilesQuery = useQuery({
    queryKey: ['profiles', 'composer'],
    queryFn: async () => {
      const res = await fetch('/api/profiles/list')
      if (!res.ok) return { profiles: [] }
      return (await res.json()) as { profiles?: Array<ProfileSummary>; activeProfile?: string }
    },
    staleTime: 30_000,
  })

  const activeProfile =
    profile ??
    profilesQuery.data?.profiles?.find((p) => p.active || p.name === profilesQuery.data?.activeProfile)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex h-full flex-col items-center justify-center px-4 py-8"
    >
      <div className="flex max-w-xl flex-col items-center text-center">
        {/* Avatar in editorial frame, no glow — architectural restraint */}
        <div className="relative mb-6">
          <ProfileAvatar
            name={activeProfile?.name || 'Hermes Agent'}
            avatar={activeProfile?.avatar || '/claude-avatar.webp'}
            emoji={activeProfile?.emoji}
            color={activeProfile?.color}
            size={80}
            className="rounded-xl border border-[var(--theme-border)] p-1 bg-[var(--theme-card)] shadow-sm"
          />
        </div>

        {/* Editorial micro-label */}
        <p
          className="micro-label mb-2"
          style={{ color: 'var(--theme-muted)' }}
        >
          Hermes Workspace
        </p>

        {/* Editorial display title */}
        <h2
          className="editorial-display text-3xl"
          style={{ color: 'var(--theme-text)' }}
        >
          Begin a session
        </h2>

        {activeProfile && (
          <span className="mt-2 text-xs" style={{ color: 'var(--theme-accent)' }}>
            {activeProfile.name}
            {model || activeProfile.model
              ? ` · ${formatModelName(model || activeProfile.model)}`
              : ''}
          </span>
        )}

        {!compact && (
          <>
            <p className="mt-3 text-sm" style={{ color: 'var(--theme-muted)' }}>
              Agent chat · live tools · memory · full observability
            </p>
          </>
        )}

        {/* Prompt chips */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onSuggestionClick?.(suggestion.prompt)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-all"
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
              {suggestion.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

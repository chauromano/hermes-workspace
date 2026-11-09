'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { PinIcon } from '@hugeicons/core-free-icons'
import { memo, useMemo } from 'react'
import { SessionItem } from './session-item'
import type { SessionMeta } from '../../types'
import {
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'

type SidebarSessionsProps = {
  sessions: Array<SessionMeta>
  activeFriendlyId: string
  defaultOpen?: boolean
  onSelect?: () => void
  onRename: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
  loading: boolean
  fetching: boolean
  error: string | null
  onRetry: () => void
}

export const SidebarSessions = memo(function SidebarSessions({
  sessions,
  activeFriendlyId,
  defaultOpen = true,
  onSelect,
  onRename,
  onDelete,
  loading,
  fetching,
  error,
  onRetry,
}: SidebarSessionsProps) {
  const { pinnedSessionKeys, togglePinnedSession } = usePinnedSessions()

  const [pinnedSessions, unpinnedSessions] = useMemo(() => {
    const pinnedKeys = new Set(pinnedSessionKeys)
    const pinned: Array<SessionMeta> = []
    const unpinned: Array<SessionMeta> = []
    for (const session of sessions) {
      if (pinnedKeys.has(session.key)) {
        pinned.push(session)
      } else {
        unpinned.push(session)
      }
    }
    return [pinned, unpinned] as const
  }, [pinnedSessionKeys, sessions])

  function handleTogglePin(session: SessionMeta) {
    togglePinnedSession(session.key)
  }

  return (
    <div className="flex h-full flex-col flex-1 min-h-0 w-full">
      <ScrollAreaRoot className="flex-1 min-h-0">
        <ScrollAreaViewport className="min-h-0">
          <div className="flex flex-col gap-1 px-1 py-1">
            {/* Pinned sessions */}
            {pinnedSessions.length > 0 ? (
              <div className="flex flex-col gap-1 pb-1">
                <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-500 select-none">
                  <HugeiconsIcon icon={PinIcon} size={12} strokeWidth={2} />
                  <span>Pinned</span>
                </div>
                {pinnedSessions.map((session) => (
                  <SessionItem
                    key={session.key}
                    session={session}
                    active={session.friendlyId === activeFriendlyId}
                    isPinned
                    onSelect={onSelect}
                    onTogglePin={handleTogglePin}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
                {unpinnedSessions.length > 0 ? (
                  <div className="my-1.5 mx-2 border-t border-primary-200/60 dark:border-primary-800/40" />
                ) : null}
              </div>
            ) : null}

            {/* Recent / Unpinned sessions */}
            {unpinnedSessions.length > 0 ? (
              <div className="flex flex-col gap-1">
                {pinnedSessions.length > 0 ? (
                  <div className="flex items-center gap-1.5 px-2.5 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400 select-none">
                    <span>Recent</span>
                  </div>
                ) : null}
                {unpinnedSessions.map((session) => (
                  <SessionItem
                    key={session.key}
                    session={session}
                    active={session.friendlyId === activeFriendlyId}
                    isPinned={false}
                    onSelect={onSelect}
                    onTogglePin={handleTogglePin}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            ) : pinnedSessions.length === 0 ? (
              <div className="px-3 py-6 text-xs text-primary-500 text-center">
                {loading ? 'Loading sessions…' : 'No sessions yet. Start a conversation.'}
              </div>
            ) : null}

            {loading && (
              <div className="px-3 py-2 text-xs text-primary-500">
                Loading sessions…
              </div>
            )}
            {error && (
              <div className="px-3 py-2 text-xs text-primary-500">
                <div className="mb-2">Failed to load sessions.</div>
                <div className="text-[11px] opacity-80">{error}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={onRetry}
                >
                  Retry
                </Button>
              </div>
            )}
            {fetching && !loading && !error && sessions.length > 0 ? (
              <div className="px-3 py-1 text-[11px] text-primary-400">
                Updating…
              </div>
            ) : null}
          </div>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollAreaRoot>
    </div>
  )
}, areSidebarSessionsEqual)

function areSidebarSessionsEqual(
  prev: SidebarSessionsProps,
  next: SidebarSessionsProps,
) {
  if (prev.activeFriendlyId !== next.activeFriendlyId) return false
  if (prev.defaultOpen !== next.defaultOpen) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onRename !== next.onRename) return false
  if (prev.onDelete !== next.onDelete) return false
  if (prev.loading !== next.loading) return false
  if (prev.fetching !== next.fetching) return false
  if (prev.error !== next.error) return false
  if (prev.onRetry !== next.onRetry) return false
  if (prev.sessions === next.sessions) return true
  if (prev.sessions.length !== next.sessions.length) return false
  for (let i = 0; i < prev.sessions.length; i += 1) {
    const prevSession = prev.sessions[i]
    const nextSession = next.sessions[i]
    if (prevSession.key !== nextSession.key) return false
    if (prevSession.friendlyId !== nextSession.friendlyId) return false
    if (prevSession.label !== nextSession.label) return false
    if (prevSession.title !== nextSession.title) return false
    if (prevSession.derivedTitle !== nextSession.derivedTitle) return false
    if (prevSession.updatedAt !== nextSession.updatedAt) return false
    if (prevSession.titleStatus !== nextSession.titleStatus) return false
    if (prevSession.titleSource !== nextSession.titleSource) return false
    if (prevSession.titleError !== nextSession.titleError) return false
  }
  return true
}

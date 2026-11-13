import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { chatQueryKeys, fetchSessions } from '../chat-queries'
import { isRecentSession } from '../pending-send'
import { filterSessionsWithTombstones } from '../session-tombstones'
import { useSessionTitles } from '../session-title-store'
import type { SessionTitleInfo } from '../session-title-store'
import type { SessionMeta } from '../types'

function mergeSessionTitle(
  session: SessionMeta,
  stored: SessionTitleInfo | undefined,
): SessionMeta {
  if (!stored) return session

  const hasManualTitle = Boolean(session.label || session.title)
  const derivedTitle = hasManualTitle
    ? session.derivedTitle
    : (stored.title ?? session.derivedTitle)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
  const titleStatus = stored.status ?? session.titleStatus
  const titleSource = hasManualTitle
    ? 'manual'
    : (stored.source ?? session.titleSource)
  const titleError = stored.error ?? session.titleError

  return {
    ...session,
    derivedTitle,
    titleStatus,
    titleSource,
    titleError,
  }
}

function buildSyntheticActiveSession(
  activeFriendlyId: string,
  forcedSessionKey: string | undefined,
  stored: SessionTitleInfo | undefined,
  cachedSession?: SessionMeta | null,
): SessionMeta | null {
  if (!activeFriendlyId || activeFriendlyId === 'new') return null

  const derivedTitle =
    stored?.title ??
    cachedSession?.title ??
    cachedSession?.derivedTitle ??
    (activeFriendlyId === 'main' ? 'Hermes' : 'New Session')

  return {
    key: forcedSessionKey || activeFriendlyId,
    friendlyId: activeFriendlyId,
    label: cachedSession?.label,
    title: cachedSession?.title,
    derivedTitle,
    updatedAt: cachedSession?.updatedAt ?? Date.now(),
    titleStatus: stored?.status ?? cachedSession?.titleStatus ?? 'idle',
    titleSource: stored?.source ?? cachedSession?.titleSource,
    titleError: stored?.error ?? cachedSession?.titleError,
    projectId: cachedSession?.projectId ?? null,
    projectName: cachedSession?.projectName ?? null,
    profileName: cachedSession?.profileName ?? null,
    profile: cachedSession?.profile ?? null,
  }
}

type UseChatSessionsInput = {
  activeFriendlyId: string
  isNewChat: boolean
  forcedSessionKey?: string
}

export function useChatSessions({
  activeFriendlyId,
  isNewChat,
  forcedSessionKey,
}: UseChatSessionsInput) {
  const queryClient = useQueryClient()
  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    staleTime: 3_000,
    gcTime: 5 * 60_000,
    refetchInterval: 5_000,
  })
  const storedTitles = useSessionTitles()

  const sessions = useMemo(() => {
    const rawSessions = sessionsQuery.data ?? []
    const filtered = filterSessionsWithTombstones(rawSessions)
    const merged = filtered.map((session) =>
      mergeSessionTitle(session, storedTitles[session.friendlyId]),
    )
    const activeAlreadyPresent = merged.some(
      (session) =>
        session.friendlyId === activeFriendlyId ||
        session.key === activeFriendlyId ||
        session.declaredKey === activeFriendlyId,
    )

    if (!activeAlreadyPresent && (forcedSessionKey || isRecentSession(activeFriendlyId))) {
      const existingInCache = (
        queryClient.getQueryData(chatQueryKeys.sessions) as SessionMeta[] | undefined
      )?.find(
        (s) =>
          s.friendlyId === activeFriendlyId ||
          s.key === activeFriendlyId ||
          s.declaredKey === activeFriendlyId,
      )
      const synthetic = buildSyntheticActiveSession(
        activeFriendlyId,
        forcedSessionKey,
        storedTitles[activeFriendlyId],
        existingInCache,
      )
      if (synthetic) {
        merged.unshift(synthetic)
      }
    }

    return merged.sort((a, b) => {
      const aTs = a.updatedAt ?? 0
      const bTs = b.updatedAt ?? 0
      return bTs - aTs
    })
  }, [
    activeFriendlyId,
    forcedSessionKey,
    queryClient,
    sessionsQuery.data,
    storedTitles,
  ])

  const activeSession = useMemo(() => {
    return sessions.find(
      (session) =>
        session.friendlyId === activeFriendlyId ||
        session.key === activeFriendlyId ||
        session.declaredKey === activeFriendlyId,
    )
  }, [sessions, activeFriendlyId])
  const activeExists = useMemo(() => {
    if (isNewChat) return true
    if (forcedSessionKey) return true
    if (isRecentSession(activeFriendlyId)) return true
    return sessions.some(
      (session) =>
        session.friendlyId === activeFriendlyId ||
        session.key === activeFriendlyId ||
        session.declaredKey === activeFriendlyId,
    )
  }, [activeFriendlyId, forcedSessionKey, isNewChat, sessions])
  const activeSessionKey = activeSession?.key ?? ''
  const activeTitle = useMemo(() => {
    if (activeSession) {
      if (activeSession.label) return activeSession.label
      if (activeSession.title) return activeSession.title
      if (activeSession.derivedTitle) return activeSession.derivedTitle
      if (activeSession.titleStatus === 'generating') return 'Naming…'
      if (activeSession.titleStatus === 'error') return 'New Session'
      return 'New Session'
    }
    return activeFriendlyId === 'main' ? 'Hermes' : activeFriendlyId
  }, [activeFriendlyId, activeSession])

  const sessionsError =
    sessionsQuery.error instanceof Error ? sessionsQuery.error.message : null
  const sessionsLoading = sessionsQuery.isLoading && !sessionsQuery.data
  const sessionsFetching = sessionsQuery.isFetching

  return {
    sessionsQuery,
    sessions,
    activeSession,
    activeExists,
    activeSessionKey,
    activeTitle,
    sessionsError,
    sessionsLoading,
    sessionsFetching,
    refetchSessions: sessionsQuery.refetch,
  }
}

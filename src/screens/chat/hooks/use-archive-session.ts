import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { chatQueryKeys } from '../chat-queries'
import type { SessionMeta } from '../types'

export function useArchiveSession() {
  const queryClient = useQueryClient()
  const [archiving, setArchiving] = useState(false)

  const mutation = useMutation({
    mutationFn: async ({ key, archive }: { key: string; archive: boolean }) => {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', key, archive }),
      })
      if (!res.ok) throw new Error('Failed to archive session')
      return { key, archive }
    },
    onMutate: async ({ key, archive }) => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.sessions })
      queryClient.setQueryData<SessionMeta[] | { sessions: SessionMeta[] }>(
        chatQueryKeys.sessions,
        (old) => {
          if (!old) return old
          if (Array.isArray(old)) {
            return old.map((s) =>
              s.key === key || s.friendlyId === key
                ? { ...s, archived: archive }
                : s,
            )
          }
          if ('sessions' in old && Array.isArray(old.sessions)) {
            return {
              ...old,
              sessions: old.sessions.map((s) =>
                s.key === key || s.friendlyId === key
                  ? { ...s, archived: archive }
                  : s,
              ),
            }
          }
          return old
        },
      )
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
    },
  })

  const toggleArchive = useCallback(
    async (session: SessionMeta) => {
      const key = session.key || session.friendlyId
      const targetArchive = !session.archived
      setArchiving(true)
      try {
        await mutation.mutateAsync({ key, archive: targetArchive })
      } finally {
        setArchiving(false)
      }
    },
    [mutation],
  )

  return { toggleArchive, archiving }
}

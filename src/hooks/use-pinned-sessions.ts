import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type PinnedSessionsState = {
  pinnedSessionKeys: Array<string>
  isLoaded: boolean
  setPinnedSessionKeys: (keys: Array<string>) => void
  pinSession: (key: string) => void
  unpinSession: (key: string) => void
  togglePinnedSession: (key: string) => void
  isSessionPinned: (key: string) => boolean
  syncWithServer: () => Promise<void>
}

async function syncPinnedToServer(
  action: 'toggle' | 'set' | 'pin' | 'unpin',
  payload: { key?: string; pinnedSessionKeys?: string[] },
) {
  try {
    const res = await fetch('/api/pinned-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    if (res.ok) {
      const data = (await res.json()) as { pinnedSessionKeys?: string[] }
      if (Array.isArray(data.pinnedSessionKeys)) {
        usePinnedSessionsStore
          .getState()
          .setPinnedSessionKeys(data.pinnedSessionKeys)
      }
    }
  } catch {
    // Fallback: try posting to /api/sessions with action toggle-pin or pinnedSessionKeys
    try {
      const fallbackAction = action === 'toggle' ? 'toggle-pin' : action
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: fallbackAction, ...payload }),
      })
    } catch {
      // Keep optimistic client state
    }
  }
}

export const usePinnedSessionsStore = create<PinnedSessionsState>()(
  persist(
    (set, get) => ({
      pinnedSessionKeys: [],
      isLoaded: false,
      setPinnedSessionKeys: (keys) => {
        const unique = Array.from(
          new Set(
            keys.filter(
              (k): k is string => typeof k === 'string' && k.trim().length > 0,
            ),
          ),
        )
        set({ pinnedSessionKeys: unique, isLoaded: true })
      },
      pinSession: (key) => {
        if (!key) return
        set((state) => {
          if (state.pinnedSessionKeys.includes(key)) return state
          const updated = [...state.pinnedSessionKeys, key]
          void syncPinnedToServer('pin', { key })
          return { pinnedSessionKeys: updated }
        })
      },
      unpinSession: (key) => {
        if (!key) return
        set((state) => {
          const updated = state.pinnedSessionKeys.filter(
            (pinnedKey) => pinnedKey !== key,
          )
          void syncPinnedToServer('unpin', { key })
          return { pinnedSessionKeys: updated }
        })
      },
      togglePinnedSession: (key) => {
        if (!key) return
        const isCurrentlyPinned = get().isSessionPinned(key)
        if (isCurrentlyPinned) {
          get().unpinSession(key)
        } else {
          get().pinSession(key)
        }
      },
      isSessionPinned: (key) => {
        if (!key) return false
        return get().pinnedSessionKeys.includes(key)
      },
      syncWithServer: async () => {
        try {
          const res = await fetch('/api/pinned-sessions', {
            cache: 'no-store',
          })
          if (res.ok) {
            const data = (await res.json()) as { pinnedSessionKeys?: string[] }
            if (Array.isArray(data.pinnedSessionKeys)) {
              get().setPinnedSessionKeys(data.pinnedSessionKeys)
              return
            }
          }
        } catch {
          // If pinned-sessions route isn't reachable yet, try sessions
          try {
            const res = await fetch('/api/sessions', { cache: 'no-store' })
            if (res.ok) {
              const data = (await res.json()) as {
                pinnedSessionKeys?: string[]
              }
              if (Array.isArray(data.pinnedSessionKeys)) {
                get().setPinnedSessionKeys(data.pinnedSessionKeys)
              }
            }
          } catch {
            // keep current local state
          }
        }
      },
    }),
    {
      name: 'pinned-sessions',
      onRehydrateStorage: () => (state) => {
        if (typeof window !== 'undefined') {
          void state?.syncWithServer()
        }
      },
    },
  ),
)

// Initial client-side trigger to ensure synchronization on app load
if (typeof window !== 'undefined') {
  void usePinnedSessionsStore.getState().syncWithServer()
}

export function usePinnedSessions() {
  const pinnedSessionKeys = usePinnedSessionsStore((s) => s.pinnedSessionKeys)
  const togglePinnedSession = usePinnedSessionsStore(
    (s) => s.togglePinnedSession,
  )
  const pinSession = usePinnedSessionsStore((s) => s.pinSession)
  const unpinSession = usePinnedSessionsStore((s) => s.unpinSession)
  const isSessionPinned = usePinnedSessionsStore((s) => s.isSessionPinned)
  const syncWithServer = usePinnedSessionsStore((s) => s.syncWithServer)

  return {
    pinnedSessionKeys,
    togglePinnedSession,
    pinSession,
    unpinSession,
    isSessionPinned,
    syncWithServer,
  }
}

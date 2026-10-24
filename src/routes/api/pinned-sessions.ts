import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  pinServerSession,
  readPinnedSessions,
  toggleServerPinnedSession,
  unpinServerSession,
  writePinnedSessions,
} from '../../server/pinned-sessions-store'

export const Route = createFileRoute('/api/pinned-sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const pinnedSessionKeys = readPinnedSessions()
        return json({ ok: true, pinnedSessionKeys })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const body = (await request.json().catch(() => ({}))) as {
            action?: string
            key?: string
            pinnedSessionKeys?: string[]
          }

          if (body.action === 'toggle' && typeof body.key === 'string') {
            const result = toggleServerPinnedSession(body.key)
            return json({ ok: true, ...result })
          }

          if (body.action === 'pin' && typeof body.key === 'string') {
            const updated = pinServerSession(body.key)
            return json({ ok: true, isPinned: true, pinnedSessionKeys: updated })
          }

          if (body.action === 'unpin' && typeof body.key === 'string') {
            const updated = unpinServerSession(body.key)
            return json({ ok: true, isPinned: false, pinnedSessionKeys: updated })
          }

          if (Array.isArray(body.pinnedSessionKeys)) {
            const finalKeys = writePinnedSessions(body.pinnedSessionKeys)
            return json({ ok: true, pinnedSessionKeys: finalKeys })
          }

          if (typeof body.key === 'string') {
            const result = toggleServerPinnedSession(body.key)
            return json({ ok: true, ...result })
          }

          const pinnedSessionKeys = readPinnedSessions()
          return json({ ok: true, pinnedSessionKeys })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { listChildSessions, getSessionActivityMetaMap } from '../../../server/projects-backend'
import { listAllActiveRuns } from '../../../server/run-store'

export const Route = createFileRoute('/api/sessions/side-tasks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const parentSessionKey = url.searchParams.get('parentSessionKey')?.trim()

          if (!parentSessionKey) {
            return json({ ok: false, error: 'parentSessionKey query parameter required' }, { status: 400 })
          }

          const rawChildSessions = listChildSessions(parentSessionKey)
          const childIds = rawChildSessions.map((c) => c.id)

          const [activeRuns, activityMap] = await Promise.all([
            listAllActiveRuns().catch(() => []),
            Promise.resolve(getSessionActivityMetaMap(childIds)),
          ])

          const activeRunSessionIds = new Set(
            activeRuns.map((r) => r.sessionKey || r.friendlyId).filter(Boolean),
          )

          const enriched = rawChildSessions.map((child) => {
            const isActive =
              activeRunSessionIds.has(child.id) ||
              Boolean(activityMap.get(child.id)?.hasActiveLease)

            return {
              id: child.id,
              key: child.id,
              title: child.title,
              profileName: child.profile_name || 'default',
              startedAt: child.started_at ? Math.floor(child.started_at * 1000) : Date.now(),
              lastActivityAt: child.last_activity_at ? Math.floor(child.last_activity_at * 1000) : null,
              messageCount: child.message_count || 0,
              toolCallCount: child.tool_call_count || 0,
              status: isActive ? 'active' : 'idle',
              lastAssistantMessage: child.lastAssistantMessage || null,
            }
          })

          return json({
            ok: true,
            parentSessionKey,
            sideTasks: enriched,
          })
        } catch (err: any) {
          console.error('[side-tasks] Error listing side tasks:', err)
          return json({ ok: false, error: err?.message || 'Failed to list side tasks' }, { status: 500 })
        }
      },
    },
  },
})

import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  pinServerSession,
  readPinnedSessions,
  toggleServerPinnedSession,
  unpinServerSession,
  writePinnedSessions,
} from '../../server/pinned-sessions-store'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  createSession,
  deleteSession,
  ensureGatewayProbed,
  getGatewayCapabilities,
  listSessions,
  toSessionSummary,
  updateSession,
} from '../../server/claude-api'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'
import { findProjectForPath, getSessionCwdMap, extractPathFromDirective, listProjects, setSessionProject, readSessionsFromStateDb } from '../../server/projects-backend'
import { saveWorkspaceSelection } from './workspace'
import {
  deleteLocalSession,
  getLocalSession,
  listLocalSessions,
  updateLocalSessionTitle,
} from '../../server/local-session-store'

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth check
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Trigger background reprobe without blocking the request
        void ensureGatewayProbed().catch(() => {})

        try {
          let gatewaySessions: any[] = []

          // 1. Try listing sessions via gateway API (with 2.5s timeout)
          try {
            const listPromise = listSessions(50, 0)
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Gateway listSessions timeout')), 2500)
            )
            const sessions = await Promise.race([listPromise, timeoutPromise])
            gatewaySessions = (sessions || []).map(toSessionSummary)
          } catch {}

          // 2. If gateway failed, timed out, or returned 0 items, read directly from state.db
          if (gatewaySessions.length === 0) {
            gatewaySessions = readSessionsFromStateDb(50) as any[]
          }

          // Merge local portable sessions (Ollama, Atomic Chat, etc.)
          const localSessions = listLocalSessions()
          const gatewayIds = new Set(gatewaySessions.map((s: any) => s.key || s.id))
          for (const ls of localSessions) {
            if (!gatewayIds.has(ls.id)) {
              gatewaySessions.push({
                key: ls.id,
                id: ls.id,
                friendlyId: ls.id,
                title: ls.title || 'Local Chat',
                label: ls.title || 'Local Chat',
                derivedTitle: ls.title || 'Local Chat',
                startedAt: ls.createdAt,
                updatedAt: ls.updatedAt,
                message_count: ls.messageCount,
                model: ls.model,
                source: 'local',
              } as any)
            }
          }

          const pinnedSessionKeys = readPinnedSessions()
          const pinnedSet = new Set(pinnedSessionKeys)
          for (const s of gatewaySessions as any[]) {
            s.isPinned =
              Boolean(s.isPinned) ||
              pinnedSet.has(s.key) ||
              pinnedSet.has(s.friendlyId) ||
              pinnedSet.has(s.id)
          }

          const sessionIds = gatewaySessions.map((s: any) => String(s.key || s.friendlyId || s.id))
          const cwdMap = getSessionCwdMap(sessionIds)
          const { projects: allProjects } = listProjects({ includeArchived: true })

          for (const s of gatewaySessions as any[]) {
            const sid = String(s.key || s.friendlyId || s.id)
            const cwd = s.cwd || cwdMap.get(sid) || extractPathFromDirective(s.preview) || null
            const project = findProjectForPath(cwd, allProjects)
            s.cwd = cwd
            s.projectId = project?.id ?? null
            s.projectName = project?.name ?? null
            s.projectSlug = project?.slug ?? null
          }

          return json({ sessions: gatewaySessions, pinnedSessionKeys })
        } catch (err) {
          // Robust fallback to state.db even on unexpected processing errors
          try {
            const fallbackSessions = readSessionsFromStateDb(50) as any[]
            const { projects: allProjects } = listProjects({ includeArchived: true })
            for (const s of fallbackSessions) {
              const project = findProjectForPath(s.cwd, allProjects)
              s.projectId = project?.id ?? null
              s.projectName = project?.name ?? null
              s.projectSlug = project?.slug ?? null
            }
            return json({ sessions: fallbackSessions, pinnedSessionKeys: [] })
          } catch {}

          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheckPost = requireJsonContentType(request)
        if (csrfCheckPost) return csrfCheckPost
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.sessions) {
          const friendlyId = randomUUID()
          return json({
            ...createCapabilityUnavailablePayload('sessions'),
            ok: true,
            sessionKey: friendlyId,
            friendlyId,
            persisted: false,
          })
        }
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          if (body.action === 'toggle-pin' && typeof body.key === 'string') {
            const result = toggleServerPinnedSession(body.key)
            return json({ ok: true, ...result })
          }

          if (Array.isArray(body.pinnedSessionKeys)) {
            const finalKeys = writePinnedSessions(body.pinnedSessionKeys as string[])
            return json({ ok: true, pinnedSessionKeys: finalKeys })
          }

          const requestedLabel =
            typeof body.label === 'string' ? body.label.trim() : ''
          const label = requestedLabel || undefined

          const requestedFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const friendlyId = requestedFriendlyId || randomUUID()

          const requestedModel =
            typeof body.model === 'string' ? body.model.trim() : ''
          const model = requestedModel || undefined

          if (capabilities.dashboard.available && !capabilities.enhancedChat) {
            return json({
              ok: true,
              sessionKey: friendlyId,
              friendlyId,
              entry: {
                key: friendlyId,
                id: friendlyId,
                title: label || friendlyId,
                label: label || friendlyId,
                derivedTitle: label || friendlyId,
                model: model || '',
                startedAt: Date.now(),
                updatedAt: Date.now(),
                message_count: 0,
                source: 'dashboard',
              },
              modelApplied: Boolean(model),
              persisted: false,
            })
          }

          const session = await createSession({
            id: friendlyId || randomUUID(),
            title: label,
            model,
          })

          return json({
            ok: true,
            sessionKey: session.id,
            friendlyId: session.id,
            entry: toSessionSummary(session),
            modelApplied: true,
          })
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
      PATCH: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheckPatch = requireJsonContentType(request)
        if (csrfCheckPatch) return csrfCheckPatch
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.sessions) {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const rawFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const sessionKey = rawSessionKey || rawFriendlyId || randomUUID()

          return json({
            ...createCapabilityUnavailablePayload('sessions'),
            ok: true,
            sessionKey,
            friendlyId: rawFriendlyId || sessionKey,
            updated: false,
          })
        }
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const rawFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const label =
            typeof body.label === 'string' ? body.label.trim() : undefined
          const sessionKey = rawSessionKey || rawFriendlyId

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          if (body.projectId !== undefined) {
            const targetProjectId = typeof body.projectId === 'string' && body.projectId.trim() ? body.projectId.trim() : null
            const projectRes = setSessionProject(sessionKey, targetProjectId)
            if (projectRes.cwd) {
              void saveWorkspaceSelection({ path: projectRes.cwd, name: projectRes.projectName }).catch(() => {})
            }
            return json({
              ok: true,
              sessionKey,
              friendlyId: rawFriendlyId || sessionKey,
              entry: {
                key: sessionKey,
                id: sessionKey,
                ...projectRes,
              },
              updated: true,
            })
          }

          const localSession = getLocalSession(sessionKey)
          if (localSession) {
            if (label) updateLocalSessionTitle(sessionKey, label)
            return json({
              ok: true,
              sessionKey,
              friendlyId: rawFriendlyId || sessionKey,
              entry: {
                key: sessionKey,
                id: sessionKey,
                title: label || sessionKey,
                label: label || sessionKey,
                derivedTitle: label || sessionKey,
                startedAt: localSession.createdAt,
                updatedAt: Date.now(),
                message_count: localSession.messageCount,
                model: localSession.model,
                source: 'local',
              },
              updated: true,
              source: 'local',
            })
          }

          if (capabilities.dashboard.available && !capabilities.enhancedChat) {
            return json({
              ok: true,
              sessionKey,
              entry: {
                key: sessionKey,
                id: sessionKey,
                title: label || sessionKey,
                label: label || sessionKey,
                derivedTitle: label || sessionKey,
                updatedAt: Date.now(),
              },
              updated: false,
            })
          }

          const session = await updateSession(sessionKey, {
            title: label,
          })

          return json({
            ok: true,
            sessionKey,
            entry: toSessionSummary(session),
          })
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
      DELETE: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const rawSessionKey = url.searchParams.get('sessionKey') ?? ''
        const rawFriendlyId = url.searchParams.get('friendlyId') ?? ''
        const sessionKey = rawSessionKey.trim() || rawFriendlyId.trim()

        if (!sessionKey) {
          return json(
            { ok: false, error: 'sessionKey required' },
            { status: 400 },
          )
        }

        // Local sessions live in the workspace portable store, not the
        // gateway. Delete them locally without hitting the gateway.
        if (getLocalSession(sessionKey)) {
          deleteLocalSession(sessionKey)
          return json({ ok: true, sessionKey, source: 'local' })
        }

        const capabilities = await ensureGatewayProbed()
        if (!capabilities.sessions) {
          return json({
            ...createCapabilityUnavailablePayload('sessions'),
            ok: true,
            sessionKey,
            deleted: false,
          })
        }
        try {
          await deleteSession(sessionKey)

          return json({ ok: true, sessionKey })
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

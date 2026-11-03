import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  readPinnedSessions,
  toggleServerPinnedSession,
  writePinnedSessions,
} from '../../server/pinned-sessions-store'
import {
  createSession,
  deleteSession,
  ensureGatewayProbed,
  listSessions,
  toSessionSummary,
  updateSession,
} from '../../server/claude-api'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'
import {
  findProjectForPath,
  getSessionCwdMap,
  extractPathFromDirective,
  listProjects,
  setSessionProject,
  readSessionsFromStateDb,
  getSessionActivityMetaMap,
} from '../../server/projects-backend'
import { listAllActiveRuns } from '../../server/run-store'
import { saveWorkspaceSelection } from './workspace'
import {
  deleteLocalSession,
  getLocalSession,
  listLocalSessions,
  updateLocalSessionTitle,
} from '../../server/local-session-store'
import {
  deleteAntigravitySession,
  isAntigravitySession,
  listAntigravitySessions,
  updateAntigravitySession,
} from '../../server/antigravity-bridge'

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        void ensureGatewayProbed().catch(() => {})

        try {
          let gatewaySessions: any[] = []

          // Fetch Hermes gateway sessions and Antigravity bridge sessions in parallel
          const [hermesResult, agySessions] = await Promise.all([
            (async () => {
              try {
                const listPromise = listSessions(200, 0)
                const timeoutPromise = new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error('Gateway listSessions timeout')),
                    2500,
                  ),
                )
                const sessions = await Promise.race([
                  listPromise,
                  timeoutPromise,
                ])
                return (sessions || []).map(toSessionSummary)
              } catch {
                return []
              }
            })(),
            listAntigravitySessions(250).catch(() => []),
          ])

          gatewaySessions = hermesResult
          const gatewayIds = new Set(
            gatewaySessions.map((s: any) => s.key || s.id),
          )
          // Merge all profile & root state.db sessions so sessions across every Hermes profile are visible
          const dbSessions = readSessionsFromStateDb(250) as any[]
          const existingMap = new Map<string, any>()
          for (const gs of gatewaySessions) {
            const sid = gs.key || gs.id
            if (sid) existingMap.set(sid, gs)
          }
          for (const dbs of dbSessions) {
            const sid = dbs.key || dbs.id
            if (sid) {
              if (!gatewayIds.has(sid)) {
                gatewayIds.add(sid)
                gatewaySessions.push(dbs)
              } else {
                const existing = existingMap.get(sid)
                if (existing) {
                  if (!existing.cwd && dbs.cwd) existing.cwd = dbs.cwd
                  if (!existing.agentProfile && dbs.agentProfile) {
                    existing.agentProfile = dbs.agentProfile
                  }
                }
              }
            }
          }

          // Merge Antigravity sessions
          for (const asess of agySessions) {
            if (!gatewayIds.has(asess.id)) {
              gatewayIds.add(asess.id)
              gatewaySessions.push({
                ...asess,
              })
            }
          }

          // Merge local portable sessions (Ollama, Atomic Chat, etc.)
          const localSessions = listLocalSessions()
          for (const ls of localSessions) {
            if (!gatewayIds.has(ls.id)) {
              gatewayIds.add(ls.id)
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

          const hermesSessionIds = gatewaySessions
            .filter((s: any) => s.source !== 'antigravity')
            .map((s: any) => String(s.key || s.friendlyId || s.id))
          const cwdMap = getSessionCwdMap(hermesSessionIds)
          const activityMap = getSessionActivityMetaMap(hermesSessionIds)
          const activeRuns = await Promise.race([
            listAllActiveRuns().catch(() => []),
            new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 500)),
          ])
          const activeRunSessionIds = new Set(
            activeRuns
              .filter((r) => r.status === 'accepted' || r.status === 'active')
              .map((r) => r.sessionKey),
          )
          const { projects: allProjects } = listProjects({
            includeArchived: true,
          })

          for (const s of gatewaySessions as any[]) {
            const sid = String(s.key || s.friendlyId || s.id)
            const cwd =
              s.cwd ||
              cwdMap.get(sid) ||
              extractPathFromDirective(s.preview) ||
              null
            const project = findProjectForPath(cwd, allProjects)
            s.cwd = cwd
            s.projectId = project?.id ?? null
            s.projectName = project?.name ?? null
            s.projectSlug = project?.slug ?? null
            s.profileName = s.profileName || s.agentProfile || (s.source === 'antigravity' ? 'antigravity' : 'default')
            s.agentProfile = s.profileName
            s.parentSessionId = s.parentSessionId || s.parent_session_id || null

            const actMeta = activityMap.get(sid)
            s.lastPromptAt =
              actMeta?.lastPromptAt ??
              s.lastPromptAt ??
              s.updatedAt ??
              s.startedAt ??
              null
            const isRunActive =
              activeRunSessionIds.has(sid) ||
              Boolean(actMeta?.hasActiveLease) ||
              s.status === 'active'
            s.status = isRunActive ? 'active' : 'idle'
          }

          gatewaySessions.sort(
            (a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0),
          )

          return json({ sessions: gatewaySessions, pinnedSessionKeys })
        } catch (err) {
          try {
            const fallbackSessions = readSessionsFromStateDb(200) as any[]
            const fallbackIds = fallbackSessions.map((s: any) =>
              String(s.key || s.friendlyId || s.id),
            )
            const activityMap = getSessionActivityMetaMap(fallbackIds)
            const { projects: allProjects } = listProjects({
              includeArchived: true,
            })
            for (const s of fallbackSessions) {
              const project = findProjectForPath(s.cwd, allProjects)
              s.projectId = project?.id ?? null
              s.projectName = project?.name ?? null
              s.projectSlug = project?.slug ?? null
              const actMeta = activityMap.get(String(s.id))
              s.lastPromptAt =
                actMeta?.lastPromptAt ?? s.updatedAt ?? s.startedAt ?? null
              s.status = actMeta?.hasActiveLease ? 'active' : 'idle'
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
            const finalKeys = writePinnedSessions(
              body.pinnedSessionKeys as string[],
            )
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

          const isAgy = await isAntigravitySession(sessionKey)

          if (body.projectId !== undefined) {
            const targetProjectId =
              typeof body.projectId === 'string' && body.projectId.trim()
                ? body.projectId.trim()
                : null
            const projectRes = setSessionProject(sessionKey, targetProjectId)
            if (isAgy && projectRes.cwd) {
              await updateAntigravitySession(sessionKey, {
                cwd: projectRes.cwd,
              })
            }
            if (projectRes.cwd) {
              void saveWorkspaceSelection({
                path: projectRes.cwd,
                name: projectRes.projectName,
              }).catch(() => {})
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

          if (isAgy) {
            if (label) {
              await updateAntigravitySession(sessionKey, { title: label })
            }
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
                updatedAt: Date.now(),
                source: 'antigravity',
              },
              updated: true,
              source: 'antigravity',
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

        if (await isAntigravitySession(sessionKey)) {
          await deleteAntigravitySession(sessionKey)
          return json({ ok: true, sessionKey, source: 'antigravity' })
        }

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

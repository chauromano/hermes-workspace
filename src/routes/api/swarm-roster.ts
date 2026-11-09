import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  disableProjectSwarmRoster,
  enableProjectSwarmRoster,
  getProjectSwarmStatus,
  getSwarmRosterPath,
  readGlobalSwarmRoster,
  readSwarmRosterForProject,
  removeSwarmRosterWorker,
  upsertSwarmRosterWorker,
} from '../../server/swarm-roster'
import { listSwarmWorkerIds } from '../../server/swarm-foundation'

export const Route = createFileRoute('/api/swarm-roster')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const projectId = url.searchParams.get('projectId')?.trim() || undefined
        const ids = listSwarmWorkerIds()
        const status = getProjectSwarmStatus(projectId)
        const roster = readSwarmRosterForProject(projectId, ids)
        const globalRoster = readGlobalSwarmRoster(ids)

        return json({
          ok: true,
          path: status.effectiveRosterPath,
          scope: status.scope,
          projectId: status.projectId,
          projectName: status.projectName,
          projectRosterPath: status.projectRosterPath,
          hasProjectRoster: status.hasProjectRoster,
          roster,
          globalRoster,
          fetchedAt: Date.now(),
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        try {
          const ids = listSwarmWorkerIds()
          const payload = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
          const action = typeof payload.action === 'string' ? payload.action.trim() : ''
          const targetProjectId = typeof payload.projectId === 'string' ? payload.projectId.trim() : undefined

          if (action === 'enable-project' || action === 'set-roster') {
            const workers = Array.isArray(payload.workers) ? (payload.workers as never) : undefined
            const result = enableProjectSwarmRoster({ projectId: targetProjectId, workers }, ids)
            return json({
              ok: true,
              path: result.status.effectiveRosterPath,
              scope: result.status.scope,
              projectId: result.status.projectId,
              projectName: result.status.projectName,
              hasProjectRoster: result.status.hasProjectRoster,
              roster: result.roster,
              savedAt: Date.now(),
            })
          }

          if (action === 'disable-project') {
            const result = disableProjectSwarmRoster(targetProjectId, ids)
            return json({
              ok: true,
              path: result.status.effectiveRosterPath,
              scope: result.status.scope,
              projectId: result.status.projectId,
              projectName: result.status.projectName,
              hasProjectRoster: result.status.hasProjectRoster,
              roster: result.roster,
              savedAt: Date.now(),
            })
          }

          if (action === 'remove-worker') {
            const workerId = String(payload.workerId || '')
            const roster = removeSwarmRosterWorker(workerId, targetProjectId, ids)
            return json({
              ok: true,
              path: getSwarmRosterPath(targetProjectId),
              roster,
              savedAt: Date.now(),
            })
          }

          const roster = upsertSwarmRosterWorker(body as never, ids, targetProjectId)
          return json({ ok: true, path: getSwarmRosterPath(targetProjectId), roster, savedAt: Date.now() })
        } catch (error) {
          return json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to save swarm roster entry',
          }, { status: 400 })
        }
      },
    },
  },
})

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'yaml'
import { z } from 'zod'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import { getHermesRoot } from './claude-paths'
import { getActiveProjectId, getProject } from './projects-backend'

export function getGlobalSwarmRosterPath(): string {
  if (process.env.SWARM_ROSTER_PATH) return process.env.SWARM_ROSTER_PATH
  const hermesRoot = getHermesRoot()
  if (existsSync(hermesRoot) && existsSync(join(hermesRoot, 'swarm.yaml'))) {
    return join(hermesRoot, 'swarm.yaml')
  }
  if (existsSync(join(SWARM_CANONICAL_REPO, 'swarm.yaml'))) {
    return join(SWARM_CANONICAL_REPO, 'swarm.yaml')
  }
  return existsSync(hermesRoot)
    ? join(hermesRoot, 'swarm.yaml')
    : join(SWARM_CANONICAL_REPO, 'swarm.yaml')
}

export type ProjectSwarmStatus = {
  scope: 'project' | 'global'
  projectId: string | null
  projectName: string | null
  projectPrimaryPath: string | null
  projectRosterPath: string | null
  hasProjectRoster: boolean
  effectiveRosterPath: string
  globalRosterPath: string
}

export function getProjectSwarmStatus(targetProjectId?: string | null): ProjectSwarmStatus {
  const globalRosterPath = getGlobalSwarmRosterPath()
  const resolvedId = targetProjectId !== undefined ? targetProjectId : getActiveProjectId()
  const project = resolvedId ? getProject(resolvedId) : null
  const primaryPath = project?.primary_path && existsSync(project.primary_path) ? project.primary_path : null
  const projectRosterPath = primaryPath ? join(primaryPath, 'swarm.yaml') : null
  const hasProjectRoster = Boolean(projectRosterPath && existsSync(projectRosterPath))

  return {
    scope: hasProjectRoster ? 'project' : 'global',
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    projectPrimaryPath: primaryPath,
    projectRosterPath,
    hasProjectRoster,
    effectiveRosterPath: hasProjectRoster && projectRosterPath ? projectRosterPath : globalRosterPath,
    globalRosterPath,
  }
}

export function getSwarmRosterPath(targetProjectId?: string | null): string {
  if (process.env.SWARM_ROSTER_PATH) return process.env.SWARM_ROSTER_PATH
  return getProjectSwarmStatus(targetProjectId).effectiveRosterPath
}

export const SWARM_ROSTER_PATH = getSwarmRosterPath()

const WORKER_ID_PATTERN = /^(swarm\d+|[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/i

export function isSwarmWorkerId(value: unknown): value is string {
  return typeof value === 'string' && WORKER_ID_PATTERN.test(value.trim())
}

const WorkerIdSchema = z
  .string()
  .trim()
  .regex(WORKER_ID_PATTERN, 'worker id must look like swarm13 or a semantic profile id')

export const SwarmRosterWorkerSchema = z.object({
  id: WorkerIdSchema,
  name: z.string().default(''),
  role: z.string().default('Worker'),
  specialty: z.string().default(''),
  model: z.string().default('Worker'),
  mission: z.string().default('Awaiting orchestrator dispatch.'),
  profile: WorkerIdSchema.optional(),
  modes: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  plugins: z.array(z.string()).default([]),
  pluginToolsets: z.array(z.string()).default([]),
  mcpServers: z.array(z.string()).default([]),
  wrapper: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  defaultCwd: z.string().optional(),
  preferredTaskTypes: z.array(z.string()).default([]),
  greenlightRequiredFor: z.array(z.string()).default([]),
  maxConcurrentTasks: z.number().int().positive().default(1),
  acceptsBroadcast: z.boolean().default(true),
  reviewRequired: z.boolean().default(false),
})

export const SwarmRosterSchema = z.object({
  version: z.number().int().positive().default(1),
  workers: z.array(SwarmRosterWorkerSchema).default([]),
})

export type SwarmRosterWorker = z.infer<typeof SwarmRosterWorkerSchema>
export type SwarmRoster = z.infer<typeof SwarmRosterSchema>

export const SwarmRosterUpsertSchema = SwarmRosterWorkerSchema.extend({
  id: WorkerIdSchema,
})

export type SwarmRosterUpsert = z.infer<typeof SwarmRosterUpsertSchema>

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function defaultRoleFromId(id: string): string {
  const n = id.match(/(\d+)/)?.[1] ?? ''
  switch (n) {
    case '1':
    case '12':
      return 'PR / Issues'
    case '2':
      return 'Backend Foundation'
    case '3':
      return 'Main Session Mirror'
    case '4':
      return 'Research'
    case '5':
    case '10':
      return 'Builder'
    case '6':
    case '11':
      return 'Reviewer'
    case '7':
      return 'Docs'
    case '8':
      return 'Ops'
    case '9':
      return 'Hackathon'
    default:
      return 'Worker'
  }
}

export function fallbackRoster(ids: Array<string> = []): SwarmRoster {
  return {
    version: 1,
    workers: ids.map((id) => ({
      id,
      name: id.replace(/^swarm/i, 'Swarm'),
      role: defaultRoleFromId(id),
      specialty: '',
      model: 'Worker',
      mission: 'Awaiting orchestrator dispatch.',
      skills: [],
      capabilities: [],
      defaultCwd: undefined,
      preferredTaskTypes: [],
      maxConcurrentTasks: 1,
      acceptsBroadcast: true,
      reviewRequired: false,
    })),
  }
}

export function readSwarmRoster(ids: Array<string> = []): SwarmRoster {
  return readSwarmRosterForProject(undefined, ids)
}

export function readGlobalSwarmRoster(ids: Array<string> = []): SwarmRoster {
  const rosterPath = getGlobalSwarmRosterPath()
  if (!existsSync(rosterPath)) return fallbackRoster(ids)
  try {
    const raw = yaml.parse(readFileSync(rosterPath, 'utf-8')) as unknown
    const parsed = SwarmRosterSchema.parse(raw)
    const byId = new Map(parsed.workers.map((worker) => [worker.id, worker]))
    for (const fallback of fallbackRoster(ids).workers) {
      if (!byId.has(fallback.id)) byId.set(fallback.id, fallback)
    }
    return { version: parsed.version, workers: [...byId.values()] }
  } catch {
    return fallbackRoster(ids)
  }
}

export function readSwarmRosterForProject(targetProjectId?: string | null, ids: Array<string> = []): SwarmRoster {
  const rosterPath = getSwarmRosterPath(targetProjectId)
  if (!existsSync(rosterPath)) {
    const globalPath = getGlobalSwarmRosterPath()
    if (existsSync(globalPath)) {
      return readGlobalSwarmRoster(ids)
    }
    return fallbackRoster(ids)
  }
  try {
    const raw = yaml.parse(readFileSync(rosterPath, 'utf-8')) as unknown
    const parsed = SwarmRosterSchema.parse(raw)
    const byId = new Map(parsed.workers.map((worker) => [worker.id, worker]))
    for (const fallback of fallbackRoster(ids).workers) {
      if (!byId.has(fallback.id)) byId.set(fallback.id, fallback)
    }
    return { version: parsed.version, workers: [...byId.values()] }
  } catch {
    return fallbackRoster(ids)
  }
}

export function enableProjectSwarmRoster(
  options?: { projectId?: string | null; workers?: Array<SwarmRosterUpsert> },
  ids: Array<string> = [],
): { status: ProjectSwarmStatus; roster: SwarmRoster } {
  const status = getProjectSwarmStatus(options?.projectId)
  if (!status.projectRosterPath) {
    throw new Error('Project primary path does not exist')
  }

  if (options?.workers && Array.isArray(options.workers)) {
    const validatedWorkers = options.workers.map((w) => SwarmRosterUpsertSchema.parse(w))
    const roster: SwarmRoster = {
      version: 1,
      workers: validatedWorkers,
    }
    const doc = yaml.stringify(roster, { lineWidth: 0 })
    writeFileSync(status.projectRosterPath, doc)
  } else if (!existsSync(status.projectRosterPath)) {
    const baseRoster = readGlobalSwarmRoster(ids)
    const doc = yaml.stringify(baseRoster, { lineWidth: 0 })
    writeFileSync(status.projectRosterPath, doc)
  }

  const updatedStatus = getProjectSwarmStatus(options?.projectId)
  const roster = readSwarmRosterForProject(options?.projectId, ids)
  return { status: updatedStatus, roster }
}

export function disableProjectSwarmRoster(
  targetProjectId?: string | null,
  ids: Array<string> = [],
): { status: ProjectSwarmStatus; roster: SwarmRoster } {
  const status = getProjectSwarmStatus(targetProjectId)
  if (status.projectRosterPath && existsSync(status.projectRosterPath)) {
    try {
      unlinkSync(status.projectRosterPath)
    } catch (err) {
      throw new Error(`Failed to remove project swarm.yaml: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const updatedStatus = getProjectSwarmStatus(targetProjectId)
  const roster = readGlobalSwarmRoster(ids)
  return { status: updatedStatus, roster }
}

export function removeSwarmRosterWorker(
  workerId: string,
  targetProjectId?: string | null,
  ids: Array<string> = [],
): SwarmRoster {
  const targetId = workerId.trim()
  const current = readSwarmRosterForProject(targetProjectId, ids)
  const nextWorkers = current.workers.filter((w) => w.id !== targetId)
  const nextRoster: SwarmRoster = {
    version: current.version || 1,
    workers: nextWorkers,
  }
  const targetPath = getSwarmRosterPath(targetProjectId)
  const doc = yaml.stringify(nextRoster, { lineWidth: 0 })
  writeFileSync(targetPath, doc)
  return nextRoster
}

export function writeSwarmRoster(roster: SwarmRoster, targetProjectId?: string | null): void {
  const parsed = SwarmRosterSchema.parse(roster)
  const doc = yaml.stringify(parsed, { lineWidth: 0 })
  const rosterPath = getSwarmRosterPath(targetProjectId)
  writeFileSync(rosterPath, doc)
}

export function upsertSwarmRosterWorker(input: SwarmRosterUpsert, ids: Array<string> = [], targetProjectId?: string | null): SwarmRoster {
  const nextWorker = SwarmRosterUpsertSchema.parse(input)
  const current = readSwarmRosterForProject(targetProjectId, ids)
  const byId = new Map(current.workers.map((worker) => [worker.id, worker]))
  byId.set(nextWorker.id, nextWorker)
  const next: SwarmRoster = {
    version: current.version || 1,
    workers: [...byId.values()].sort((a, b) => {
      const na = parseInt(a.id.replace(/\D/g, ''), 10) || 0
      const nb = parseInt(b.id.replace(/\D/g, ''), 10) || 0
      return na - nb
    }),
  }
  writeSwarmRoster(next, targetProjectId)
  return next
}

export function rosterByWorkerId(ids: Array<string> = []): Map<string, SwarmRosterWorker> {
  return new Map(readSwarmRoster(ids).workers.map((worker) => [worker.id, worker]))
}

export function resolveSwarmWorkerDisplayName(workerId: string, worker?: Pick<SwarmRosterWorker, 'name'> | null): string {
  return worker ? worker.name.trim() || titleCase(workerId) : titleCase(workerId)
}

export function formatSwarmWorkerLabel(
  workerId: string,
  worker?: Pick<SwarmRosterWorker, 'name' | 'role'> | null,
): string {
  const displayName = resolveSwarmWorkerDisplayName(workerId, worker)
  const role = worker ? worker.role.trim() || defaultRoleFromId(workerId) : defaultRoleFromId(workerId)
  return `${displayName} — ${role}`
}

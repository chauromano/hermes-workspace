import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getHermesRoot } from './claude-paths'

export type ProjectFolder = {
  project_id: string
  path: string
  label: string | null
  is_primary: boolean
  added_at: number
}

export type Project = {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  board_slug: string | null
  primary_path: string | null
  created_at: number
  archived: boolean
  folders: ProjectFolder[]
  is_active: boolean
}

export type CreateProjectInput = {
  name: string
  slug?: string
  primary_path: string
  description?: string
  icon?: string
  color?: string
  board_slug?: string
  set_active?: boolean
  folders?: Array<{ path: string; label?: string }>
}

export function getProjectsDbPath(): string {
  const primary = join(getHermesRoot(), 'projects.db')
  if (existsSync(primary)) return primary

  const fallback = '/opt/data/projects.db'
  if (existsSync(fallback)) return fallback

  return primary
}

function sqliteQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function runSqlite(dbPath: string, sql: string): string {
  try {
    return execFileSync('sqlite3', [dbPath, '-json', sql], {
      encoding: 'utf8',
      timeout: 15_000,
    }).trim()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to query projects.db: ${message}`)
  }
}

function runSqliteExec(dbPath: string, sql: string): void {
  try {
    execFileSync('sqlite3', [dbPath, sql], {
      encoding: 'utf8',
      timeout: 15_000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to update projects.db: ${message}`)
  }
}

export function slugify(name: string): string {
  const s = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
  return s.slice(0, 64) || 'project'
}

type CachedProjectsResult = {
  projects: Project[]
  active_id: string | null
  timestamp: number
}

let cachedProjects: CachedProjectsResult | null = null
let cachedProjectsArchived: CachedProjectsResult | null = null
const PROJECTS_CACHE_TTL_MS = 15_000

export function invalidateProjectsCache(): void {
  cachedProjects = null
  cachedProjectsArchived = null
}

export function getActiveProjectId(dbPath = getProjectsDbPath()): string | null {
  if (!existsSync(dbPath)) return null
  try {
    const sql = `SELECT value FROM project_meta WHERE key = 'active_id' LIMIT 1;`
    const raw = runSqlite(dbPath, sql)
    const rows = raw ? (JSON.parse(raw) as Array<{ value: string }>) : []
    return rows.length > 0 && rows[0].value ? rows[0].value.trim() : null
  } catch {
    return null
  }
}

export function listProjects(
  options: { includeArchived?: boolean; dbPath?: string } = {},
): { projects: Project[]; active_id: string | null } {
  const dbPath = options.dbPath ?? getProjectsDbPath()
  if (!existsSync(dbPath)) {
    return { projects: [], active_id: null }
  }

  const isDefaultDb = dbPath === getProjectsDbPath()
  const now = Date.now()
  if (isDefaultDb) {
    const cache = options.includeArchived ? cachedProjectsArchived : cachedProjects
    if (cache && now - cache.timestamp < PROJECTS_CACHE_TTL_MS) {
      return { projects: cache.projects, active_id: cache.active_id }
    }
  }

  const activeId = getActiveProjectId(dbPath)
  const whereArchived = options.includeArchived ? '' : 'WHERE archived = 0'

  const projectsSql = `SELECT id, slug, name, description, icon, color, board_slug, primary_path, created_at, archived FROM projects ${whereArchived} ORDER BY created_at ASC;`
  const foldersSql = `SELECT project_id, path, label, is_primary, added_at FROM project_folders ORDER BY is_primary DESC, added_at ASC;`

  const projectsRaw = runSqlite(dbPath, projectsSql)
  const foldersRaw = runSqlite(dbPath, foldersSql)

  type RawProjectRow = {
    id: string
    slug: string
    name: string
    description: string | null
    icon: string | null
    color: string | null
    board_slug: string | null
    primary_path: string | null
    created_at: number
    archived: number
  }

  type RawFolderRow = {
    project_id: string
    path: string
    label: string | null
    is_primary: number
    added_at: number
  }

  const projectRows: RawProjectRow[] = projectsRaw ? JSON.parse(projectsRaw) : []
  const folderRows: RawFolderRow[] = foldersRaw ? JSON.parse(foldersRaw) : []

  const folderMap = new Map<string, ProjectFolder[]>()
  for (const f of folderRows) {
    const list = folderMap.get(f.project_id) ?? []
    list.push({
      project_id: f.project_id,
      path: f.path,
      label: f.label ?? null,
      is_primary: Boolean(f.is_primary),
      added_at: Number(f.added_at),
    })
    folderMap.set(f.project_id, list)
  }

  const projects: Project[] = projectRows.map((p) => {
    const folders = folderMap.get(p.id) ?? []
    const primaryPath =
      p.primary_path ||
      folders.find((f) => f.is_primary)?.path ||
      (folders[0]?.path ?? null)

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description ?? null,
      icon: p.icon ?? null,
      color: p.color ?? null,
      board_slug: p.board_slug ?? null,
      primary_path: primaryPath,
      created_at: Number(p.created_at),
      archived: Boolean(p.archived),
      folders,
      is_active: p.id === activeId,
    }
  })

  const result = { projects, active_id: activeId }
  if (isDefaultDb) {
    const cachedEntry = { ...result, timestamp: now }
    if (options.includeArchived) {
      cachedProjectsArchived = cachedEntry
    } else {
      cachedProjects = cachedEntry
    }
  }

  return result
}

export function getProject(
  ident: string,
  dbPath = getProjectsDbPath(),
): Project | null {
  if (!existsSync(dbPath) || !ident.trim()) return null
  const clean = ident.trim()
  const sql = `SELECT id, slug, name, description, icon, color, board_slug, primary_path, created_at, archived FROM projects WHERE id = ${sqliteQuote(clean)} OR slug = ${sqliteQuote(clean)} LIMIT 1;`
  const raw = runSqlite(dbPath, sql)
  const rows = raw ? JSON.parse(raw) : []
  if (rows.length === 0) return null

  const p = rows[0]
  const foldersSql = `SELECT project_id, path, label, is_primary, added_at FROM project_folders WHERE project_id = ${sqliteQuote(p.id)} ORDER BY is_primary DESC, added_at ASC;`
  const foldersRaw = runSqlite(dbPath, foldersSql)
  const folderRows = foldersRaw ? JSON.parse(foldersRaw) : []

  const activeId = getActiveProjectId(dbPath)
  const folders: ProjectFolder[] = folderRows.map((f: { project_id: string; path: string; label: string | null; is_primary: number; added_at: number }) => ({
    project_id: f.project_id,
    path: f.path,
    label: f.label ?? null,
    is_primary: Boolean(f.is_primary),
    added_at: Number(f.added_at),
  }))

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    icon: p.icon ?? null,
    color: p.color ?? null,
    board_slug: p.board_slug ?? null,
    primary_path: p.primary_path || folders.find((f) => f.is_primary)?.path || null,
    created_at: Number(p.created_at),
    archived: Boolean(p.archived),
    folders,
    is_active: p.id === activeId,
  }
}

export function createProject(
  input: CreateProjectInput,
  dbPath = getProjectsDbPath(),
): Project {
  if (!input.name || !input.name.trim()) {
    throw new Error('Project name is required')
  }
  if (!input.primary_path || !input.primary_path.trim()) {
    throw new Error('Project primary path is required')
  }

  const name = input.name.trim()
  const slug = slugify(input.slug || name)
  const primaryPath = resolve(input.primary_path.trim()).replace(/\\/g, '/')
  const now = Math.floor(Date.now() / 1000)

  // Ensure primaryPath exists on disk
  try {
    if (!existsSync(primaryPath)) {
      mkdirSync(primaryPath, { recursive: true })
    }
  } catch (err) {
    console.warn(`[projects] Warning: Could not create directory ${primaryPath}:`, err)
  }

  // Verify slug uniqueness
  const existingBySlug = getProject(slug, dbPath)
  const id = existingBySlug
    ? `p_${slug}_${randomBytes(2).toString('hex')}`
    : `p_${slug}`

  const descVal = input.description ? sqliteQuote(input.description.trim()) : 'NULL'
  const iconVal = input.icon ? sqliteQuote(input.icon.trim()) : 'NULL'
  const colorVal = input.color ? sqliteQuote(input.color.trim()) : 'NULL'
  const boardVal = input.board_slug ? sqliteQuote(input.board_slug.trim()) : 'NULL'

  const statements: string[] = [
    'BEGIN TRANSACTION;',
    `INSERT INTO projects (id, slug, name, description, icon, color, board_slug, primary_path, created_at, archived) VALUES (${sqliteQuote(id)}, ${sqliteQuote(slug)}, ${sqliteQuote(name)}, ${descVal}, ${iconVal}, ${colorVal}, ${boardVal}, ${sqliteQuote(primaryPath)}, ${now}, 0);`,
    `INSERT INTO project_folders (project_id, path, label, is_primary, added_at) VALUES (${sqliteQuote(id)}, ${sqliteQuote(primaryPath)}, 'primary', 1, ${now});`,
  ]

  if (Array.isArray(input.folders)) {
    for (const folder of input.folders) {
      if (!folder.path || !folder.path.trim()) continue
      const fPath = resolve(folder.path.trim()).replace(/\\/g, '/')
      if (fPath === primaryPath) continue
      try {
        if (!existsSync(fPath)) {
          mkdirSync(fPath, { recursive: true })
        }
      } catch (err) {
        console.warn(`[projects] Warning: Could not create folder ${fPath}:`, err)
      }
      const labelVal = folder.label ? sqliteQuote(folder.label.trim()) : 'NULL'
      statements.push(
        `INSERT OR IGNORE INTO project_folders (project_id, path, label, is_primary, added_at) VALUES (${sqliteQuote(id)}, ${sqliteQuote(fPath)}, ${labelVal}, 0, ${now});`,
      )
    }
  }

  if (input.set_active) {
    statements.push(
      `INSERT INTO project_meta (key, value) VALUES ('active_id', ${sqliteQuote(id)}) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    )
  }

  statements.push('COMMIT;')

  runSqliteExec(dbPath, statements.join('\n'))
  invalidateProjectsCache()

  const created = getProject(id, dbPath)
  if (!created) {
    throw new Error('Failed to retrieve newly created project')
  }
  return created
}

export function setActiveProject(
  ident: string | null,
  dbPath = getProjectsDbPath(),
): { active_id: string | null } {
  if (!ident || !ident.trim()) {
    runSqliteExec(
      dbPath,
      `DELETE FROM project_meta WHERE key = 'active_id';`,
    )
    invalidateProjectsCache()
    return { active_id: null }
  }

  const proj = getProject(ident, dbPath)
  if (!proj) {
    throw new Error(`Project not found: ${ident}`)
  }

  runSqliteExec(
    dbPath,
    `INSERT INTO project_meta (key, value) VALUES ('active_id', ${sqliteQuote(proj.id)}) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
  )
  invalidateProjectsCache()

  return { active_id: proj.id }
}

export function updateProject(
  ident: string,
  updates: {
    name?: string
    description?: string | null
    primary_path?: string
    icon?: string | null
    color?: string | null
    board_slug?: string | null
  },
  dbPath = getProjectsDbPath(),
): Project {
  const proj = getProject(ident, dbPath)
  if (!proj) {
    throw new Error(`Project not found: ${ident}`)
  }

  const setClauses: string[] = []
  if (typeof updates.name === 'string' && updates.name.trim()) {
    setClauses.push(`name = ${sqliteQuote(updates.name.trim())}`)
  }
  if (updates.description !== undefined) {
    setClauses.push(
      `description = ${updates.description ? sqliteQuote(updates.description.trim()) : 'NULL'}`,
    )
  }
  if (updates.icon !== undefined) {
    setClauses.push(`icon = ${updates.icon ? sqliteQuote(updates.icon.trim()) : 'NULL'}`)
  }
  if (updates.color !== undefined) {
    setClauses.push(`color = ${updates.color ? sqliteQuote(updates.color.trim()) : 'NULL'}`)
  }
  if (updates.board_slug !== undefined) {
    setClauses.push(
      `board_slug = ${updates.board_slug ? sqliteQuote(updates.board_slug.trim()) : 'NULL'}`,
    )
  }

  const statements: string[] = ['BEGIN TRANSACTION;']

  if (typeof updates.primary_path === 'string' && updates.primary_path.trim()) {
    const primary = resolve(updates.primary_path.trim()).replace(/\\/g, '/')
    try {
      if (!existsSync(primary)) {
        mkdirSync(primary, { recursive: true })
      }
    } catch (err) {
      console.warn(`[projects] Warning: Could not create directory ${primary}:`, err)
    }
    setClauses.push(`primary_path = ${sqliteQuote(primary)}`)
    const now = Math.floor(Date.now() / 1000)
    // Clear existing is_primary flags and set or insert this one
    statements.push(
      `UPDATE project_folders SET is_primary = 0 WHERE project_id = ${sqliteQuote(proj.id)};`,
      `INSERT INTO project_folders (project_id, path, label, is_primary, added_at) VALUES (${sqliteQuote(proj.id)}, ${sqliteQuote(primary)}, 'primary', 1, ${now}) ON CONFLICT(project_id, path) DO UPDATE SET is_primary = 1;`,
    )
  }

  if (setClauses.length > 0) {
    statements.push(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ${sqliteQuote(proj.id)};`,
    )
  }

  statements.push('COMMIT;')
  runSqliteExec(dbPath, statements.join('\n'))
  invalidateProjectsCache()

  const updated = getProject(proj.id, dbPath)
  if (!updated) throw new Error('Failed to retrieve updated project')
  return updated
}

export function addProjectFolder(
  ident: string,
  folderPath: string,
  label = '',
  isPrimary = false,
  dbPath = getProjectsDbPath(),
): Project {
  const proj = getProject(ident, dbPath)
  if (!proj) {
    throw new Error(`Project not found: ${ident}`)
  }

  const cleanPath = resolve(folderPath.trim()).replace(/\\/g, '/')
  try {
    if (!existsSync(cleanPath)) {
      mkdirSync(cleanPath, { recursive: true })
    }
  } catch (err) {
    console.warn(`[projects] Warning: Could not create folder ${cleanPath}:`, err)
  }
  const labelVal = label.trim() ? sqliteQuote(label.trim()) : 'NULL'
  const now = Math.floor(Date.now() / 1000)

  const statements: string[] = ['BEGIN TRANSACTION;']
  if (isPrimary) {
    statements.push(
      `UPDATE project_folders SET is_primary = 0 WHERE project_id = ${sqliteQuote(proj.id)};`,
      `UPDATE projects SET primary_path = ${sqliteQuote(cleanPath)} WHERE id = ${sqliteQuote(proj.id)};`,
    )
  }

  statements.push(
    `INSERT INTO project_folders (project_id, path, label, is_primary, added_at) VALUES (${sqliteQuote(proj.id)}, ${sqliteQuote(cleanPath)}, ${labelVal}, ${isPrimary ? 1 : 0}, ${now}) ON CONFLICT(project_id, path) DO UPDATE SET label = ${labelVal}, is_primary = ${isPrimary ? 1 : 'is_primary'};`,
    'COMMIT;',
  )

  runSqliteExec(dbPath, statements.join('\n'))
  invalidateProjectsCache()
  const updated = getProject(proj.id, dbPath)
  if (!updated) throw new Error('Failed to retrieve project after adding folder')
  return updated
}

export function removeProjectFolder(
  ident: string,
  folderPath: string,
  dbPath = getProjectsDbPath(),
): Project {
  const proj = getProject(ident, dbPath)
  if (!proj) {
    throw new Error(`Project not found: ${ident}`)
  }

  const cleanPath = resolve(folderPath.trim()).replace(/\\/g, '/')
  runSqliteExec(
    dbPath,
    `DELETE FROM project_folders WHERE project_id = ${sqliteQuote(proj.id)} AND path = ${sqliteQuote(cleanPath)};`,
  )
  invalidateProjectsCache()

  const updated = getProject(proj.id, dbPath)
  if (!updated) throw new Error('Failed to retrieve project after removing folder')
  return updated
}

export function archiveProject(
  ident: string,
  archive = true,
  dbPath = getProjectsDbPath(),
): Project {
  const proj = getProject(ident, dbPath)
  if (!proj) {
    throw new Error(`Project not found: ${ident}`)
  }

  runSqliteExec(
    dbPath,
    `UPDATE projects SET archived = ${archive ? 1 : 0} WHERE id = ${sqliteQuote(proj.id)};`,
  )
  invalidateProjectsCache()

  const updated = getProject(proj.id, dbPath)
  if (!updated) throw new Error('Failed to retrieve archived project')
  return updated
}

export function deleteProject(
  ident: string,
  dbPath = getProjectsDbPath(),
): boolean {
  const proj = getProject(ident, dbPath)
  if (!proj) return false

  const statements = [
    'BEGIN TRANSACTION;',
    `DELETE FROM project_folders WHERE project_id = ${sqliteQuote(proj.id)};`,
    `DELETE FROM projects WHERE id = ${sqliteQuote(proj.id)};`,
    `DELETE FROM project_meta WHERE key = 'active_id' AND value = ${sqliteQuote(proj.id)};`,
    'COMMIT;',
  ]

  runSqliteExec(dbPath, statements.join('\n'))
  invalidateProjectsCache()
  return true
}

export function listWorkspaceDirectories(
  rootSubpath = '',
): Array<{ name: string; path: string }> {
  const workspaceRoot = process.env.HERMES_WORKSPACE_DIR || '/workspace'
  const targetDir = rootSubpath ? join(workspaceRoot, rootSubpath) : workspaceRoot

  if (!existsSync(targetDir)) return []

  try {
    const entries = readdirSync(targetDir)
    const dirs: Array<{ name: string; path: string }> = []

    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules' || name === '@eaDir') {
        continue
      }
      try {
        const fullPath = join(targetDir, name)
        if (statSync(fullPath).isDirectory()) {
          dirs.push({
            name,
            path: fullPath.replace(/\\/g, '/'),
          })
        }
      } catch {
        // Skip unreadable files/links
      }
    }
    return dirs.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function createWorkspaceDirectory(
  subpath = '',
  folderName: string,
): { name: string; path: string } {
  if (!folderName || !folderName.trim()) {
    throw new Error('Folder name is required')
  }

  const cleanName = folderName.trim()

  // Disallow directory traversal or illegal characters
  if (
    cleanName === '.' ||
    cleanName === '..' ||
    /[/\\:*?"<>|\x00-\x1F]/.test(cleanName)
  ) {
    throw new Error(`Invalid folder name: "${cleanName}"`)
  }

  const workspaceRoot = process.env.HERMES_WORKSPACE_DIR || '/workspace'
  const resolvedRoot = resolve(workspaceRoot)

  // Clean subpath
  const cleanSub = subpath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const parentDir = cleanSub ? resolve(workspaceRoot, cleanSub) : resolvedRoot

  // Security: Ensure parentDir is inside workspaceRoot
  const normParent = parentDir.replace(/\\/g, '/')
  const normRoot = resolvedRoot.replace(/\\/g, '/')
  if (normParent !== normRoot && !normParent.startsWith(normRoot + '/')) {
    throw new Error('Target directory must be within the workspace root')
  }

  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true })
  }

  const targetDir = resolve(parentDir, cleanName)
  const normTarget = targetDir.replace(/\\/g, '/')

  // Security: Ensure targetDir is inside workspaceRoot
  if (!normTarget.startsWith(normRoot + '/')) {
    throw new Error('Target directory must be within the workspace root')
  }

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  return {
    name: cleanName,
    path: normTarget,
  }
}

export function getStateDbPath(): string {
  const primary = join(getHermesRoot(), 'state.db')
  if (existsSync(primary)) return primary

  const fallback = '/opt/data/state.db'
  if (existsSync(fallback)) return fallback

  return primary
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function findProjectForPath(
  targetPath: string | null | undefined,
  allProjects?: Project[],
  dbPath = getProjectsDbPath(),
): Project | null {
  if (!targetPath || !targetPath.trim()) return null
  const normTarget = normalizePath(targetPath.trim())
  const projects = allProjects ?? listProjects({ includeArchived: true, dbPath }).projects

  let bestMatch: { project: Project; folderLen: number } | null = null

  for (const proj of projects) {
    if (proj.archived) continue
    for (const folder of proj.folders) {
      const normFolder = normalizePath(folder.path)
      if (normTarget === normFolder || normTarget.startsWith(normFolder + '/')) {
        if (!bestMatch || normFolder.length > bestMatch.folderLen) {
          bestMatch = { project: proj, folderLen: normFolder.length }
        }
      }
    }
  }

  return bestMatch?.project ?? null
}

export function extractPathFromDirective(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/<workspace_context\s+[^>]*path="([^"]+)"/i)
  return m ? m[1].trim() : null
}

const sessionCwdCache = new Map<string, { cwd: string; timestamp: number }>()
const CWD_CACHE_TTL_MS = 30_000

export function invalidateSessionCwd(sessionId?: string): void {
  if (sessionId) {
    sessionCwdCache.delete(sessionId)
  } else {
    sessionCwdCache.clear()
  }
}

export function getSessionCwdMap(sessionIds: string[], stateDb = getStateDbPath()): Map<string, string> {
  const map = new Map<string, string>()
  if (sessionIds.length === 0) return map

  const now = Date.now()
  const missingIds: string[] = []

  for (const id of sessionIds) {
    const cached = sessionCwdCache.get(id)
    if (cached && now - cached.timestamp < CWD_CACHE_TTL_MS) {
      if (cached.cwd) map.set(id, cached.cwd)
    } else {
      missingIds.push(id)
    }
  }

  if (missingIds.length > 0 && existsSync(stateDb)) {
    try {
      const inList = missingIds.map(sqliteQuote).join(', ')
      const raw = runSqlite(stateDb, `SELECT id, cwd FROM sessions WHERE id IN (${inList});`)
      if (raw) {
        const rows = JSON.parse(raw) as Array<{ id: string; cwd?: string | null }>
        const found = new Set<string>()
        for (const row of rows) {
          found.add(row.id)
          const cwd = row.cwd && row.cwd.trim() ? row.cwd.trim() : ''
          sessionCwdCache.set(row.id, { cwd, timestamp: now })
          if (cwd) map.set(row.id, cwd)
        }
        for (const id of missingIds) {
          if (!found.has(id)) {
            sessionCwdCache.set(id, { cwd: '', timestamp: now })
          }
        }
      }
    } catch {}
  }

  return map
}

export function setSessionProject(
  sessionId: string,
  projectId: string | null,
  projectsDb = getProjectsDbPath(),
  stateDb = getStateDbPath(),
): {
  success: boolean
  cwd: string | null
  projectId: string | null
  projectName: string
} {
  let targetPath: string | null = null
  let projectName = 'Personal Sandbox'

  if (projectId) {
    const proj = getProject(projectId, projectsDb)
    if (!proj) {
      throw new Error(`Project not found: ${projectId}`)
    }
    targetPath = proj.primary_path
    projectName = proj.name
    setActiveProject(proj.id, projectsDb)
  } else {
    setActiveProject(null, projectsDb)
    targetPath = '/workspace'
    projectName = 'Personal Sandbox'
  }

  if (existsSync(stateDb)) {
    const sql = `UPDATE sessions SET cwd = ${targetPath ? sqliteQuote(targetPath) : "''"} WHERE id = ${sqliteQuote(sessionId)};`
    runSqliteExec(stateDb, sql)
  }

  sessionCwdCache.set(sessionId, { cwd: targetPath || '', timestamp: Date.now() })
  invalidateProjectsCache()

  return {
    success: true,
    cwd: targetPath,
    projectId: projectId || null,
    projectName,
  }
}

export function readSessionsFromStateDb(
  limit = 50,
  stateDb = getStateDbPath(),
): Array<Record<string, unknown>> {
  if (!existsSync(stateDb)) return []
  try {
    const sql = `SELECT id, title, model, started_at, last_activity_at, message_count, tool_call_count, cwd, pinned, input_tokens, output_tokens FROM sessions ORDER BY COALESCE(last_activity_at, started_at) DESC LIMIT ${limit};`
    const raw = runSqlite(stateDb, sql)
    if (!raw) return []
    const rows = JSON.parse(raw) as Array<Record<string, any>>
    return rows.map((s) => ({
      key: s.id,
      id: s.id,
      friendlyId: s.id,
      kind: 'chat',
      status: 'idle',
      model: s.model || '',
      label: s.title || undefined,
      title: s.title || undefined,
      derivedTitle: s.title || `Session ${String(s.id).slice(0, 8)}`,
      preview: undefined,
      tokenCount: (s.input_tokens || 0) + (s.output_tokens || 0),
      totalTokens: (s.input_tokens || 0) + (s.output_tokens || 0),
      message_count: s.message_count || 0,
      tool_call_count: s.tool_call_count || 0,
      messageCount: s.message_count || 0,
      toolCallCount: s.tool_call_count || 0,
      cost: 0,
      createdAt: s.started_at ? Math.floor(s.started_at * 1000) : Date.now(),
      startedAt: s.started_at ? Math.floor(s.started_at * 1000) : Date.now(),
      updatedAt: s.last_activity_at
        ? Math.floor(s.last_activity_at * 1000)
        : s.started_at
          ? Math.floor(s.started_at * 1000)
          : Date.now(),
      isPinned: Boolean(s.pinned),
      cwd: s.cwd || null,
    }))
  } catch {
    return []
  }
}

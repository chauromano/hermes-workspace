import { existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
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
  slug_customized?: boolean
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

const dbCache = new Map<string, DatabaseSync>()

function getDatabase(dbPath: string): DatabaseSync {
  let db = dbCache.get(dbPath)
  if (!db) {
    try {
      db = new DatabaseSync(dbPath)
      db.exec('PRAGMA busy_timeout = 5000;')
      db.prepare('SELECT 1').get()
      dbCache.set(dbPath, db)
    } catch {
      const normalized = dbPath.replace(/\\/g, '/')
      db = new DatabaseSync(`file:${normalized}?immutable=1`)
    }
  }
  return db
}

function runSqlite(dbPath: string, sql: string): string {
  try {
    const db = getDatabase(dbPath)
    const rows = db.prepare(sql).all()
    return JSON.stringify(rows)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[projects-backend] runSqlite error:', message, '\nSQL:\n', sql)
    throw new Error(`Failed to query projects.db: ${message}`)
  }
}

function runSqliteExec(dbPath: string, sql: string): void {
  try {
    const db = getDatabase(dbPath)
    db.exec(sql)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[projects-backend] runSqliteExec error:', message, '\nSQL:\n', sql)
    throw new Error(`Failed to update projects.db: ${message}`)
  }
}

export function isWindowsHostPath(p: string): boolean {
  return /^[a-zA-Z]:[/\\]/.test(p.trim())
}

export function cleanProjectPath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/')
  if (isWindowsHostPath(trimmed)) {
    const drive = trimmed[0].toUpperCase()
    const rest = trimmed.slice(2).replace(/\/+$/, '')
    return `${drive}:${rest || '/'}`
  }
  return resolve(trimmed).replace(/\\/g, '/')
}

export function toContainerAccessiblePath(raw: string): string | null {
  const cleaned = cleanProjectPath(raw)
  if (isWindowsHostPath(cleaned)) {
    if (cleaned.toLowerCase() === 'd:/workspace') return '/workspace'
    if (cleaned.toLowerCase().startsWith('d:/workspace/')) {
      return '/workspace/' + cleaned.slice('D:/Workspace/'.length)
    }
    return null
  }
  return cleaned
}

export function slugify(name: string): string {
  const s = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
  return s.slice(0, 64) || 'project'
}

export function generateUniqueSlug(
  candidate: string,
  dbPath = getProjectsDbPath(),
): string {
  const base = slugify(candidate)
  let slug = base
  let counter = 1

  while (getProject(slug, dbPath) !== null) {
    counter += 1
    const suffix = `-${counter}`
    slug = `${base.slice(0, 64 - suffix.length).replace(/[-_]+$/, '')}${suffix}`
  }

  return slug
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
  const rawCandidate = slugify(input.slug || name)
  const primaryPath = cleanProjectPath(input.primary_path)
  const now = Math.floor(Date.now() / 1000)

  // Ensure primaryPath exists on disk
  try {
    const containerPrimary = toContainerAccessiblePath(primaryPath)
    if (containerPrimary && !existsSync(containerPrimary)) {
      mkdirSync(containerPrimary, { recursive: true })
    }
  } catch (err) {
    console.warn(`[projects] Warning: Could not create directory ${primaryPath}:`, err)
  }

  // Check existing project with this slug
  const existingBySlug = getProject(rawCandidate, dbPath)

  // 1. Idempotent double-submit retry check: if duplicate request within 30s with same target, return existing
  if (
    existingBySlug &&
    !existingBySlug.archived &&
    existingBySlug.name.toLowerCase() === name.toLowerCase() &&
    existingBySlug.primary_path === primaryPath &&
    now - existingBySlug.created_at < 30
  ) {
    if (input.set_active) {
      setActiveProject(existingBySlug.id, dbPath)
    }
    return existingBySlug
  }

  // 2. Archived project restoration: if an archived project with this slug exists, restore and update it
  if (existingBySlug && existingBySlug.archived) {
    updateProject(
      existingBySlug.id,
      {
        name,
        description: input.description,
        primary_path: primaryPath,
        icon: input.icon,
        color: input.color,
        board_slug: input.board_slug,
      },
      dbPath,
    )
    archiveProject(existingBySlug.id, false, dbPath)
    if (input.set_active) {
      setActiveProject(existingBySlug.id, dbPath)
    }
    const restored = getProject(existingBySlug.id, dbPath)
    if (restored) return restored
  }

  // 3. Resolve slug collision
  let slug = rawCandidate
  if (existingBySlug && !existingBySlug.archived) {
    if (input.slug_customized) {
      throw new Error(`A project with ID "${rawCandidate}" already exists. Please choose a different ID or delete the existing project.`)
    }
    slug = generateUniqueSlug(rawCandidate, dbPath)
  }

  const id = `p_${slug}`

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
      const fPath = cleanProjectPath(folder.path)
      if (fPath === primaryPath) continue
      try {
        const containerFolder = toContainerAccessiblePath(fPath)
        if (containerFolder && !existsSync(containerFolder)) {
          mkdirSync(containerFolder, { recursive: true })
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
    set_active?: boolean
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
    const primary = cleanProjectPath(updates.primary_path)
    try {
      const containerPrimary = toContainerAccessiblePath(primary)
      if (containerPrimary && !existsSync(containerPrimary)) {
        mkdirSync(containerPrimary, { recursive: true })
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

  if (updates.set_active === true) {
    statements.push(
      `INSERT INTO project_meta (key, value) VALUES ('active_id', ${sqliteQuote(proj.id)}) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    )
  } else if (updates.set_active === false) {
    statements.push(
      `DELETE FROM project_meta WHERE key = 'active_id' AND value = ${sqliteQuote(proj.id)};`,
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

  const cleanPath = cleanProjectPath(folderPath)
  try {
    const containerClean = toContainerAccessiblePath(cleanPath)
    if (containerClean && !existsSync(containerClean)) {
      mkdirSync(containerClean, { recursive: true })
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

  const cleanPath = cleanProjectPath(folderPath)
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

export function getAllStateDbPaths(): Array<{ profile: string; path: string; profileName: string; dbPath: string }> {
  const root = getHermesRoot()
  const out: Array<{ profile: string; path: string; profileName: string; dbPath: string }> = []
  const rootDb = getStateDbPath()
  if (existsSync(rootDb)) {
    out.push({ profile: 'default', path: rootDb, profileName: 'default', dbPath: rootDb })
  }
  const profilesDir = join(root, 'profiles')
  if (existsSync(profilesDir)) {
    try {
      for (const name of readdirSync(profilesDir)) {
        if (name.startsWith('.') || name === 'default') continue
        const pDb = join(profilesDir, name, 'state.db')
        try {
          const st = statSync(pDb)
          if (st.isFile() && st.size > 0) {
            out.push({ profile: name, path: pDb, profileName: name, dbPath: pDb })
          }
        } catch {}
      }
    } catch {}
  }
  return out
}

export function normalizePath(p: string): string {
  let s = (p || '').trim()
  if (s.toLowerCase().startsWith('file:///')) {
    try {
      s = decodeURIComponent(s.slice('file:///'.length))
    } catch {
      s = s.slice('file:///'.length)
    }
  }
  s = s.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  if (s === 'd:/workspace') return '/workspace'
  if (s.startsWith('d:/workspace/')) {
    s = '/workspace/' + s.slice('d:/workspace/'.length)
  }
  if (
    s === '/workspace/hermes_default_spaces/architect/express-architecture-kb' ||
    s === '/workspace/hermes/architect/express-architecture-kb'
  ) {
    return '/workspace/obsidian/express-architecture-hub/express-architecture-kb'
  }
  if (
    s === '/workspace/hermes_default_spaces/architect' ||
    s.startsWith('/workspace/hermes_default_spaces/architect/') ||
    s === '/workspace/hermes/architect' ||
    s.startsWith('/workspace/hermes/architect/')
  ) {
    return '/workspace/obsidian/express-architecture-hub'
  }
  return s
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
  cachedDbSessions = null
  if (sessionId) {
    sessionCwdCache.delete(sessionId)
  } else {
    sessionCwdCache.clear()
  }
}

export function getSessionCwdMap(sessionIds: string[], _stateDb = getStateDbPath()): Map<string, string> {
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

  if (missingIds.length > 0) {
    const inList = missingIds.map(sqliteQuote).join(', ')
    const found = new Set<string>()
    for (const { path: dbPath } of getAllStateDbPaths()) {
      try {
        const raw = runSqlite(dbPath, `SELECT id, cwd FROM sessions WHERE id IN (${inList});`)
        if (raw) {
          const rows = JSON.parse(raw) as Array<{ id: string; cwd?: string | null }>
          for (const row of rows) {
            const cwd = row.cwd && row.cwd.trim() ? row.cwd.trim() : ''
            if (cwd || !found.has(row.id)) {
              found.add(row.id)
              sessionCwdCache.set(row.id, { cwd, timestamp: now })
              if (cwd) map.set(row.id, cwd)
            }
          }
        }
      } catch {}
    }
    for (const id of missingIds) {
      if (!found.has(id)) {
        sessionCwdCache.set(id, { cwd: '', timestamp: now })
      }
    }
  }

  return map
}

export function setSessionProject(
  sessionId: string,
  projectId: string | null,
  projectsDb = getProjectsDbPath(),
  _stateDb = getStateDbPath(),
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

  for (const { path: dbPath } of getAllStateDbPaths()) {
    try {
      const sql = `UPDATE sessions SET cwd = ${targetPath ? sqliteQuote(targetPath) : "''"} WHERE id = ${sqliteQuote(sessionId)};`
      runSqliteExec(dbPath, sql)
    } catch {}
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

let cachedDbSessions: {
  sessions: Array<Record<string, unknown>>
  timestamp: number
} | null = null
const DB_SESSIONS_CACHE_TTL_MS = 10_000

export function readSessionsFromStateDb(
  limit = 200,
  _stateDb = getStateDbPath(),
): Array<Record<string, unknown>> {
  const now = Date.now()
  if (cachedDbSessions && now - cachedDbSessions.timestamp < DB_SESSIONS_CACHE_TTL_MS) {
    return cachedDbSessions.sessions.map((s) => ({ ...s }))
  }
  const seen = new Map<string, Record<string, unknown>>()
  for (const { profile, path: dbPath } of getAllStateDbPaths()) {
    try {
      const sql = `SELECT id, title, model, started_at, last_activity_at, message_count, tool_call_count, cwd, pinned, input_tokens, output_tokens, profile_name, parent_session_id FROM sessions WHERE COALESCE(archived, 0) = 0 AND COALESCE(hidden, 0) = 0 ORDER BY COALESCE(last_activity_at, started_at) DESC LIMIT ${limit};`
      const raw = runSqlite(dbPath, sql)
      if (!raw) continue
      const rows = JSON.parse(raw) as Array<Record<string, any>>
      for (const s of rows) {
        if (!s.id || seen.has(s.id)) continue
        const cwd = s.cwd && String(s.cwd).trim() ? String(s.cwd).trim() : ''
        sessionCwdCache.set(s.id, { cwd, timestamp: now })
        const updatedMs = s.last_activity_at
          ? Math.floor(s.last_activity_at * 1000)
          : s.started_at
            ? Math.floor(s.started_at * 1000)
            : now
        seen.set(s.id, {
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
          createdAt: s.started_at ? Math.floor(s.started_at * 1000) : now,
          startedAt: s.started_at ? Math.floor(s.started_at * 1000) : now,
          updatedAt: updatedMs,
          lastPromptAt: updatedMs,
          isPinned: Boolean(s.pinned),
          cwd: cwd || null,
          profileName: (s.profile_name && String(s.profile_name).trim()) || profile || 'default',
          agentProfile: (s.profile_name && String(s.profile_name).trim()) || profile || 'default',
          parentSessionId: s.parent_session_id || null,
        })
      }
    } catch {}
  }
  const result = Array.from(seen.values())
    .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit * 2)
  cachedDbSessions = { sessions: result, timestamp: now }
  return result
}


export function getSessionMetaMap(
  sessionIds: string[],
): Map<string, { cwd: string | null; profileName: string; parentSessionId: string | null }> {
  const map = new Map<
    string,
    { cwd: string | null; profileName: string; parentSessionId: string | null }
  >()
  if (sessionIds.length === 0) return map

  const inList = sessionIds.map(sqliteQuote).join(', ')
  for (const { profile, path: dbPath } of getAllStateDbPaths()) {
    try {
      const raw = runSqlite(
        dbPath,
        `SELECT id, cwd, profile_name, parent_session_id FROM sessions WHERE id IN (${inList});`,
      )
      if (raw) {
        const rows = JSON.parse(raw) as Array<{
          id: string
          cwd?: string | null
          profile_name?: string | null
          parent_session_id?: string | null
        }>
        for (const row of rows) {
          if (!map.has(row.id)) {
            map.set(row.id, {
              cwd: row.cwd && row.cwd.trim() ? row.cwd.trim() : null,
              profileName:
                (row.profile_name && row.profile_name.trim()) || profile || 'default',
              parentSessionId: row.parent_session_id || null,
            })
          }
        }
      }
    } catch {}
  }
  return map
}

export function setSessionProfile(sessionId: string, profileName: string): void {
  if (!sessionId || !profileName) return
  const safeProfile = sqliteQuote(profileName.trim())
  const safeId = sqliteQuote(sessionId.trim())
  for (const { path: dbPath } of getAllStateDbPaths()) {
    try {
      runSqliteExec(
        dbPath,
        `UPDATE sessions SET profile_name = ${safeProfile} WHERE id = ${safeId};`,
      )
    } catch {}
  }
}

export function readMessagesFromAllStateDbs(
  sessionId: string,
  limit = 500,
): Array<Record<string, any>> {
  const res = readSessionMessagesFromStateDb(sessionId, limit)
  return res ? res.messages : []
}

export function readSessionMessagesFromStateDb(
  sessionId: string,
  limit = 200,
): { messages: Array<Record<string, any>>; model?: string } | null {
  if (!sessionId || !sessionId.trim()) return null
  const cleanId = sessionId.trim()
  for (const { path: dbPath } of getAllStateDbPaths()) {
    try {
      const sessRaw = runSqlite(
        dbPath,
        `SELECT id, model FROM sessions WHERE id = ${sqliteQuote(cleanId)} LIMIT 1;`,
      )
      const sessRows = sessRaw ? (JSON.parse(sessRaw) as Array<{ id: string; model?: string }>) : []
      if (sessRows.length === 0) continue

      const msgRaw = runSqlite(
        dbPath,
        `SELECT id, session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp, token_count, finish_reason, reasoning FROM messages WHERE session_id = ${sqliteQuote(cleanId)} AND COALESCE(active, 1) = 1 ORDER BY timestamp ASC, id ASC LIMIT ${limit > 0 ? limit : 500};`,
      )
      const messages = msgRaw ? (JSON.parse(msgRaw) as Array<Record<string, any>>) : []
      return {
        messages,
        model: sessRows[0]?.model || undefined,
      }
    } catch {}
  }
  return null
}

let cachedActiveLeases: {
  leases: Map<string, boolean>
  timestamp: number
} | null = null
const LEASES_CACHE_TTL_MS = 5_000

export function getSessionActivityMetaMap(
  sessionIds: string[],
  _stateDb = getStateDbPath(),
): Map<string, { lastPromptAt: number | null; hasActiveLease: boolean }> {
  const map = new Map<string, { lastPromptAt: number | null; hasActiveLease: boolean }>()
  if (sessionIds.length === 0) return map

  const now = Date.now()
  if (!cachedActiveLeases || now - cachedActiveLeases.timestamp >= LEASES_CACHE_TTL_MS) {
    const leases = new Map<string, boolean>()
    const nowSec = now / 1000
    for (const { path: dbPath } of getAllStateDbPaths()) {
      try {
        const leaseSql = `SELECT conversation_id, expires_at FROM session_turn_leases WHERE expires_at > ${nowSec};`
        const leaseRaw = runSqlite(dbPath, leaseSql)
        const leaseRows = leaseRaw
          ? (JSON.parse(leaseRaw) as Array<{ conversation_id: string; expires_at?: number | null }>)
          : []
        for (const lr of leaseRows) {
          if (lr.conversation_id) {
            leases.set(lr.conversation_id, true)
          }
        }
      } catch {}
    }
    cachedActiveLeases = { leases, timestamp: now }
  }

  for (const id of sessionIds) {
    if (cachedActiveLeases.leases.get(id)) {
      map.set(id, { lastPromptAt: null, hasActiveLease: true })
    }
  }

  return map
}

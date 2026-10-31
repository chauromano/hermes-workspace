import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  slugify,
  generateUniqueSlug,
  listProjects,
  getProject,
  createProject,
  setActiveProject,
  deleteProject,
  archiveProject,
  createWorkspaceDirectory,
} from '../projects-backend'
import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('projects-backend', () => {
  it('correctly creates slugs from project names', () => {
    expect(slugify('Express Architecture Hub')).toBe('express-architecture-hub')
    expect(slugify('Homelab / Operations & Monitoring!')).toBe('homelab-operations-monitoring')
    expect(slugify('   __Test_Project--   ')).toBe('test_project')
  })

  // Test with a real temporary SQLite DB
  const testDb = join(tmpdir(), `test_projects_${Date.now()}.db`)

  function initTestDb(dbPath: string) {
    const schema = `
      CREATE TABLE IF NOT EXISTS projects (
        id            TEXT PRIMARY KEY,
        slug          TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        description   TEXT,
        icon          TEXT,
        color         TEXT,
        board_slug    TEXT,
        primary_path  TEXT,
        created_at    INTEGER NOT NULL,
        archived      INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS project_folders (
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        path        TEXT NOT NULL,
        label       TEXT,
        is_primary  INTEGER NOT NULL DEFAULT 0,
        added_at    INTEGER NOT NULL,
        PRIMARY KEY (project_id, path)
      );
      CREATE TABLE IF NOT EXISTS project_meta (
        key    TEXT PRIMARY KEY,
        value  TEXT
      );
    `
    execFileSync('sqlite3', [dbPath, schema])
  }

  afterEach(() => {
    if (existsSync(testDb)) {
      try {
        unlinkSync(testDb)
      } catch {}
    }
  })

  it('performs full project lifecycle: create, list, set-active, and delete', () => {
    initTestDb(testDb)

    // Initial state is empty
    const initial = listProjects({ dbPath: testDb })
    expect(initial.projects).toHaveLength(0)
    expect(initial.active_id).toBeNull()

    // Create Project 1
    const p1 = createProject(
      {
        name: 'Express Architecture',
        primary_path: '/workspace/obsidian/express-architecture-hub',
        description: 'EA principles and documentation',
        set_active: true,
      },
      testDb,
    )

    expect(p1.id).toBe('p_express-architecture')
    expect(p1.slug).toBe('express-architecture')
    expect(p1.primary_path).toBe('/workspace/obsidian/express-architecture-hub')
    expect(p1.folders).toHaveLength(1)
    expect(p1.folders[0].is_primary).toBe(true)
    expect(p1.is_active).toBe(true)

    // List reflects p1 as active
    const listed = listProjects({ dbPath: testDb })
    expect(listed.projects).toHaveLength(1)
    expect(listed.active_id).toBe('p_express-architecture')
    expect(listed.projects[0].is_active).toBe(true)

    // Create Project 2
    const p2 = createProject(
      {
        name: 'Homelab',
        primary_path: '/workspace/Homelab',
        set_active: false,
      },
      testDb,
    )
    expect(p2.id).toBe('p_homelab')

    // Switch active project
    const activeRes = setActiveProject('homelab', testDb)
    expect(activeRes.active_id).toBe('p_homelab')

    const p2Fetched = getProject('p_homelab', testDb)
    expect(p2Fetched?.is_active).toBe(true)

    // Delete Project 1
    const delRes = deleteProject('p_express-architecture', testDb)
    expect(delRes).toBe(true)

    const afterDel = listProjects({ dbPath: testDb })
    expect(afterDel.projects).toHaveLength(1)
    expect(afterDel.projects[0].id).toBe('p_homelab')
  })

  it('creates workspace directories safely and rejects traversal', () => {
    const testWorkspaceRoot = join(tmpdir(), `test_ws_${Date.now()}`)
    mkdirSync(testWorkspaceRoot, { recursive: true })
    const oldEnv = process.env.HERMES_WORKSPACE_DIR
    process.env.HERMES_WORKSPACE_DIR = testWorkspaceRoot

    try {
      // 1. Create a root-level folder in workspace
      const f1 = createWorkspaceDirectory('', 'my-new-app')
      expect(f1.name).toBe('my-new-app')
      expect(existsSync(f1.path)).toBe(true)

      // 2. Create nested subfolder
      const f2 = createWorkspaceDirectory('my-new-app', 'packages')
      expect(f2.name).toBe('packages')
      expect(existsSync(f2.path)).toBe(true)

      // 3. Reject directory traversal attempts
      expect(() => createWorkspaceDirectory('../outside', 'bad')).toThrow()
      expect(() => createWorkspaceDirectory('', '../outside')).toThrow()
      expect(() => createWorkspaceDirectory('', '..')).toThrow()
      expect(() => createWorkspaceDirectory('', '.')).toThrow()
      expect(() => createWorkspaceDirectory('', 'foo/bar')).toThrow()

      // 4. Reject empty name
      expect(() => createWorkspaceDirectory('', '')).toThrow()
    } finally {
      process.env.HERMES_WORKSPACE_DIR = oldEnv
      if (existsSync(testWorkspaceRoot)) {
        try {
          rmSync(testWorkspaceRoot, { recursive: true, force: true })
        } catch {}
      }
    }
  })

  it('automatically ensures project primary path directory exists on disk', () => {
    initTestDb(testDb)
    const testTargetDir = join(tmpdir(), `test_proj_dir_${Date.now()}`)
    expect(existsSync(testTargetDir)).toBe(false)

    try {
      const p = createProject(
        {
          name: 'Auto Dir Project',
          primary_path: testTargetDir,
        },
        testDb,
      )

      expect(p.id).toBe('p_auto-dir-project')
      expect(existsSync(testTargetDir)).toBe(true)
    } finally {
      if (existsSync(testTargetDir)) {
        try {
          rmSync(testTargetDir, { recursive: true, force: true })
        } catch {}
      }
    }
  })

  it('handles slug collisions gracefully and auto-deduplicates without UNIQUE constraint failure', () => {
    initTestDb(testDb)
    const testDir = join(tmpdir(), `test_dir_collision_${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      // 1. Create first project with name "My App" -> slug "my-app"
      const p1 = createProject({ name: 'My App', primary_path: testDir }, testDb)
      expect(p1.slug).toBe('my-app')
      expect(p1.id).toBe('p_my-app')

      // 2. Immediate idempotent retry (same name, path, within 30s) should return p1
      const p1Retry = createProject({ name: 'My App', primary_path: testDir }, testDb)
      expect(p1Retry.id).toBe(p1.id)
      expect(p1Retry.slug).toBe(p1.slug)

      // 3. Create second project with same name but different path -> auto-deduplicates to "my-app-2"
      const testDir2 = join(tmpdir(), `test_dir_collision2_${Date.now()}`)
      mkdirSync(testDir2, { recursive: true })
      const p2 = createProject({ name: 'My App', primary_path: testDir2 }, testDb)
      expect(p2.slug).toBe('my-app-2')
      expect(p2.id).toBe('p_my-app-2')

      // 4. If slug is explicitly customized and already taken, throws clear error
      expect(() => {
        createProject(
          {
            name: 'Another App',
            slug: 'my-app',
            slug_customized: true,
            primary_path: testDir2,
          },
          testDb,
        )
      }).toThrow(/already exists/)

      // 5. Test generateUniqueSlug directly
      expect(generateUniqueSlug('my-app', testDb)).toBe('my-app-3')

      // 6. Test restoring an archived project with same slug
      archiveProject(p1.id, true, testDb)
      const pArchived = getProject(p1.id, testDb)
      expect(pArchived?.archived).toBe(true)

      const pRestored = createProject({ name: 'My App Restored', slug: 'my-app', primary_path: testDir }, testDb)
      expect(pRestored.id).toBe(p1.id)
      expect(pRestored.slug).toBe('my-app')
      expect(pRestored.archived).toBe(false)
      expect(pRestored.name).toBe('My App Restored')
    } finally {
      if (existsSync(testDir)) {
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {}
      }
    }
  })
})

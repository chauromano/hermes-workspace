import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  slugify,
  listProjects,
  getProject,
  createProject,
  setActiveProject,
  deleteProject,
} from '../projects-backend'
import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
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
})

import fs from 'node:fs'
import path from 'node:path'
import { getStateDir } from './workspace-state-dir'

function getPinnedSessionsPath(): string {
  return path.join(getStateDir(), 'pinned-sessions.json')
}

export function readPinnedSessions(): string[] {
  const filePath = getPinnedSessionsPath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      }
      if (parsed && Array.isArray(parsed.pinnedSessionKeys)) {
        return parsed.pinnedSessionKeys.filter(
          (item: unknown): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      }
    }
  } catch {
    // ignore parse error, return empty
  }
  return []
}

export function writePinnedSessions(keys: string[]): string[] {
  const filePath = getPinnedSessionsPath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const unique = Array.from(
    new Set(
      keys.filter((k) => typeof k === 'string' && k.trim().length > 0),
    ),
  )
  fs.writeFileSync(
    filePath,
    JSON.stringify({ pinnedSessionKeys: unique }, null, 2),
    'utf-8',
  )
  return unique
}

export function pinServerSession(key: string): string[] {
  const current = readPinnedSessions()
  if (!current.includes(key)) {
    return writePinnedSessions([...current, key])
  }
  return current
}

export function unpinServerSession(key: string): string[] {
  const current = readPinnedSessions()
  return writePinnedSessions(current.filter((k) => k !== key))
}

export function toggleServerPinnedSession(key: string): {
  isPinned: boolean
  pinnedSessionKeys: string[]
} {
  const current = readPinnedSessions()
  const exists = current.includes(key)
  let updated: string[]
  let isPinned = false
  if (exists) {
    updated = current.filter((k) => k !== key)
    isPinned = false
  } else {
    updated = [...current, key]
    isPinned = true
  }
  const finalKeys = writePinnedSessions(updated)
  return { isPinned, pinnedSessionKeys: finalKeys }
}

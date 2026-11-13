import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

export type SwarmChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number | null
}

export type SwarmChatReadResult = {
  sessionId: string | null
  sessionTitle: string | null
  messages: Array<SwarmChatMessage>
  ok: boolean
  error?: string
}

function extractMessageText(content: unknown): string {
  if (typeof content !== 'string') {
    return content != null ? String(content).trim() : ''
  }
  const stripped = content.trim()
  if (!stripped.startsWith('[') && !stripped.startsWith('{')) {
    return stripped
  }
  try {
    const parsed = JSON.parse(content) as unknown
    if (Array.isArray(parsed)) {
      const parts: Array<string> = []
      for (const block of parsed) {
        if (!block || typeof block !== 'object') continue
        const rec = block as Record<string, unknown>
        const btype = rec.type
        if (btype === undefined || btype === null || btype === 'text') {
          parts.push(typeof rec.text === 'string' ? rec.text : '')
        } else if (btype === 'tool_use') {
          parts.push(`[tool:${String(rec.name ?? '?')}]`)
        } else if (btype === 'tool_result') {
          let val = rec.content ?? ''
          if (Array.isArray(val)) {
            val = val
              .filter(
                (v): v is Record<string, unknown> =>
                  Boolean(v && typeof v === 'object' && (v as Record<string, unknown>).type === 'text'),
              )
              .map((v) => String(v.text ?? ''))
              .join('\n')
          }
          parts.push(String(val).slice(0, 400))
        }
      }
      return parts.filter(Boolean).join('\n').trim()
    }
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Record<string, unknown>
      return String(rec.text ?? rec.content ?? content).trim()
    }
  } catch {
    // Fall back to raw content string
  }
  return stripped
}

function parseTimestamp(rawTs: unknown): number | null {
  if (typeof rawTs === 'number' && Number.isFinite(rawTs)) return Math.trunc(rawTs)
  if (typeof rawTs === 'string') {
    const num = Number(rawTs)
    if (Number.isFinite(num)) return Math.trunc(num)
  }
  return null
}

function normalizeRole(role: unknown): SwarmChatMessage['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') {
    return role
  }
  return 'assistant'
}

export function readWorkerMessages(profilePath: string, limit: number): SwarmChatReadResult {
  const dbPath = join(profilePath, 'state.db')
  if (!existsSync(dbPath)) {
    return {
      sessionId: null,
      sessionTitle: null,
      messages: [],
      ok: false,
    }
  }

  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    db.exec('PRAGMA busy_timeout = 1000;')

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>
    const tableNames = new Set(tables.map((t) => t.name))

    let sessionId: string | null = null
    let sessionTitle: string | null = null
    const messages: Array<SwarmChatMessage> = []

    if (tableNames.has('sessions')) {
      const sessionColsInfo = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
      const sessionCols = new Set(sessionColsInfo.map((c) => c.name))
      const titleCol = sessionCols.has('title') ? 'title' : null
      const startedCol = sessionCols.has('started_at')
        ? 'started_at'
        : sessionCols.has('created_at')
          ? 'created_at'
          : null
      const orderClause = startedCol ? `ORDER BY ${startedCol} DESC` : ''
      const selectCols = ['id']
      if (titleCol) selectCols.push(titleCol)
      if (startedCol) selectCols.push(startedCol)

      const row = db
        .prepare(`SELECT ${selectCols.join(', ')} FROM sessions ${orderClause} LIMIT 1`)
        .get() as Record<string, unknown> | undefined

      if (row) {
        sessionId = row.id != null ? String(row.id) : null
        if (titleCol) {
          sessionTitle = row[titleCol] != null ? String(row[titleCol]) : null
        }
      }
    }

    if (sessionId && tableNames.has('messages')) {
      const msgColsInfo = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
      const msgCols = new Set(msgColsInfo.map((c) => c.name))
      const roleCol = msgCols.has('role') ? 'role' : null
      const contentCol = msgCols.has('content')
        ? 'content'
        : msgCols.has('text')
          ? 'text'
          : null
      const tsCol = msgCols.has('created_at')
        ? 'created_at'
        : msgCols.has('timestamp')
          ? 'timestamp'
          : msgCols.has('started_at')
            ? 'started_at'
            : null

      if (roleCol && contentCol) {
        const orderBy = tsCol ?? 'id'
        const tsSelect = tsCol ? `, ${tsCol} as ts` : ''
        const rows = db
          .prepare(
            `SELECT id, ${roleCol} as role, ${contentCol} as content${tsSelect} FROM messages WHERE session_id = ? ORDER BY ${orderBy} DESC LIMIT ?`,
          )
          .all(sessionId, limit) as Array<Record<string, unknown>>

        for (const r of rows.reverse()) {
          messages.push({
            id: String(r.id),
            role: normalizeRole(r.role),
            content: extractMessageText(r.content),
            timestamp: tsCol ? parseTimestamp(r.ts) : null,
          })
        }
      }
    }

    return { sessionId, sessionTitle, messages, ok: true }
  } catch (err) {
    return {
      sessionId: null,
      sessionTitle: null,
      messages: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    try {
      db?.close()
    } catch {
      // ignore close errors
    }
  }
}

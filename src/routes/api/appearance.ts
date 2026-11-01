import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

export interface AppearancePayload {
  theme?: string
  interfaceFont?: string
  interfaceDensity?: string
  accentColor?: string
}

const STORE_FILE = join(
  process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? join(homedir(), '.hermes'),
  'workspace-appearance.json',
)

function readAppearanceFile(): AppearancePayload {
  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, 'utf8')
      return JSON.parse(raw) as AppearancePayload
    }
  } catch {
    // Corrupt or unreadable, return empty object
  }
  return {}
}

function writeAppearanceFile(data: AppearancePayload): void {
  try {
    const dir = dirname(STORE_FILE)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  } catch (err) {
    console.warn(`[appearance] Failed to save appearance to ${STORE_FILE}`, err)
  }
}

export const Route = createFileRoute('/api/appearance')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        return json(readAppearanceFile())
      },
      PUT: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        try {
          const body = (await request.json().catch(() => ({}))) as AppearancePayload
          const existing = readAppearanceFile()
          const updated: AppearancePayload = {
            ...existing,
            ...(typeof body.theme === 'string' && body.theme ? { theme: body.theme } : {}),
            ...(typeof body.interfaceFont === 'string' && body.interfaceFont ? { interfaceFont: body.interfaceFont } : {}),
            ...(typeof body.interfaceDensity === 'string' && body.interfaceDensity ? { interfaceDensity: body.interfaceDensity } : {}),
            ...(typeof body.accentColor === 'string' && body.accentColor ? { accentColor: body.accentColor } : {}),
          }
          writeAppearanceFile(updated)
          return json({ ok: true, ...updated })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update appearance'
          return json({ error: message }, { status: 500 })
        }
      },
    },
  },
})

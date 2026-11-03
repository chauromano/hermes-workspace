import fs from 'node:fs'

const DEFAULT_BRIDGE_URL =
  process.env.ANTIGRAVITY_BRIDGE_URL || 'http://host.docker.internal:9292'
const TOKEN_FILE_PATHS = [
  '/opt/data/scripts/bridge_token.txt',
  '/root/.hermes/scripts/bridge_token.txt',
  'D:/Workspace/Homelab/stacks/hermes/data/hermes_home/scripts/bridge_token.txt',
]

function getBridgeToken(): string {
  if (process.env.ANTIGRAVITY_BRIDGE_TOKEN) {
    return process.env.ANTIGRAVITY_BRIDGE_TOKEN.trim()
  }
  for (const p of TOKEN_FILE_PATHS) {
    try {
      if (fs.existsSync(p)) {
        const token = fs.readFileSync(p, 'utf-8').trim()
        if (token) return token
      }
    } catch {
      // ignore
    }
  }
  return ''
}

function getBridgeHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getBridgeToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Bridge-Token': token } : {}),
    ...extra,
  }
}

export type AntigravityModelEntry = {
  id: string
  name: string
  family: string
  effort: string
  provider: string
}

export type AntigravitySessionSummary = {
  key: string
  friendlyId: string
  id: string
  kind: string
  source: 'antigravity'
  surface: 'desktop' | 'cli' | 'both'
  agentProfile: 'antigravity'
  status: string
  model: string
  label: string
  title: string
  derivedTitle: string
  preview: string
  cwd: string
  stepCount: number
  message_count: number
  messageCount: number
  createdAt: number
  startedAt: number
  updatedAt: number
  lastPromptAt: number
}

export type HostFolderListing = {
  root: string
  path: string
  parent: string | null
  drives?: Array<{ name: string; path: string; hasChildren: boolean }>
  folders: Array<{ name: string; path: string; hasChildren: boolean }>
}

export async function checkAntigravityBridgeHealth(): Promise<{
  online: boolean
  agyPath?: string
  modelsCount?: number
}> {
  try {
    const resp = await fetch(`${DEFAULT_BRIDGE_URL}/health`, {
      headers: getBridgeHeaders(),
      signal: AbortSignal.timeout(2000),
    })
    if (!resp.ok) return { online: false }
    const data = (await resp.json()) as Record<string, unknown>
    return {
      online: data.status === 'ok' && Boolean(data.agy_exists),
      agyPath: typeof data.agy_path === 'string' ? data.agy_path : undefined,
      modelsCount:
        typeof data.models_count === 'number' ? data.models_count : undefined,
    }
  } catch {
    return { online: false }
  }
}

export async function listAntigravityModels(): Promise<Array<AntigravityModelEntry>> {
  try {
    const resp = await fetch(`${DEFAULT_BRIDGE_URL}/models`, {
      headers: getBridgeHeaders(),
      signal: AbortSignal.timeout(2500),
    })
    if (!resp.ok) return []
    const data = (await resp.json()) as { models?: Array<AntigravityModelEntry> }
    return Array.isArray(data.models) ? data.models : []
  } catch {
    return []
  }
}

export async function listAntigravitySessions(
  limit = 250,
): Promise<Array<AntigravitySessionSummary>> {
  try {
    const resp = await fetch(`${DEFAULT_BRIDGE_URL}/sessions?limit=${limit}`, {
      headers: getBridgeHeaders(),
      signal: AbortSignal.timeout(3500),
    })
    if (!resp.ok) return []
    const data = (await resp.json()) as {
      sessions?: Array<AntigravitySessionSummary>
    }
    return Array.isArray(data.sessions) ? data.sessions : []
  } catch {
    return []
  }
}

export async function isAntigravitySession(sessionId: string): Promise<boolean> {
  if (!sessionId || sessionId === 'new' || sessionId === 'main') return false
  if (sessionId.startsWith('agy_')) return true
  const sessions = await listAntigravitySessions(400)
  return sessions.some((s) => s.id === sessionId || s.key === sessionId)
}

export async function getAntigravitySessionHistory(
  sessionId: string,
): Promise<Array<Record<string, unknown>>> {
  const cleanId = sessionId.startsWith('agy_') ? sessionId.slice(4) : sessionId
  try {
    const resp = await fetch(
      `${DEFAULT_BRIDGE_URL}/sessions/${encodeURIComponent(cleanId)}/history`,
      {
        headers: getBridgeHeaders(),
        signal: AbortSignal.timeout(6000),
      },
    )
    if (!resp.ok) return []
    const data = (await resp.json()) as {
      messages?: Array<Record<string, unknown>>
    }
    return Array.isArray(data.messages) ? data.messages : []
  } catch {
    return []
  }
}

export async function updateAntigravitySession(
  sessionId: string,
  updates: { title?: string; cwd?: string; model?: string },
): Promise<boolean> {
  const cleanId = sessionId.startsWith('agy_') ? sessionId.slice(4) : sessionId
  try {
    const resp = await fetch(
      `${DEFAULT_BRIDGE_URL}/sessions/${encodeURIComponent(cleanId)}`,
      {
        method: 'PATCH',
        headers: getBridgeHeaders(),
        body: JSON.stringify(updates),
        signal: AbortSignal.timeout(3500),
      },
    )
    return resp.ok
  } catch {
    return false
  }
}

export async function deleteAntigravitySession(sessionId: string): Promise<boolean> {
  const cleanId = sessionId.startsWith('agy_') ? sessionId.slice(4) : sessionId
  try {
    const resp = await fetch(
      `${DEFAULT_BRIDGE_URL}/sessions/${encodeURIComponent(cleanId)}`,
      {
        method: 'DELETE',
        headers: getBridgeHeaders(),
        signal: AbortSignal.timeout(3500),
      },
    )
    return resp.ok
  } catch {
    return false
  }
}

export async function listHostFolders(
  folderPath = 'D:/Workspace',
): Promise<HostFolderListing | null> {
  try {
    const resp = await fetch(
      `${DEFAULT_BRIDGE_URL}/fs/folders?path=${encodeURIComponent(folderPath)}`,
      {
        headers: getBridgeHeaders(),
        signal: AbortSignal.timeout(3500),
      },
    )
    if (!resp.ok) return null
    return (await resp.json()) as HostFolderListing
  } catch {
    return null
  }
}

export async function createHostFolder(
  parentPath: string,
  name: string,
): Promise<{
  ok: boolean
  folder?: { name: string; path: string; hasChildren: boolean }
  error?: string
}> {
  try {
    const resp = await fetch(`${DEFAULT_BRIDGE_URL}/fs/mkdir`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: JSON.stringify({ parentPath, name }),
      signal: AbortSignal.timeout(3500),
    })
    return (await resp.json()) as {
      ok: boolean
      folder?: { name: string; path: string; hasChildren: boolean }
      error?: string
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function openAntigravityStream(params: {
  conversationId?: string
  prompt: string
  model?: string
  effort?: string
  mode?: string
  cwd?: string
  signal?: AbortSignal
}): Promise<Response> {
  return fetch(`${DEFAULT_BRIDGE_URL}/stream`, {
    method: 'POST',
    headers: getBridgeHeaders({ Accept: 'text/event-stream' }),
    body: JSON.stringify({
      conversationId: params.conversationId,
      prompt: params.prompt,
      model: params.model,
      effort: params.effort,
      mode: params.mode || 'auto',
      cwd: params.cwd,
    }),
    signal: params.signal,
  })
}

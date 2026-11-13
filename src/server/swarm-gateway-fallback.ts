import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'yaml'
import { getProfilesDir, getWorkspaceClaudeHome } from './claude-paths'
import { BEARER_TOKEN, getActiveGatewayUrl } from './gateway-capabilities'
import { rosterByWorkerId } from './swarm-roster'

export type GatewayExecutionResult = {
  ok: boolean
  output: string
  error: string | null
  model: string
}

export function resolveWorkerProfilePath(workerId: string): string {
  const normalized = workerId.trim().toLowerCase()
  if (normalized === 'general' || normalized === 'default') {
    return getWorkspaceClaudeHome()
  }
  return join(getProfilesDir(), workerId.trim())
}

function readWorkerModel(profilePath: string): string {
  const configPath = join(profilePath, 'config.yaml')
  if (!existsSync(configPath)) return 'hermes-agent'
  try {
    const raw = yaml.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown> | null
    const modelVal = raw?.model
    if (typeof modelVal === 'string' && modelVal.trim()) return modelVal.trim()
    if (modelVal && typeof modelVal === 'object') {
      const rec = modelVal as Record<string, unknown>
      const name = rec.default ?? rec.name
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
  } catch {
    // ignore malformed config.yaml
  }
  return 'hermes-agent'
}

function buildWorkerSystemPrompt(workerId: string, profilePath: string): string | null {
  const parts: Array<string> = []
  const roster = rosterByWorkerId([workerId]).get(workerId)
  if (roster) {
    parts.push(`You are ${roster.name} (${roster.role}).`)
    if (roster.mission) parts.push(`Mission: ${roster.mission}`)
  }
  const soulPath = join(profilePath, 'SOUL.md')
  if (existsSync(soulPath)) {
    try {
      const soul = readFileSync(soulPath, 'utf-8').trim()
      if (soul) parts.push(soul.slice(0, 1500))
    } catch {
      // ignore read errors
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

export async function executeWorkerViaGateway(
  workerId: string,
  prompt: string,
  options?: { timeoutMs?: number },
): Promise<GatewayExecutionResult> {
  const profilePath = resolveWorkerProfilePath(workerId)
  const model = readWorkerModel(profilePath)
  const gatewayUrl = getActiveGatewayUrl(workerId)
  const systemPrompt = buildWorkerSystemPrompt(workerId, profilePath)
  const timeoutMs = options?.timeoutMs ?? 120_000

  const messages: Array<{ role: 'system' | 'user'; content: string }> = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (BEARER_TOKEN) {
    headers.Authorization = `Bearer ${BEARER_TOKEN}`
  }

  try {
    const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        output: '',
        error: `Gateway HTTP ${res.status}: ${text.slice(0, 300) || res.statusText}`,
        model,
      }
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = payload.choices?.[0]?.message?.content
    const output = typeof content === 'string' ? content.trim() : ''
    if (!output) {
      return {
        ok: false,
        output: '',
        error: 'Gateway returned empty completion',
        model,
      }
    }
    return {
      ok: true,
      output,
      error: null,
      model,
    }
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      model,
    }
  }
}

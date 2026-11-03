import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { createSession } from '../../../server/claude-api'
import { openaiChat } from '../../../server/openai-compat-api'
import { readProfile } from '../../../server/profiles-browser'
import {
  appendAssistantMessageToSession,
  getProject,
  updateSessionMetadata,
} from '../../../server/projects-backend'
import { publishChatEvent } from '../../../server/chat-event-bus'
import { createPersistedRun, markRunStatus } from '../../../server/run-store'
import { openAntigravityStream } from '../../../server/antigravity-bridge'

export const Route = createFileRoute('/api/sessions/delegate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = (await request.json()) as {
            parentSessionKey: string
            targetProfile: string
            prompt: string
            projectId?: string | null
            cwd?: string | null
          }

          const { parentSessionKey, targetProfile, prompt, projectId } = body

          if (!parentSessionKey?.trim() || !targetProfile?.trim() || !prompt?.trim()) {
            return json(
              { ok: false, error: 'Missing required parameters (parentSessionKey, targetProfile, prompt)' },
              { status: 400 },
            )
          }

          const trimmedProfile = targetProfile.trim()
          let profileDetail: ReturnType<typeof readProfile> | null = null
          try {
            profileDetail = readProfile(trimmedProfile)
          } catch {
            // Allow default or antigravity
          }

          const childSessionKey = randomUUID()
          const snippet = prompt.replace(/\s+/g, ' ').slice(0, 48)
          const title = `@${trimmedProfile}: ${snippet}`

          // Determine model for the profile
          let model = profileDetail?.config?.model as string | undefined
          if (typeof model === 'object' && model !== null) {
            model = (model as any).default || (model as any).name
          }
          if (!model && trimmedProfile === 'antigravity') {
            model = 'antigravity/gemini-3.8-flash'
          }

          // Determine cwd
          let effectiveCwd = body.cwd?.trim() || null
          if (!effectiveCwd && projectId) {
            try {
              const proj = getProject(projectId)
              if (proj?.primary_path) effectiveCwd = proj.primary_path
            } catch {}
          }
          if (!effectiveCwd && trimmedProfile !== 'default') {
            effectiveCwd = `/workspace/hermes_default_spaces/${trimmedProfile}`
            try {
              fs.mkdirSync(effectiveCwd, { recursive: true })
            } catch {}
          }

          // 1. Create the session via gateway API (with graceful local fallback)
          try {
            const timeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 500),
            )
            await Promise.race([
              createSession({
                id: childSessionKey,
                title,
                model: typeof model === 'string' ? model : undefined,
              }),
              timeout,
            ])
          } catch {
            // graceful local fallback
          }

          // 2. Stamp parent_session_id, profile_name, cwd, title in SQLite
          updateSessionMetadata(childSessionKey, {
            parentSessionId: parentSessionKey,
            profileName: trimmedProfile,
            cwd: effectiveCwd,
            title,
          })

          const runId = randomUUID()

          // 3. Register persisted run
          await createPersistedRun({
            runId,
            sessionKey: childSessionKey,
            friendlyId: childSessionKey,
          }).catch(() => {})

          // 4. Kick off background execution asynchronously
          void (async () => {
            let collectedText = ''
            try {
              if (trimmedProfile === 'antigravity') {
                const res = await openAntigravityStream({
                  conversationId: childSessionKey,
                  prompt,
                  model: model || 'antigravity/gemini-3.8-flash',
                  cwd: effectiveCwd || undefined,
                })
                if (res.body) {
                  const reader = res.body.getReader()
                  const decoder = new TextDecoder()
                  let buf = ''
                  while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    buf += decoder.decode(value, { stream: true })
                    const lines = buf.split('\n')
                    buf = lines.pop() || ''
                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        const raw = line.slice(6).trim()
                        if (raw && raw !== '[DONE]') {
                          try {
                            const parsed = JSON.parse(raw)
                            if (parsed.text) collectedText += parsed.text
                            else if (parsed.content) collectedText += parsed.content
                            else if (parsed.delta?.text) collectedText += parsed.delta.text
                          } catch {}
                        }
                      }
                    }
                  }
                }
              } else {
                const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
                if (profileDetail?.systemPrompt) {
                  messages.push({ role: 'system', content: profileDetail.systemPrompt })
                }
                messages.push({ role: 'user', content: prompt })

                const stream = await openaiChat(messages, {
                  model: typeof model === 'string' ? model : undefined,
                  stream: true,
                  sessionId: childSessionKey,
                })
                for await (const chunk of stream) {
                  if (chunk.type === 'content') {
                    collectedText += chunk.text
                  }
                }
              }
            } catch (runErr) {
              console.error(`[delegate] Background run error for child session ${childSessionKey}:`, runErr)
              collectedText = collectedText || `*(Error delegating task to @${trimmedProfile})*`
            } finally {
              await markRunStatus(childSessionKey, runId, 'complete').catch(() => {})

              // Append response into child session
              if (collectedText.trim()) {
                appendAssistantMessageToSession(childSessionKey, collectedText.trim())
              }

              // Append response into parent session
              if (collectedText.trim()) {
                const injectedReply = `> **@${trimmedProfile}** completed side task ([View Session](/chat/${childSessionKey})):\n>\n> ${collectedText.trim().replace(/\n/g, '\n> ')}`
                appendAssistantMessageToSession(parentSessionKey, injectedReply)
              }

              // Broadcast event
              publishChatEvent('side_task_complete', {
                parentSessionKey,
                childSessionKey,
                targetProfile: trimmedProfile,
                text: collectedText,
              })
            }
          })()

          return json({
            ok: true,
            childSessionKey,
            parentSessionKey,
            targetProfile: trimmedProfile,
            status: 'active',
          })
        } catch (err: any) {
          console.error('[delegate] Error delegating side task:', err)
          return json(
            { ok: false, error: err?.message || 'Failed to delegate side task' },
            { status: 500 },
          )
        }
      },
    },
  },
})

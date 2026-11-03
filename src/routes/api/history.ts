import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  ensureGatewayProbed,
  getGatewayCapabilities,
  getMessages,
  getSession,
  listSessions,
  toChatMessage,
} from '../../server/claude-api'
import {
  resolveMainChatSessionId,
  resolveSessionKey,
  shouldBindMainToPortableSession,
} from '../../server/session-utils'
import { isAuthenticated } from '@/server/auth-middleware'
import { getLocalSession, getLocalMessages } from '../../server/local-session-store'
import { readSessionMessagesFromStateDb } from '../../server/projects-backend'
import {
  getAntigravitySessionHistory,
  isAntigravitySession,
} from '../../server/antigravity-bridge'

export const Route = createFileRoute('/api/history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()
        const capabilities = getGatewayCapabilities()
        if (!capabilities.sessions) {
          return json({
            sessionKey: 'new',
            sessionId: 'new',
            messages: [],
            source: 'unavailable',
            message: SESSIONS_API_UNAVAILABLE_MESSAGE,
          })
        }
        try {
          const url = new URL(request.url)
          const limit = Number(url.searchParams.get('limit') || '200')
          const rawSessionKey = url.searchParams.get('sessionKey')?.trim()
          const friendlyId = url.searchParams.get('friendlyId')?.trim()

          // Fast path for Antigravity sessions before resolveSessionKey tries to create a Hermes session
          const candidateId = rawSessionKey || friendlyId || ''
          if (
            candidateId &&
            candidateId !== 'new' &&
            candidateId !== 'main' &&
            (await isAntigravitySession(candidateId))
          ) {
            const agyMessages = await getAntigravitySessionHistory(candidateId)
            const boundedAgy = limit > 0 ? agyMessages.slice(-limit) : agyMessages
            return json({
              sessionKey: candidateId,
              sessionId: candidateId,
              source: 'antigravity',
              messages: boundedAgy,
            })
          }

          let { sessionKey } = await resolveSessionKey({
            rawSessionKey,
            friendlyId,
            defaultKey: 'main',
          })
          const pinPortableMain = shouldBindMainToPortableSession({
            sessionKey,
            dashboardAvailable: capabilities.dashboard.available,
            enhancedChat: capabilities.enhancedChat,
          })
          // Keep /chat/new empty until the first message creates a real session.
          if (sessionKey === 'new') {
            return json({
              sessionKey: 'new',
              sessionId: 'new',
              messages: [],
            })
          }
          if (sessionKey === 'main' && !pinPortableMain) {
            try {
              const sessions = await listSessions(30, 0)
              const candidate = resolveMainChatSessionId(sessions)
              if (candidate) {
                sessionKey = candidate
              } else {
                return json({
                  sessionKey: 'new',
                  sessionId: 'new',
                  messages: [],
                })
              }
            } catch {
              return json({ sessionKey: 'new', sessionId: 'new', messages: [] })
            }
          }

          if (pinPortableMain) {
            const localMessages = getLocalMessages('main')
            return json({
              sessionKey: 'main',
              sessionId: 'main',
              messages: localMessages.map((m, index) => ({
                id: m.id,
                role: m.role,
                content: [{ type: 'text', text: m.content }],
                timestamp: m.timestamp,
                historyIndex: index,
              })),
            })
          }
          let messages: Awaited<ReturnType<typeof getMessages>> = []
          let sessionModel: string | undefined
          try {
            const [fetchedMessages, sess] = await Promise.all([
              getMessages(sessionKey),
              getSession(sessionKey).catch(() => null),
            ])
            messages = fetchedMessages
            sessionModel = (sess?.model as string) || undefined
          } catch {
            messages = []
          }

          // Fallback to multi-profile state.db if dashboard/gateway didn't return messages for a profile session
          if (messages.length === 0) {
            const dbFound = readSessionMessagesFromStateDb(sessionKey, limit)
            if (dbFound && dbFound.messages.length > 0) {
              messages = dbFound.messages as any
              sessionModel = sessionModel || dbFound.model
            }
          }

          // Fallback to local session store for portable/local model sessions
          if (messages.length === 0) {
            const localSession = getLocalSession(sessionKey)
            if (localSession) {
              const localMessages = getLocalMessages(sessionKey)
              return json({
                sessionKey,
                sessionId: sessionKey,
                messages: localMessages.map((m, index) => ({
                  id: m.id,
                  role: m.role,
                  content: [{ type: 'text', text: m.content }],
                  timestamp: m.timestamp,
                  historyIndex: index,
                  model: (m as Record<string, unknown>).model || localSession.model || undefined,
                })),
              })
            }

            // Also check Antigravity history as fallback
            const agyFallback = await getAntigravitySessionHistory(sessionKey)
            if (agyFallback.length > 0) {
              return json({
                sessionKey,
                sessionId: sessionKey,
                source: 'antigravity',
                messages: limit > 0 ? agyFallback.slice(-limit) : agyFallback,
              })
            }
          }

          const boundedMessages = limit > 0 ? messages.slice(-limit) : messages

          return json({
            sessionKey,
            sessionId: sessionKey,
            messages: boundedMessages.map((message, index) =>
              toChatMessage(message, { historyIndex: index, sessionModel }),
            ),
          })
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})

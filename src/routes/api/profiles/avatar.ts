import fs from 'node:fs'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  AVATAR_EXTENSIONS,
  findProfileAvatarPath,
  getProfileAvatarUrl,
  resolveProfileDir,
  validateProfileIdentifier,
} from '../../../server/profiles-browser'

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

const EXT_MAP: Record<string, 'png' | 'jpg' | 'jpeg' | 'webp' | 'svg'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

export const Route = createFileRoute('/api/profiles/avatar')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const name = url.searchParams.get('name')?.trim() || 'default'

          const foundPath = findProfileAvatarPath(name)
          if (!foundPath || !fs.existsSync(foundPath)) {
            return new Response(null, {
              status: 302,
              headers: {
                Location: '/claude-avatar.webp',
                'Cache-Control': 'public, max-age=60',
              },
            })
          }

          const ext = path.extname(foundPath).slice(1).toLowerCase()
          const mime = MIME_MAP[ext] || 'application/octet-stream'
          const fileBytes = fs.readFileSync(foundPath)

          return new Response(fileBytes, {
            status: 200,
            headers: {
              'Content-Type': mime,
              'Cache-Control': 'public, max-age=60',
            },
          })
        } catch (err: unknown) {
          return new Response(
            err instanceof Error ? err.message : 'Failed to serve avatar',
            { status: 500 },
          )
        }
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = (await request.json()) as {
            name?: string
            dataUrl?: string
          }

          const rawName = body?.name?.trim() || 'default'
          const validatedName =
            rawName === 'default' ? 'default' : validateProfileIdentifier(rawName)

          const dataUrl = body?.dataUrl?.trim()
          if (!dataUrl || !dataUrl.startsWith('data:image/')) {
            return json(
              { ok: false, error: 'Valid image Data URL is required' },
              { status: 400 },
            )
          }

          const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
          if (!matches) {
            return json(
              { ok: false, error: 'Invalid base64 Data URL format' },
              { status: 400 },
            )
          }

          const mimeType = matches[1].toLowerCase()
          const base64Data = matches[2]
          const ext = EXT_MAP[mimeType]

          if (!ext || !AVATAR_EXTENSIONS.includes(ext)) {
            return json(
              {
                ok: false,
                error: `Unsupported image format (${mimeType}). Supported formats: ${AVATAR_EXTENSIONS.join(', ')}`,
              },
              { status: 400 },
            )
          }

          const buffer = Buffer.from(base64Data, 'base64')
          if (buffer.length > MAX_AVATAR_BYTES) {
            return json(
              { ok: false, error: 'Image exceeds maximum size of 5 MB' },
              { status: 413 },
            )
          }

          const targetDir = resolveProfileDir(validatedName)
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true })
          }

          // Remove any existing avatar variations
          for (const oldExt of AVATAR_EXTENSIONS) {
            const oldPath = path.join(targetDir, `avatar.${oldExt}`)
            if (fs.existsSync(oldPath)) {
              try {
                fs.unlinkSync(oldPath)
              } catch {}
            }
          }

          const destPath = path.join(targetDir, `avatar.${ext}`)
          fs.writeFileSync(destPath, buffer)

          const avatarUrl = getProfileAvatarUrl(validatedName)

          return json({
            ok: true,
            avatarUrl,
            name: validatedName,
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          return json({ ok: false, error: message }, { status: 500 })
        }
      },
    },
  },
})

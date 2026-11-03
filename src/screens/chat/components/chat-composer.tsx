import { createPortal } from 'react-dom'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  AttachmentIcon,
  Cancel01Icon,
  Delete01Icon,
  Mic01Icon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  MODEL_SWITCH_BLOCKED_TOAST,
  getZeroForkModelInfoFlags,
  shouldBlockZeroForkModelSwitch,
} from './chat-composer-model-switch'
import { ContextBar } from './context-bar'
import type { CSSProperties, Ref } from 'react'
import type { SessionMeta } from '../types'
import { chatQueryKeys, fetchSessions } from '../chat-queries'

import type { ModelCatalogEntry, ModelSwitchResponse } from '@/lib/model-types'
import type {
  SlashCommandDefinition,
  SlashCommandMenuHandle,
} from '@/components/slash-command-menu'
import {
  DEFAULT_SLASH_COMMANDS,
  SlashCommandMenu,
  mergeSlashCommands,
} from '@/components/slash-command-menu'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/prompt-kit/prompt-input'
import { useSettings } from '@/hooks/use-settings'
import { MOBILE_TAB_BAR_OFFSET } from '@/components/mobile-tab-bar'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useSessionModelStore } from '@/stores/session-model-store'
import { Button } from '@/components/ui/button'
import { usePinnedModels } from '@/hooks/use-pinned-models'
// import { ModeSelector } from '@/components/mode-selector'
import { cn } from '@/lib/utils'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
import { toast } from '@/components/ui/toast'
import {
  SEARCH_MODAL_EVENTS,
  emitSearchModalEvent,
} from '@/hooks/use-search-modal'
import { setLocalModelOverride } from '@/screens/chat/local-model-override'
import { formatModelName } from '@/lib/format-model-name'
import { ProjectSessionChip } from '@/components/projects/project-session-chip'

type ChatComposerAttachment = {
  id: string
  name: string
  contentType: string
  size: number
  dataUrl?: string
  previewUrl?: string
  kind?: 'image' | 'file' | 'audio'
}

type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'adaptive'

type ChatComposerProps = {
  onSubmit: (
    value: string,
    attachments: Array<ChatComposerAttachment>,
    fastMode: boolean,
    helpers: ChatComposerHelpers,
  ) => void
  isLoading: boolean
  disabled: boolean
  sessionKey?: string
  session?: SessionMeta | null
  wrapperRef?: Ref<HTMLDivElement>
  composerRef?: Ref<ChatComposerHandle>
  focusKey?: string
  onNewSession?: () => void
  onToggleWebSearch?: (enabled: boolean) => void
  webSearchEnabled?: boolean
  /** Current thinking level for this session */
  thinkingLevel?: ThinkingLevel
  /** Called when user changes thinking level */
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  /** Called when user changes model */
  onModelChange?: (model: string) => void
  onAbort?: () => void
  /** Embedded inside another surface (e.g. Operations card), so mobile composer
   * must stay inline instead of docking fixed to the viewport bottom. */
  embedded?: boolean
  hideModelSelector?: boolean
}

type ChatComposerHelpers = {
  reset: () => void
  setValue: (value: string) => void
  setAttachments: (attachments: Array<ChatComposerAttachment>) => void
}

type ChatComposerHandle = {
  setValue: (value: string) => void
  insertText: (value: string) => void
}

function nextThinkingLevel(level: ThinkingLevel): ThinkingLevel {
  if (level === 'off') return 'low'
  if (level === 'low') return 'medium'
  if (level === 'medium') return 'high'
  return 'off'
}

/** Returns true if the model id suggests Claude 4.6 (should default to adaptive) */
function isClaude46Model(model: string): boolean {
  const normalized = model.toLowerCase()
  return normalized.includes('4-6') || normalized.includes('claude-4.6')
}

function getPopupPosition(triggerEl: HTMLElement | null, menuWidth = 240) {
  if (!triggerEl || typeof window === 'undefined') return { left: 16, bottom: 80 }
  const rect = triggerEl.getBoundingClientRect()
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12))
  const bottom = Math.max(12, window.innerHeight - rect.top + 8)
  return { left, bottom }
}

const DEFAULT_AGY_MODELS = [
  { id: 'antigravity/gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'antigravity', isLocal: false },
  { id: 'antigravity/gemini-4-argon', name: 'Gemini 4 Argon', provider: 'antigravity', isLocal: false },
  { id: 'antigravity/claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'antigravity', isLocal: false },
  { id: 'antigravity/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'antigravity', isLocal: false },
  { id: 'antigravity/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'antigravity', isLocal: false },
]

type SessionStatusApiResponse = {
  ok?: boolean
  payload?: unknown
  error?: string
  [key: string]: unknown
}

type GatewayStatusApiResponse = {
  mode?: string
}

type ProfileSummary = {
  name: string
  active?: boolean
  model?: string
  provider?: string
  skillCount?: number
}

type ProfilesListResponse = {
  profiles?: Array<ProfileSummary>
  activeProfile?: string
}

type WorkspaceEntry = {
  name: string
  path: string
}

type WorkspaceDetectionResponse = {
  path?: string
  folderName?: string
  source?: string
  isValid?: boolean
  workspaces?: Array<WorkspaceEntry>
  last?: string
}

type ClaudeConfigApiResponse = {
  config?: Record<string, unknown>
}

type ModelInfoApiResponse = {
  gatewayMode?: string | null
  supportsRuntimeSwitching?: boolean | null
  vanillaAgent?: boolean | null
}

type ModelSwitchNotice = {
  tone: 'success' | 'error'
  message: string
  retryModel?: string
  retryProvider?: string
}

// Models are fetched through the workspace API proxy (/api/models, /api/claude-proxy)
// to support Docker and reverse-proxy deployments where the browser cannot reach
// the Hermes Agent gateway directly.

function readModelText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

type ClaudeCatalogEntry =
  | string
  | {
      id: string
      provider: string
      name: string
      [key: string]: unknown
    }

function isClaudeCatalogEntry(
  entry: ClaudeCatalogEntry | null,
): entry is ClaudeCatalogEntry {
  return entry !== null
}

type ClaudeProviderOption = {
  id: string
  label: string
  authenticated: boolean
}

type ClaudeAvailableModelsResponse = {
  provider: string
  models: Array<{ id: string; description: string }>
  providers: Array<ClaudeProviderOption>
}

type InstalledSkillSummary = {
  id: string
  name: string
  description: string
  installed: boolean
  enabled: boolean
}

async function fetchInstalledSkills(): Promise<Array<InstalledSkillSummary>> {
  const response = await fetch('/api/skills?tab=installed&limit=120')
  if (!response.ok) {
    throw new Error(`Skills request failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    skills?: Array<Record<string, unknown>>
    ok?: boolean
  }
  const skills = Array.isArray(payload.skills) ? payload.skills : []

  return skills
    .map((entry) => {
      const id = readModelText(entry.id) || readModelText(entry.slug) || readModelText(entry.name)
      if (!id) return null
      const name = readModelText(entry.name) || id
      const description = readModelText(entry.description)
      const installed = entry.installed !== false
      const enabled = entry.enabled !== false
      return { id, name, description, installed, enabled }
    })
    .filter((entry): entry is InstalledSkillSummary => entry !== null)
}

async function fetchModels(): Promise<{
  ok?: boolean
  models?: Array<ModelCatalogEntry>
  configuredProviders?: Array<string>
  currentProvider?: string
  providerLabels?: Record<string, string>
  providers?: Array<ClaudeProviderOption>
}> {
  // Use the curated /api/models endpoint which returns only models
  // actually configured and available (OCPlatform gateway + local providers).
  // Previously this hit /api/claude-proxy/api/available-models which returned
  // every upstream provider model — flooding the picker with unusable options.
  const response = await fetch('/api/models')
  if (!response.ok) {
    throw new Error(`Models request failed (${response.status})`)
  }

  const payload = (await response.json()) as
    | Array<unknown>
    | {
        data?: Array<Record<string, unknown>>
        models?: Array<Record<string, unknown>>
      }
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []

  const models = rawModels
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const id =
        readModelText(record.id) ||
        readModelText(record.name) ||
        readModelText(record.model)
      if (!id) return null
      const provider =
        readModelText(record.provider) ||
        readModelText(record.owned_by) ||
        (id.includes('/') ? id.split('/')[0] : 'hermes-agent')

      return {
        ...record,
        id,
        provider,
        name:
          readModelText(record.name) ||
          readModelText(record.display_name) ||
          readModelText(record.label) ||
          id,
      }
    })
    .filter(isClaudeCatalogEntry)

  const configuredProviders = Array.from(
    new Set(
      models.flatMap((entry) => {
        if (typeof entry === 'string') return []
        return typeof entry.provider === 'string' && entry.provider
          ? [entry.provider]
          : []
      }),
    ),
  )

  return {
    ok: true,
    models: models as Array<ModelCatalogEntry>,
    configuredProviders,
  }
}

async function fetchModelsForProvider(
  provider: string,
): Promise<Array<ModelCatalogEntry>> {
  const normalizedProvider = provider.trim()
  if (!normalizedProvider) return []

  const response = await fetch(
    `/api/claude-proxy/api/available-models?provider=${encodeURIComponent(normalizedProvider)}`,
  )
  if (!response.ok) {
    throw new Error(`Hermes models request failed (${response.status})`)
  }

  const payload = (await response.json()) as ClaudeAvailableModelsResponse
  return payload.models.map((model) => ({
    id: model.id,
    name: model.id,
    provider: normalizedProvider,
  }))
}

const LOCAL_PROVIDERS_SET = new Set(['ollama', 'atomic-chat'])

async function switchModel(
  model: string,
  provider?: string,
  _sessionKey?: string,
): Promise<ModelSwitchResponse> {
  const modelId = model.trim()
  const modelProvider =
    typeof provider === 'string' && provider.trim()
      ? provider.trim()
      : modelId.includes('/')
        ? modelId.split('/')[0]
        : undefined

  // For local providers, don't write to gateway config — just track client-side.
  // The gateway can't run local models (context too small for agent loop).
  if (modelProvider && LOCAL_PROVIDERS_SET.has(modelProvider)) {
    setLocalModelOverride(`${modelProvider}/${modelId}`)
    return {
      ok: true,
      resolved: {
        modelProvider,
        model: modelId,
      },
    }
  }
  // Switching to a cloud model — clear any local override
  setLocalModelOverride('')

  // Write the model change to ~/.hermes/config.yaml via the webapi
  const patch: Record<string, string> = { model: modelId }
  if (modelProvider) patch.provider = modelProvider

  const response = await fetch('/api/claude-proxy/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }

  return {
    ok: true,
    resolved: {
      modelProvider: modelProvider || 'hermes-agent',
      model: modelId,
    },
  }
}

/** Maximum file size accepted from picker/drop before processing (50MB). */
const MAX_ATTACHMENT_FILE_SIZE = 50 * 1024 * 1024
/** Longest side target for resized images. */
const MAX_IMAGE_DIMENSION = 1920
/** Initial JPEG compression quality (0-1). */
const IMAGE_QUALITY = 0.85
/** Safe image attachment limit after processing (1MB). */
const MAX_TRANSPORT_IMAGE_SIZE = 1 * 1024 * 1024

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

const TEXT_EXTENSION_TO_MIME: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  ts: 'text/plain',
  tsx: 'text/plain',
  js: 'text/plain',
  py: 'text/plain',
}

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase()
}

function isImageMimeType(value: string): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('image/')
}

function inferImageMimeTypeFromFileName(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  if (!match?.[1]) return ''
  return IMAGE_EXTENSION_TO_MIME[match[1].toLowerCase()] || ''
}

function inferTextMimeTypeFromFileName(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  if (!match?.[1]) return ''
  return TEXT_EXTENSION_TO_MIME[match[1].toLowerCase()] || ''
}

function isTextMimeType(value: string): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('text/') || normalized === 'application/json'
}

function isImageFile(file: File): boolean {
  if (isImageMimeType(file.type)) return true
  return inferImageMimeTypeFromFileName(file.name).length > 0
}

function isTextFile(file: File): boolean {
  if (isTextMimeType(file.type)) return true
  return inferTextMimeTypeFromFileName(file.name).length > 0
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

function hasAttachableData(dt: DataTransfer | null): boolean {
  if (!dt) return false
  const items = Array.from(dt.items)
  if (
    items.some(
      (item) =>
        item.kind === 'file' &&
        (isImageMimeType(item.type) ||
          isTextMimeType(item.type) ||
          item.type.trim().length === 0),
    )
  )
    return true
  const files = Array.from(dt.files)
  return files.some(
    (file) =>
      isImageFile(file) || isTextFile(file) || file.type.trim().length === 0,
  )
}

function collectFilesFromDataTransfer(dt: DataTransfer | null): Array<File> {
  if (!dt) return []
  const files: Array<File> = []
  const seen = new Set<string>()

  const pushFile = (file: File | null) => {
    if (!file) return
    const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`
    if (seen.has(key)) return
    seen.add(key)
    files.push(file)
  }

  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    pushFile(item.getAsFile())
  }

  for (const file of Array.from(dt.files)) {
    pushFile(file)
  }

  return files
}

async function readFileAsDataUrl(file: File): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

async function readFileAsText(file: File): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsText(file)
  })
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getResolvedModelKey(model: string, provider?: string): string {
  const normalizedModel = model.trim()
  const normalizedProvider = typeof provider === 'string' ? provider.trim() : ''

  if (!normalizedModel) return ''
  if (!normalizedProvider) return normalizedModel
  if (normalizedModel.startsWith(`${normalizedProvider}/`))
    return normalizedModel
  return `${normalizedProvider}/${normalizedModel}`
}

/**
 * Checks whether a model entry matches the current model string.
 *
 * The current model can arrive in several formats depending on the source:
 *   - "provider/model-id"  (from session-status API, persisted session model)
 *   - "model-id"           (bare ID from config or old data)
 *
 * The entry always has { id, provider } from the models catalog.
 *
 * We match if:
 *   1. The current model equals the entry ID exactly (bare match), or
 *   2. The current model ends with "/<entry.id>" (provider-prefixed match), or
 *   3. The resolved key from entry (provider/id) equals the current model.
 */
function isCurrentModel(
  currentModel: string,
  entryId: string,
  entryProvider: string,
): boolean {
  const cm = currentModel.trim()
  const eid = entryId.trim()
  const eprov = entryProvider.trim()
  if (!cm || !eid) return false

  // Exact match (bare ID)
  if (cm === eid) return true

  // Current model is "something/<entryId>"
  if (cm.endsWith(`/${eid}`)) return true

  // Entry ID is "something/<currentModel>"
  if (eid.endsWith(`/${cm}`)) return true

  // Strip prefixes for bare comparison
  const bareCm = cm.replace(/^[^/]+\//, '')
  const bareEid = eid.replace(/^[^/]+\//, '')
  if (bareCm && bareCm === bareEid) return true

  // Resolved entry key matches current model exactly
  const resolved = eprov ? `${eprov}/${eid}` : eid
  if (resolved === cm) return true

  return false
}

function isCanvasSupported(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('2d'))
  } catch {
    return false
  }
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
  if (!base64) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function readDataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:([^;]+);base64,/.exec(dataUrl)
  return match?.[1]?.trim() || null
}

async function compressImageToDataUrl(file: File): Promise<string> {
  if (!isCanvasSupported()) {
    throw new Error('Image compression not available')
  }

  return await new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    image.onload = () => {
      try {
        let width = image.width
        let height = image.height

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width)
            width = MAX_IMAGE_DIMENSION
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height)
            height = MAX_IMAGE_DIMENSION
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          cleanup()
          reject(new Error('Failed to get canvas context'))
          return
        }

        context.drawImage(image, 0, 0, width, height)

        let quality = IMAGE_QUALITY
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        let bytes = estimateDataUrlBytes(dataUrl)

        while (bytes > MAX_TRANSPORT_IMAGE_SIZE && quality > 0.4) {
          quality -= 0.08
          dataUrl = canvas.toDataURL('image/jpeg', quality)
          bytes = estimateDataUrlBytes(dataUrl)
        }

        cleanup()
        resolve(dataUrl)
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error('Compression failed'))
      }
    }

    image.onerror = () => {
      cleanup()
      reject(new Error('Failed to load image'))
    }

    image.src = objectUrl
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readModelFromStatusPayload(payload: unknown): string {
  if (!isRecord(payload)) return ''

  const directCandidates = [
    payload.model,
    payload.currentModel,
    payload.modelAlias,
  ]
  for (const candidate of directCandidates) {
    const text = readText(candidate)
    if (text) return text
  }

  if (isRecord(payload.resolved)) {
    const provider = readText(payload.resolved.modelProvider)
    const model = readText(payload.resolved.model)
    if (provider && model) return `${provider}/${model}`
    if (model) return model
  }

  const nestedCandidates = [payload.status, payload.session, payload.payload]
  for (const nested of nestedCandidates) {
    const nestedModel = readModelFromStatusPayload(nested)
    if (nestedModel) return nestedModel
  }

  return ''
}

function normalizeDraftSessionKey(sessionKey?: string): string {
  if (typeof sessionKey !== 'string') return 'new'
  const normalized = sessionKey.trim()
  return normalized.length > 0 ? normalized : 'new'
}

function toDraftStorageKey(sessionKey?: string): string {
  return `claude-draft-${normalizeDraftSessionKey(sessionKey)}`
}

function readSlashCommandQuery(inputValue: string): string | null {
  if (!inputValue.startsWith('/')) return null
  const newlineIndex = inputValue.indexOf('\n')
  const firstLine =
    newlineIndex === -1 ? inputValue : inputValue.slice(0, newlineIndex)
  if (/\s/.test(firstLine.slice(1))) return null
  return firstLine.slice(1)
}

function isTimeoutErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('timed out') || normalized.includes('timeout')
}

async function readResponseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
    return JSON.stringify(payload)
  } catch {
    const text = await response.text().catch(() => '')
    return text || response.statusText || 'Request failed'
  }
}

async function fetchCurrentModelFromStatus(sessionKey?: string): Promise<string> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 7000)

  try {
    const query = sessionKey?.trim()
      ? `?sessionKey=${encodeURIComponent(sessionKey.trim())}`
      : ''
    const response = await fetch(`/api/session-status${query}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    const payload = (await response.json()) as SessionStatusApiResponse
    if (payload.ok === false) {
      throw new Error(readText(payload.error) || 'Server unavailable')
    }

    return readModelFromStatusPayload(payload.payload ?? payload)
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function fetchGatewayMode(): Promise<string | null> {
  const response = await fetch('/api/gateway-status')
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  const payload = (await response.json()) as GatewayStatusApiResponse
  return typeof payload.mode === 'string' ? payload.mode : null
}

async function fetchModelInfo(): Promise<ModelInfoApiResponse | null> {
  const response = await fetch('/api/model/info')
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  return (await response.json()) as ModelInfoApiResponse
}

async function fetchProfiles(): Promise<ProfilesListResponse> {
  const response = await fetch('/api/profiles/list')
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  return (await response.json()) as ProfilesListResponse
}

async function activateProfile(name: string): Promise<void> {
  const response = await fetch('/api/profiles/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
}

async function fetchWorkspaceContext(): Promise<WorkspaceDetectionResponse> {
  const response = await fetch('/api/workspace')
  if (!response.ok) {
    throw new Error(await readResponseError(response))
  }
  return (await response.json()) as WorkspaceDetectionResponse
}

function shortPathLabel(pathValue: string): string {
  if (!pathValue) return 'Workspace'
  const parts = pathValue.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.at(-1) || pathValue
}

function thinkingLabel(level: ThinkingLevel): string {
  if (level === 'off') return 'None'
  if (level === 'low') return 'Low'
  if (level === 'medium') return 'Medium'
  return 'High'
}

function profileMeta(profile: ProfileSummary): string {
  return [profile.model, profile.provider]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join(' · ')
}

function focusPromptTarget(target: HTMLTextAreaElement | null) {
  if (!target) return
  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
  }
}

function ChatComposerComponent({
  onSubmit,
  isLoading,
  disabled,
  sessionKey,
  session,
  wrapperRef,
  composerRef,
  focusKey,
  onNewSession,
  onToggleWebSearch: _onToggleWebSearch,
  webSearchEnabled,
  thinkingLevel: externalThinkingLevel,
  onThinkingLevelChange,
  onModelChange,
  onAbort,
  embedded = false,
  hideModelSelector = false,
}: ChatComposerProps) {
  const queryClient = useQueryClient()
  const mobileKeyboardInset = useWorkspaceStore((s) => s.mobileKeyboardInset)
  const mobileComposerFocused = useWorkspaceStore(
    (s) => s.mobileComposerFocused,
  )
  const setMobileKeyboardOpen = useWorkspaceStore(
    (s) => s.setMobileKeyboardOpen,
  )
  const setMobileKeyboardInset = useWorkspaceStore(
    (s) => s.setMobileKeyboardInset,
  )
  const setMobileComposerFocused = useWorkspaceStore(
    (s) => s.setMobileComposerFocused,
  )
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Array<ChatComposerAttachment>>(
    [],
  )
  const [attachmentProcessingCount, setAttachmentProcessingCount] = useState(0)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [previewImage, setPreviewImage] = useState<{
    url: string
    name: string
  } | null>(null)
  const [focusAfterSubmitTick, setFocusAfterSubmitTick] = useState(0)
  const { settings: composerSettings } = useSettings()
  const chatNavMode = composerSettings.mobileChatNavMode
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({})
  const [mobileProviderFilter, setMobileProviderFilter] = useState<string>('all')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const [isThinkingMenuOpen, setIsThinkingMenuOpen] = useState(false)
  const [isProviderSwitcherExpanded, setIsProviderSwitcherExpanded] =
    useState(false)
  const [isWebSearchMode, _setIsWebSearchMode] = useState(false)
  const [isSlashMenuDismissed, setIsSlashMenuDismissed] = useState(false)
  const [modelNotice, setModelNotice] = useState<ModelSwitchNotice | null>(null)
  const [fastMode, setFastMode] = useState(false)
  // Per-session thinking level — controlled externally (chat-screen owns the state)
  // Falls back to internal state if no external controller provided
  const [internalThinkingLevel, setInternalThinkingLevel] =
    useState<ThinkingLevel>('low')
  const thinkingLevel = externalThinkingLevel ?? internalThinkingLevel
  // Thinking toggle removed for Claude (not supported) — keeping state for type compat
  const _handleThinkingToggle = useCallback(() => {
    const next = nextThinkingLevel(thinkingLevel)
    if (onThinkingLevelChange) {
      onThinkingLevelChange(next)
    } else {
      setInternalThinkingLevel(next)
    }
  }, [thinkingLevel, onThinkingLevelChange])
  void _handleThinkingToggle
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const slashMenuRef = useRef<SlashCommandMenuHandle | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const dragCounterRef = useRef(0)
  const shouldRefocusAfterSendRef = useRef(false)
  const submittingRef = useRef(false)
  const pendingSubmitAfterAttachmentsRef = useRef(false)
  const modelSelectorRef = useRef<HTMLDivElement | null>(null)
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null)
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null)
  const composerWrapperRef = useRef<HTMLDivElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)

  // Phase 4.2: Pinned models (kept for future use)
  const { pinned, isPinned, togglePin } = usePinnedModels()

  const modelsQuery = useQuery({
    queryKey: ['claude', 'models'],
    queryFn: fetchModels,
    refetchInterval: 60_000,
    retry: false,
  })
  const currentProvider = modelsQuery.data?.currentProvider ?? ''
  const otherProviders = useMemo(
    () =>
      (modelsQuery.data?.providers ?? []).filter(
        (provider) => provider.id !== currentProvider,
      ),
    [currentProvider, modelsQuery.data?.providers],
  )
  const otherProviderModelsQuery = useQuery({
    queryKey: [
      'claude',
      'models',
      'other-providers',
      otherProviders
        .map((provider) => provider.id)
        .sort()
        .join('|'),
    ],
    enabled: isProviderSwitcherExpanded && otherProviders.length > 0,
    retry: false,
    queryFn: async () => {
      const modelEntries = await Promise.all(
        otherProviders.map(async (provider) => ({
          providerId: provider.id,
          models: await fetchModelsForProvider(provider.id),
        })),
      )

      return modelEntries.reduce<Record<string, Array<ModelCatalogEntry>>>(
        (acc, entry) => {
          acc[entry.providerId] = entry.models
          return acc
        },
        {},
      )
    },
  })
  const currentModelQuery = useQuery({
    queryKey: ['claude', 'session-status-model', sessionKey || 'main'],
    queryFn: () => fetchCurrentModelFromStatus(sessionKey),
    refetchInterval: 30_000,
    retry: false,
  })
  const sttConfigQuery = useQuery({
    queryKey: ['claude', 'config', 'stt'],
    queryFn: async () => {
      const response = await fetch('/api/claude-config')
      if (!response.ok) {
        throw new Error(`Config request failed (${response.status})`)
      }
      return (await response.json()) as ClaudeConfigApiResponse
    },
    staleTime: 60_000,
    retry: false,
  })
  const gatewayModeQuery = useQuery({
    queryKey: ['gateway-status', 'mode'],
    queryFn: fetchGatewayMode,
    staleTime: 30_000,
    retry: false,
  })
  const modelInfoQuery = useQuery({
    queryKey: ['dashboard', 'model-info'],
    queryFn: fetchModelInfo,
    staleTime: 30_000,
    retry: false,
  })
  const zeroForkModelInfoFlags = useMemo(
    () => getZeroForkModelInfoFlags(modelInfoQuery.data),
    [modelInfoQuery.data],
  )

  const profilesQuery = useQuery({
    queryKey: ['profiles', 'composer'],
    queryFn: fetchProfiles,
    retry: false,
    staleTime: 15_000,
  })
  const installedSkillsQuery = useQuery({
    queryKey: ['chat', 'composer', 'installed-skills'],
    queryFn: fetchInstalledSkills,
    retry: false,
    staleTime: 60_000,
  })
  const workspaceContextQuery = useQuery({
    queryKey: ['workspace', 'composer-context'],
    queryFn: fetchWorkspaceContext,
    retry: false,
    staleTime: 30_000,
  })
  const profileActivateMutation = useMutation({
    mutationFn: activateProfile,
    onSuccess: async (_data, profileName) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['claude', 'models'] }),
        queryClient.invalidateQueries({
          queryKey: ['claude', 'session-status-model'],
        }),
      ])
      setIsProfileMenuOpen(false)
      toast(`Activated profile ${profileName}`)
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to activate profile',
      )
    },
  })
  const workspaceSelectMutation = useMutation({
    mutationFn: async (workspace: { path: string; name?: string }) => {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace),
      })
      if (!response.ok) {
        throw new Error(await readResponseError(response))
      }
      return (await response.json()) as WorkspaceDetectionResponse
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'composer-context'],
      })
      setIsWorkspaceMenuOpen(false)
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to switch workspace',
      )
    },
  })

  // Phase 4.2: (pinned model tracking kept for future use)
  void modelsQuery.data

  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    staleTime: 5_000,
  })

  const currentSession =
    session ??
    (sessionKey
      ? sessionsQuery.data?.find(
          (s) => s.key === sessionKey || s.friendlyId === sessionKey,
        )
      : null)

  const isAntigravitySession = Boolean(
    currentSession?.source === 'antigravity' ||
      (typeof sessionKey === 'string' && sessionKey.startsWith('agy_')) ||
      (typeof sessionKey === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          sessionKey,
        ) &&
        (currentSession ? currentSession.source === 'antigravity' : true)),
  )

  const isAgyModelId = useCallback((id: string, prov?: string) => {
    const p = (prov || '').toLowerCase()
    if (p === 'antigravity' || p === 'google-antigravity') return true
    const lower = (id || '').toLowerCase()
    return (
      lower.startsWith('antigravity/') ||
      lower.startsWith('google-antigravity/') ||
      lower.includes('gemini-4-argon') ||
      lower.includes('gemini-3.8-flash') ||
      lower.includes('claude-opus-5-5') ||
      lower.includes('claude-sonnet-5-5') ||
      lower.includes('gpt-oss-120b')
    )
  }, [])

  const rawActiveProfileName =
    profilesQuery.data?.activeProfile ||
    profilesQuery.data?.profiles?.find((profile) => profile.active)?.name ||
    'default'
  const activeProfileName = isAntigravitySession
    ? 'antigravity'
    : rawActiveProfileName
  const isAgyMode = isAntigravitySession || activeProfileName === 'antigravity'

  const activeProfile = profilesQuery.data?.profiles?.find(
    (profile) => profile.name === activeProfileName,
  )
  const workspaceEntries = workspaceContextQuery.data?.workspaces ?? []
  const detectedWorkspacePath = workspaceContextQuery.data?.path ?? ''
  const activeWorkspace = workspaceEntries.find(
    (workspace) => workspace.path === detectedWorkspacePath,
  )
  const workspaceButtonLabel =
    activeWorkspace?.name ||
    workspaceContextQuery.data?.folderName ||
    shortPathLabel(detectedWorkspacePath) ||
    'Workspace'

  const lockedSessionFolder =
    currentSession?.projectName ||
    (currentSession?.cwd ? shortPathLabel(currentSession.cwd) : null)

  // Per-session model override, persisted to localStorage keyed by sessionKey.
  // Drives both the composer label and the model passed to startStreaming.
  // Replaces an earlier flow that PATCHed ~/.hermes/config.yaml — that path
  // 404s and would clobber the global default for every channel anyway.
  const [composerModelOverride, setComposerModelOverride] = useState<string>('')
  const persistedSessionModel = useSessionModelStore((s) =>
    s.getModel(sessionKey),
  )
  const setPersistedSessionModel = useSessionModelStore((s) => s.setModel)

  // Model switching is now per-session via the persistent store above.
  // Previously this issued a PATCH /api/hermes-proxy/api/config to write to
  // ~/.hermes/config.yaml — that endpoint 404s and would clobber the global
  // default for every channel anyway. The mutation block + retry callback +
  // dead onError handler were removed alongside it.

  const handleModelSelect = useCallback(
    function handleModelSelect(nextModel: string, provider?: string) {
      const model = nextModel.trim()
      if (!model) return

      if (isAgyMode && !isAgyModelId(model, provider)) {
        toast('Only Antigravity models can be used in this session')
        setIsModelMenuOpen(false)
        return
      }

      const normalizedSessionKey =
        typeof sessionKey === 'string' && sessionKey.trim().length > 0
          ? sessionKey.trim()
          : undefined
      const isAgyTarget =
        provider === 'antigravity' || model.startsWith('antigravity/')
      if (
        !isAgyTarget &&
        shouldBlockZeroForkModelSwitch(
          gatewayModeQuery.data,
          zeroForkModelInfoFlags,
        )
      ) {
        toast(MODEL_SWITCH_BLOCKED_TOAST)
        setIsModelMenuOpen(false)
        return
      }
      setModelNotice(null)
      const resolved = getResolvedModelKey(model, provider)
      setComposerModelOverride(resolved)
      setPersistedSessionModel(normalizedSessionKey || 'draft', resolved)
      if (normalizedSessionKey && normalizedSessionKey !== 'draft') {
        setPersistedSessionModel('draft', resolved)
      }
      if (currentSession?.id) {
        setPersistedSessionModel(currentSession.id, resolved)
      }
      if (currentSession?.key) {
        setPersistedSessionModel(currentSession.key, resolved)
      }
      if (onModelChange) {
        onModelChange(resolved)
      }
      setIsModelMenuOpen(false)
    },
    [
      currentSession?.id,
      currentSession?.key,
      gatewayModeQuery.data,
      isAgyMode,
      isAgyModelId,
      onModelChange,
      sessionKey,
      setPersistedSessionModel,
      zeroForkModelInfoFlags,
    ],
  )

  const handleThinkingSelect = useCallback(
    function handleThinkingSelect(level: ThinkingLevel) {
      if (onThinkingLevelChange) {
        onThinkingLevelChange(level)
      } else {
        setInternalThinkingLevel(level)
      }
      setIsThinkingMenuOpen(false)
    },
    [onThinkingLevelChange],
  )

  const handleOpenWorkspaceManager = useCallback(() => {
    setIsWorkspaceMenuOpen(false)
    emitSearchModalEvent(SEARCH_MODAL_EVENTS.TOGGLE_FILE_EXPLORER)
  }, [])

  const currentModel = currentModelQuery.data ?? ''

  // Auto-switch to hermes-agent model on mount (Hermes Workspace uses Hermes Agent)
  // Removed: auto-switch to hermes-agent. The workspace respects the
  // model/provider configured in ~/.hermes/config.yaml. Users switch
  // via the model selector or Settings page.

  // When model switches to Claude 4.6 and thinking is 'off', auto-upgrade to medium effort
  const prevModelRef = useRef('')
  useEffect(() => {
    if (!currentModel || currentModel === prevModelRef.current) return
    prevModelRef.current = currentModel
    if (isClaude46Model(currentModel) && thinkingLevel === 'off') {
      if (onThinkingLevelChange) {
        onThinkingLevelChange('medium')
      } else {
        setInternalThinkingLevel('medium')
      }
    }
  }, [currentModel, thinkingLevel, onThinkingLevelChange])

  const isModelSwitcherDisabled = disabled
  const draftStorageKey = useMemo(
    () => toDraftStorageKey(sessionKey),
    [sessionKey],
  )
  // On new chat, currentModel is empty until a session is created.
  // Read the runtime model from the models query (first item is from the current provider).
  const configuredModel = useMemo(() => {
    const models = modelsQuery.data?.models ?? []
    if (!models.length) return ''
    const first = models[0]
    return typeof first === 'string' ? first : first.id || first.name || ''
  }, [modelsQuery.data])
  // Derive the label directly from the store so navigation between sessions
  // updates without a render-window flash from a stale React-state mirror.
  const rawModelLabel =
    persistedSessionModel || currentModel || configuredModel || '⚕ Hermes Agent'
  const modelButtonLabel = useMemo(() => {
    if (isAgyMode) {
      if (composerModelOverride && isAgyModelId(composerModelOverride)) {
        return composerModelOverride
      }
      if (persistedSessionModel && isAgyModelId(persistedSessionModel)) {
        return persistedSessionModel
      }
      if (currentSession?.model && isAgyModelId(currentSession.model)) {
        return currentSession.model
      }
      if (currentModel && isAgyModelId(currentModel)) {
        return currentModel
      }
      return 'antigravity/gemini-3.8-flash'
    }
    return rawModelLabel
  }, [
    composerModelOverride,
    isAgyMode,
    persistedSessionModel,
    currentSession?.model,
    currentModel,
    rawModelLabel,
    isAgyModelId,
  ])

  // Measure composer height and set CSS variable for scroll padding
  useLayoutEffect(() => {
    const wrapper = composerWrapperRef.current
    if (!wrapper) return

    const updateHeight = () => {
      const height = wrapper.offsetHeight
      if (height > 0) {
        document.documentElement.style.setProperty(
          '--chat-composer-height',
          `${height}px`,
        )
      }
    }

    updateHeight()

    // Use ResizeObserver to track height changes (e.g., when textarea grows)
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(wrapper)

    return () => {
      resizeObserver.disconnect()
    }
  }, [attachments.length, value])

  const cancelFocusPromptFrame = useCallback(function cancelFocusPromptFrame() {
    if (focusFrameRef.current === null) return
    window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = null
  }, [])

  const focusPrompt = useCallback(
    function focusPrompt() {
      if (typeof window === 'undefined') return
      cancelFocusPromptFrame()
      focusFrameRef.current = window.requestAnimationFrame(
        function focusPromptInFrame() {
          focusFrameRef.current = null
          focusPromptTarget(promptRef.current)
        },
      )
    },
    [cancelFocusPromptFrame],
  )

  useEffect(
    function cleanupFocusPromptFrameOnUnmount() {
      return function cleanupFocusPromptFrame() {
        cancelFocusPromptFrame()
      }
    },
    [cancelFocusPromptFrame],
  )

  useEffect(
    function cleanupMobileComposerFocusOnUnmount() {
      return function cleanupMobileComposerFocus() {
        setMobileComposerFocused(false)
      }
    },
    [setMobileComposerFocused],
  )

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0
    setIsDraggingOver(false)
  }, [])

  useLayoutEffect(() => {
    if (isMobileViewport) return
    focusPrompt()
  }, [focusPrompt, isMobileViewport])

  useLayoutEffect(() => {
    if (disabled) return
    if (!shouldRefocusAfterSendRef.current) return
    shouldRefocusAfterSendRef.current = false
    focusPrompt()
  }, [disabled, focusPrompt])

  useLayoutEffect(() => {
    if (focusAfterSubmitTick === 0) return
    focusPrompt()
  }, [focusAfterSubmitTick, focusPrompt])

  useLayoutEffect(() => {
    if (disabled) return
    if (isMobileViewport) return
    // Only focus on focusKey change (session switch), not on every disabled toggle
    focusPrompt()
  }, [focusKey, isMobileViewport])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 767px)')
    const updateIsMobile = () => setIsMobileViewport(media.matches)
    updateIsMobile()
    media.addEventListener('change', updateIsMobile)
    return () => media.removeEventListener('change', updateIsMobile)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedDraft = window.sessionStorage.getItem(draftStorageKey)
    setValue(savedDraft ?? '')
  }, [draftStorageKey])


  const persistDraft = useCallback(
    function persistDraft(nextValue: string) {
      if (typeof window === 'undefined') return
      if (nextValue.length === 0) {
        window.sessionStorage.removeItem(draftStorageKey)
        return
      }
      window.sessionStorage.setItem(draftStorageKey, nextValue)
    },
    [draftStorageKey],
  )

  const clearDraft = useCallback(
    function clearDraft() {
      if (typeof window === 'undefined') return
      window.sessionStorage.removeItem(draftStorageKey)
    },
    [draftStorageKey],
  )

  const handleValueChange = useCallback(
    function handleValueChange(nextValue: string) {
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
    },
    [persistDraft],
  )

  const reset = useCallback(() => {
    setIsSlashMenuDismissed(false)
    setValue('')
    clearDraft()
    setAttachments([])
    resetDragState()
    focusPrompt()
  }, [clearDraft, focusPrompt, resetDragState])

  const setComposerValue = useCallback(
    (nextValue: string) => {
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
      focusPrompt()
    },
    [focusPrompt, persistDraft],
  )

  const setComposerAttachments = useCallback(
    (nextAttachments: Array<ChatComposerAttachment>) => {
      setAttachments(nextAttachments)
      focusPrompt()
    },
    [focusPrompt],
  )

  const insertText = useCallback(
    (text: string) => {
      setIsSlashMenuDismissed(false)
      setValue((prev) => {
        const nextValue = prev.trim().length > 0 ? `${prev}\n${text}` : text
        persistDraft(nextValue)
        return nextValue
      })
      focusPrompt()
    },
    [focusPrompt, persistDraft],
  )

  useImperativeHandle(
    composerRef,
    () => ({ setValue: setComposerValue, insertText }),
    [insertText, setComposerValue],
  )

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }, [])

  const addAttachments = useCallback(
    async (files: Array<File>) => {
      if (disabled) return
      setAttachmentProcessingCount((n) => n + 1)

      const timestamp = Date.now()
      const prepared = await Promise.all(
        files.map(
          async (file, index): Promise<ChatComposerAttachment | null> => {
            const imageFile = isImageFile(file)
            const textFile = isTextFile(file)
            if (!imageFile && !textFile && file.type.trim().length > 0) {
              return null
            }

            if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
              toast(
                `“${file.name || 'file'}” is ${formatFileSize(file.size)}. Max upload input size is ${formatFileSize(MAX_ATTACHMENT_FILE_SIZE)}.`,
                { type: 'warning' },
              )
              return null
            }

            if (textFile) {
              const textContent = await readFileAsText(file)
              if (textContent === null) return null
              const name =
                file.name && file.name.trim().length > 0
                  ? file.name.trim()
                  : `pasted-text-${timestamp}-${index + 1}.txt`
              const textBytes = new TextEncoder().encode(textContent).length
              return {
                id: crypto.randomUUID(),
                name,
                contentType:
                  (isTextMimeType(file.type)
                    ? normalizeMimeType(file.type)
                    : '') ||
                  inferTextMimeTypeFromFileName(name) ||
                  'text/plain',
                size: textBytes,
                dataUrl: textContent,
                kind: 'file',
              }
            }

            const compressedDataUrl = await compressImageToDataUrl(file).catch(
              () => null,
            )
            const dataUrl = compressedDataUrl || (await readFileAsDataUrl(file))
            if (!dataUrl) return null

            const dataUrlMimeType = readDataUrlMimeType(dataUrl)
            if (!isImageMimeType(dataUrlMimeType || '')) {
              return null
            }

            const transportBytes = estimateDataUrlBytes(dataUrl)
            if (transportBytes > MAX_TRANSPORT_IMAGE_SIZE) {
              toast(
                `Image compressed to ${(transportBytes / (1024 * 1024)).toFixed(2)}mb — still over the 1mb limit. Try a smaller screenshot.`,
                { type: 'warning' },
              )
              return null
            }

            const name =
              file.name && file.name.trim().length > 0
                ? file.name.trim()
                : `pasted-image-${timestamp}-${index + 1}.jpg`
            const detectedMimeType =
              dataUrlMimeType ||
              (isImageMimeType(file.type)
                ? normalizeMimeType(file.type)
                : '') ||
              inferImageMimeTypeFromFileName(name) ||
              'image/jpeg'
            return {
              id: crypto.randomUUID(),
              name,
              contentType: detectedMimeType,
              size: transportBytes,
              dataUrl,
              previewUrl: dataUrl,
              kind: 'image',
            }
          },
        ),
      )

      const valid = prepared.filter(
        (attachment): attachment is ChatComposerAttachment =>
          attachment !== null,
      )

      const skippedCount = prepared.length - valid.length
      if (skippedCount > 0) {
        toast(
          skippedCount === 1
            ? '1 file could not be attached.'
            : `${skippedCount} files could not be attached.`,
          { type: 'warning' },
        )
      }

      if (valid.length === 0) {
        setAttachmentProcessingCount((n) => Math.max(0, n - 1))
        return
      }

      setAttachments((prev) => [...prev, ...valid])
      setAttachmentProcessingCount((n) => Math.max(0, n - 1))
      focusPrompt()
    },
    [disabled, focusPrompt],
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const files = collectFilesFromDataTransfer(event.clipboardData)
      if (files.length === 0) return

      const text = event.clipboardData.getData('text/plain')
      if (text.trim().length === 0) {
        event.preventDefault()
      }
      void addAttachments(files)
    },
    [addAttachments, disabled],
  )

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      if (!hasAttachableData(event.dataTransfer)) return
      event.preventDefault()
      dragCounterRef.current += 1
      setIsDraggingOver(true)
      event.dataTransfer.dropEffect = 'copy'
    },
    [disabled],
  )

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      if (event.currentTarget.contains(event.relatedTarget as Node)) return
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) {
        setIsDraggingOver(false)
      }
    },
    [disabled],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      if (hasAttachableData(event.dataTransfer)) {
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    [disabled],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      const files = collectFilesFromDataTransfer(event.dataTransfer)
      resetDragState()
      if (files.length === 0) return
      void addAttachments(files)
    },
    [addAttachments, disabled, resetDragState],
  )

  const handleSubmit = useCallback(() => {
    if (disabled) return
    if (submittingRef.current) return
    if (attachmentProcessingCount > 0) {
      // Queue a submit to fire once all attachments finish processing
      pendingSubmitAfterAttachmentsRef.current = true
      return
    }
    const body = value.trim()
    if (body.length === 0 && attachments.length === 0) return
    submittingRef.current = true
    const attachmentPayload = attachments.map((attachment) => ({
      ...attachment,
    }))
    try {
      // Fast mode is incompatible with extended thinking — disable if thinking is on
      const effectiveFastMode =
        fastMode && thinkingLevel === 'off' ? true : false
      onSubmit(body, attachmentPayload, effectiveFastMode, {
        reset,
        setValue: setComposerValue,
        setAttachments: setComposerAttachments,
      })
    } finally {
      // Reset after a tick so rapid re-fires (double-click, Enter+form submit) are blocked
      setTimeout(() => {
        submittingRef.current = false
      }, 300)
    }
    clearDraft()
    shouldRefocusAfterSendRef.current = true
    setFocusAfterSubmitTick((prev) => prev + 1)
    focusPrompt()
  }, [
    attachmentProcessingCount,
    attachments,
    clearDraft,
    disabled,
    focusPrompt,
    onSubmit,
    reset,
    setComposerAttachments,
    setComposerValue,
    value,
    fastMode,
  ])

  // Fire queued submit once all in-flight attachment processing finishes
  useEffect(() => {
    if (attachmentProcessingCount !== 0) return
    if (!pendingSubmitAfterAttachmentsRef.current) return
    pendingSubmitAfterAttachmentsRef.current = false
    handleSubmit()
  }, [attachmentProcessingCount, handleSubmit])

  // ⌘+Shift+M (Mac) / Ctrl+Shift+M (Win) to open model selector
  useEffect(() => {
    const handleModelShortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'm'
      ) {
        event.preventDefault()
        event.stopPropagation()
        setIsModelMenuOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleModelShortcut, true)
    return () =>
      window.removeEventListener('keydown', handleModelShortcut, true)
  }, [])

  const submitDisabled =
    disabled ||
    (value.trim().length === 0 &&
      attachments.length === 0 &&
      attachmentProcessingCount === 0)

  const hasDraft = value.trim().length > 0 || attachments.length > 0
  const promptPlaceholder = isMobileViewport
    ? 'Message...'
    : 'Ask anything... (↵ to send · ⇧↵ new line · ⌘⇧M switch model)'
  const [serverCommands, setServerCommands] = useState<Array<SlashCommandDefinition>>([])

  useEffect(() => {
    fetch('/api/commands')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: { commands?: Array<{ command: string; description: string }> }) => {
        setServerCommands(data.commands ?? [])
      })
      .catch(() => {
        // fall back to DEFAULT_SLASH_COMMANDS only
      })
  }, [])

  const slashCommands = useMemo(
    () =>
      mergeSlashCommands(
        mergeSlashCommands(DEFAULT_SLASH_COMMANDS, serverCommands),
        (installedSkillsQuery.data ?? [])
          .filter((skill) => skill.installed && skill.enabled)
          .map((skill) => ({
            command: `/${skill.id}`,
            description: skill.description || `Run ${skill.name}`,
          })),
      ),
    [serverCommands, installedSkillsQuery.data],
  )
  const slashCommandQuery = useMemo(() => readSlashCommandQuery(value), [value])
  const isSlashMenuOpen =
    slashCommandQuery !== null && !disabled && !isSlashMenuDismissed

  const handleClearDraft = useCallback(() => {
    reset()
  }, [reset])

  const _isWebSearchActive = webSearchEnabled ?? isWebSearchMode
  void _isWebSearchActive // retained for future use / external prop

  const sttConfig =
    (sttConfigQuery.data?.config?.stt as Record<string, unknown> | undefined) || {}
  const sttProvider =
    typeof sttConfig.provider === 'string' ? sttConfig.provider.trim() : 'local'
  const useRemoteStt = sttProvider === 'groq' || sttProvider === 'openai'

  const appendTextToDraft = useCallback(
    (text: string, separator = ' ') => {
      const normalized = text.trim()
      if (!normalized) return
      setValue((prev) => {
        const next = prev.trim().length > 0 ? `${prev}${separator}${normalized}` : normalized
        persistDraft(next)
        return next
      })
    },
    [persistDraft],
  )

  const transcribeVoiceBlob = useCallback(
    async (blob: Blob) => {
      if (!useRemoteStt) {
        throw new Error('Remote STT is not enabled for this profile.')
      }

      const form = new FormData()
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
      form.set('file', blob, `voice-input.${extension}`)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: form,
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        text?: string
        error?: string
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `Transcription failed (${response.status})`)
      }
      return typeof payload.text === 'string' ? payload.text : ''
    },
    [useRemoteStt],
  )

  // Voice input (tap = speech-to-text)
  const voiceInput = useVoiceInput({
    transcribe: useRemoteStt ? transcribeVoiceBlob : undefined,
    onResult: useCallback(
      (text: string) => {
        appendTextToDraft(text)
      },
      [appendTextToDraft],
    ),
    onError: useCallback(
      (error: string) => {
        toast(error || 'Voice transcription failed', { type: 'error' })
      },
      [],
    ),
  })

  // Voice recorder (long-press = voice note)
  const voiceRecorder = useVoiceRecorder({
    onRecorded: useCallback(
      (blob: Blob, durationMs: number) => {
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4'
        const name = `voice-note-${Date.now()}.${ext}`
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : ''
          if (!dataUrl) return
          const secs = Math.round(durationMs / 1000)
          setAttachments((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name,
              contentType: blob.type || 'audio/webm',
              size: blob.size,
              dataUrl,
              previewUrl: '',
            },
          ])
          appendTextToDraft(`🎤 Voice note (${secs}s)`, '\n')
          if (useRemoteStt) {
            void transcribeVoiceBlob(blob)
              .then((text) => {
                if (text.trim()) {
                  appendTextToDraft(`Transcript: ${text.trim()}`, '\n')
                }
              })
              .catch((error) => {
                toast(
                  error instanceof Error
                    ? error.message
                    : 'Voice note transcription failed',
                  { type: 'error' },
                )
              })
          }
        }
        reader.readAsDataURL(blob)
      },
      [appendTextToDraft, transcribeVoiceBlob, useRemoteStt],
    ),
  })

  // Long-press detection for mic button
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressRef = useRef(false)
  const handleMicPointerDown = useCallback(() => {
    isLongPressRef.current = false
    // Start long-press timer for voice note recording (only if not already doing voice-to-text)
    if (!voiceInput.isListening && !voiceRecorder.isRecording) {
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true
        voiceRecorder.start()
      }, 500)
    }
  }, [voiceRecorder, voiceInput.isListening])
  const handleMicPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (isLongPressRef.current) {
      // Was a long press — stop voice note recording
      voiceRecorder.stop()
      isLongPressRef.current = false
    }
    // Short taps are handled by onClick for voice-to-text toggle
  }, [voiceRecorder])

  const handleAbort = useCallback(
    function handleAbort() {
      onAbort?.()
    },
    [onAbort],
  )

  const handleOpenAttachmentPicker = useCallback(
    function handleOpenAttachmentPicker(
      event: React.MouseEvent<HTMLButtonElement>,
    ) {
      event.preventDefault()
      if (disabled) return
      attachmentInputRef.current?.click()
    },
    [disabled],
  )

  const handleAttachmentInputChange = useCallback(
    function handleAttachmentInputChange(
      event: React.ChangeEvent<HTMLInputElement>,
    ) {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length === 0) return
      void addAttachments(files)
    },
    [addAttachments],
  )

  const handleSelectSlashCommand = useCallback(
    function handleSelectSlashCommand(command: SlashCommandDefinition) {
      if (command.command === '/fast') {
        setIsSlashMenuDismissed(false)
        setFastMode((previous) => !previous)
        setValue('')
        persistDraft('')
        focusPrompt()
        return
      }

      const nextValue = `${command.command} `
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
      focusPrompt()
    },
    [focusPrompt, persistDraft],
  )

  const handleDismissSlashMenu = useCallback(() => {
    setIsSlashMenuDismissed(true)
  }, [])

  const handlePromptSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (isSlashMenuOpen) {
        const applied = slashMenuRef.current?.selectActive() ?? false
        if (!applied) {
          setIsSlashMenuDismissed(true)
        }
        return
      }
      handleSubmit()
    },
    [handleSubmit, isSlashMenuOpen],
  )

  const handlePromptKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash menu navigation takes priority
      if (isSlashMenuOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          slashMenuRef.current?.moveSelection(1)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          slashMenuRef.current?.moveSelection(-1)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          handleDismissSlashMenu()
          return
        }
      }
      // Enter-to-send is handled by PromptInputTextarea via the onSubmit prop.
      // Handling it here too causes handleSubmit() to fire twice on every Enter
      // keypress (once via onSubmit → handlePromptSubmit, once via this onKeyDown
      // handler), which duplicates messages when text is pasted then sent.
    },
    [handleDismissSlashMenu, isSlashMenuOpen],
  )

  // Combine internal ref with external wrapperRef
  const setWrapperRefs = useCallback(
    (node: HTMLDivElement | null) => {
      composerWrapperRef.current = node
      if (typeof wrapperRef === 'function') {
        wrapperRef(node)
      } else if (wrapperRef && 'current' in wrapperRef) {
        ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node
      }
    },
    [wrapperRef],
  )

  const keyboardOrFocusActive = mobileKeyboardInset > 0 || mobileComposerFocused

  // Scroll-hide: hide composer when user scrolls up (reading older messages).
  // Re-show when user scrolls down or reaches the bottom.
  const [scrollHidden, setScrollHidden] = useState(false)
  // Reset scroll-hide state when session changes (prevents composer staying hidden when navigating)
  const prevSessionKeyRef = useRef<string | undefined>(undefined)
  if (prevSessionKeyRef.current !== sessionKey) {
    prevSessionKeyRef.current = sessionKey
    if (scrollHidden) setScrollHidden(false)
  }
  useEffect(() => {
    if (!isMobileViewport) return
    let lastScrollTop = 0
    let accumulated = 0
    const THRESHOLD = 40

    const handleScroll = () => {
      const viewport = document.querySelector('[data-chat-scroll-viewport]')
      if (!(viewport instanceof HTMLElement)) return
      const scrollTop = viewport.scrollTop
      const maxScroll = viewport.scrollHeight - viewport.clientHeight
      const delta = scrollTop - lastScrollTop
      lastScrollTop = scrollTop

      // Always show near bottom
      if (maxScroll - scrollTop < 64) {
        accumulated = 0
        setScrollHidden(false)
        return
      }

      if (delta < 0) {
        accumulated += Math.abs(delta)
        if (accumulated >= THRESHOLD) {
          setScrollHidden(true)
        }
      } else if (delta > 0) {
        accumulated = 0
        setScrollHidden(false)
      }
    }

    // Attach to the viewport once it's in the DOM
    const attach = () => {
      const viewport = document.querySelector('[data-chat-scroll-viewport]')
      if (viewport instanceof HTMLElement) {
        viewport.addEventListener('scroll', handleScroll, { passive: true })
        return viewport
      }
      return null
    }

    // Retry attachment if viewport not yet rendered
    let viewport = attach()
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    if (!viewport) {
      retryTimer = setTimeout(() => {
        viewport = attach()
      }, 500)
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      viewport?.removeEventListener('scroll', handleScroll)
    }
  }, [isMobileViewport])

  // Always show composer when keyboard/focus is active
  const effectiveScrollHidden = scrollHidden && !keyboardOrFocusActive

  const composerWrapperStyle = useMemo(() => {
    const chatContentMaxWidth = 'min(var(--chat-content-max-width), 100%)'
    if (!isMobileViewport || embedded)
      return { maxWidth: chatContentMaxWidth } as CSSProperties
    const safeArea = 'env(safe-area-inset-bottom, 0px)'
    const tabBarH = 'var(--tabbar-h, 0px)'
    const tf = effectiveScrollHidden ? 'translateY(110%)' : 'translateY(0)'

    if (keyboardOrFocusActive) {
      // All modes: keyboard up = flush at bottom with keyboard inset
      return {
        maxWidth: 'min(768px, 100%)',
        bottom: '0px',
        paddingBottom: `calc(var(--kb-inset, 0px))`,
        transform: tf,
        WebkitTransform: tf,
        '--mobile-tab-bar-offset': MOBILE_TAB_BAR_OFFSET,
      } as CSSProperties
    }

    if (chatNavMode === 'dock') {
      // iMessage mode: tab bar hidden, composer docks to bottom with safe area only
      return {
        maxWidth: 'min(768px, 100%)',
        bottom: '0px',
        paddingBottom: `max(var(--safe-b, 0px), ${safeArea})`,
        transform: tf,
        WebkitTransform: tf,
        '--mobile-tab-bar-offset': MOBILE_TAB_BAR_OFFSET,
      } as CSSProperties
    }

    // scroll-hide / integrated: tab bar visible, composer sits above it
    return {
      maxWidth: 'min(768px, 100%)',
      bottom: `calc(${tabBarH} + 4px)`,
      paddingBottom: '0px',
      transform: tf,
      WebkitTransform: tf,
      '--mobile-tab-bar-offset': MOBILE_TAB_BAR_OFFSET,
    } as CSSProperties
  }, [isMobileViewport, keyboardOrFocusActive, effectiveScrollHidden, embedded])

  return (
    <div
      className={cn(
        'no-swipe pointer-events-auto touch-manipulation',
        isMobileViewport
          ? embedded
            ? [
                // Embedded mobile composer: stay inside the card, no fixed bottom.
                'relative z-40 w-full',
                'bg-surface border-t border-primary-200/60',
              ].join(' ')
            : [
                'fixed z-[70] transition-all duration-200',
                chatNavMode === 'dock'
                  ? [
                      // iMessage-style: edge-to-edge, docked to bottom
                      'left-0 right-0',
                      'bg-surface/95 backdrop-blur-xl',
                      'border-t border-primary-200/60',
                    ].join(' ')
                  : [
                      // scroll-hide / integrated: floating pill above tab bar
                      'left-4 right-4',
                      'bg-surface/95 backdrop-blur-2xl',
                      'shadow-[0_8px_32px_rgba(0,0,0,0.15)]',
                      'rounded-[22px]',
                    ].join(' '),
              ].join(' ')
          : [
              'relative z-40 shrink-0 w-full mx-auto px-3 pt-2 sm:px-5',
              'bg-surface',
            ].join(' '),
        // Mobile: pin above tab bar + safe-area inset. Desktop: normal bottom padding.
        !isMobileViewport
          ? 'pb-[max(var(--safe-b),8px)] md:pb-[calc(var(--safe-b)+0.75rem)]'
          : '',
        'md:bg-surface/95 md:backdrop-blur md:transition-[padding-bottom,background-color,backdrop-filter] md:duration-200',
      )}
      style={composerWrapperStyle}
      ref={setWrapperRefs}
    >
      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*,.md,.txt,.json,.csv,.ts,.tsx,.js,.py"
        multiple
        className="hidden"
        onChange={handleAttachmentInputChange}
      />
      <PromptInput
        value={value}
        onValueChange={handleValueChange}
        onSubmit={handlePromptSubmit}
        isLoading={isLoading}
        disabled={disabled}
        maxHeight={isMobileViewport ? 120 : 240}
        className={cn(
          'relative z-50 transition-all duration-300',
          // On mobile: remove PromptInput's built-in rounded/bg/padding — outer wrapper owns the container
          isMobileViewport &&
            'py-0 gap-0 !rounded-none !bg-transparent shadow-none outline-none',
          isDraggingOver &&
            'outline-primary-500 ring-2 ring-primary-300 bg-primary-50/80',
          isLoading &&
            'ring-2 ring-accent-400/70 shadow-[0_0_20px_rgba(48,80,255,0.35)] animate-pulse-glow',
        )}
        onPaste={handlePaste}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <SlashCommandMenu
          ref={slashMenuRef}
          open={isSlashMenuOpen}
          query={slashCommandQuery ?? ''}
          commands={slashCommands}
          onSelect={handleSelectSlashCommand}
        />

        {isDraggingOver ? (
          <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[18px] border-2 border-dashed border-primary-400 bg-primary-50/90 text-sm font-medium text-primary-700">
            Drop files to attach
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="px-3">
            <div className="flex flex-wrap gap-3">
              {attachments.map((attachment) => {
                const isImageAttachment =
                  Boolean(attachment.previewUrl) &&
                  isImageMimeType(attachment.contentType)

                return (
                  <div
                    key={attachment.id}
                    className={cn(
                      'group relative',
                      isImageAttachment ? 'w-28' : 'w-auto max-w-[16rem]',
                    )}
                  >
                    {isImageAttachment ? (
                      <button
                        type="button"
                        className="aspect-square w-full overflow-hidden rounded-xl border border-primary-200 bg-primary-50"
                        onClick={() =>
                          setPreviewImage({
                            url: attachment.previewUrl || '',
                            name: attachment.name || 'Attached image',
                          })
                        }
                        aria-label={`Preview ${attachment.name || 'image'}`}
                      >
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name || 'Attached image'}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">
                        <span className="mr-1">📄</span>
                        <span className="truncate">{attachment.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleRemoveAttachment(attachment.id)
                      }}
                      className="absolute right-1 top-1 z-10 inline-flex size-6 items-center justify-center rounded-full bg-primary-900/80 text-primary-50 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </button>
                    <div className="mt-1 truncate text-xs font-medium text-primary-700">
                      {attachment.name}
                    </div>
                    <div className="text-[11px] text-primary-400">
                      {formatFileSize(attachment.size)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

                    <PromptInputTextarea
              placeholder={promptPlaceholder}
              autoFocus={!isMobileViewport}
              inputRef={promptRef}
              onKeyDown={handlePromptKeyDown}
              onFocus={() => {
                setMobileComposerFocused(true)
                // Keep fallback behavior for browsers without visualViewport.
                if (!window.visualViewport) {
                  setMobileKeyboardOpen(true)
                  setMobileKeyboardInset(0)
                }
              }}
              onBlur={() => {
                setMobileComposerFocused(false)
                if (!window.visualViewport) {
                  setMobileKeyboardOpen(false)
                  setMobileKeyboardInset(0)
                }
              }}
              className="min-h-[44px]"
            />
            <PromptInputActions className="justify-between px-1.5 md:px-3 py-1 gap-1 md:gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 md:gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
                <PromptInputAction tooltip="Add attachment">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="rounded-lg text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-primary-500"
                    aria-label="Add attachment"
                    disabled={disabled}
                    onClick={handleOpenAttachmentPicker}
                  >
                    <HugeiconsIcon
                      icon={AttachmentIcon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </Button>
                </PromptInputAction>
                {hasDraft && !isLoading && (
                  <PromptInputAction tooltip="Clear draft">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-lg text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-red-600"
                      aria-label="Clear draft"
                      onClick={handleClearDraft}
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </Button>
                  </PromptInputAction>
                )}
                {/* Token counter — bottom bar, mirrors Hermes style, triggers at ~25 tokens */}
                {value.length >= 100 && (
                  <span className="ml-1 text-[10px] text-primary-400 tabular-nums select-none">
                    ~{Math.ceil(value.length / 4)} tokens
                  </span>
                )}

                                {/* 1. Agent Profile Pill */}
                {isAgyMode ? (
                  <div
                    className="inline-flex h-7 md:h-8 max-w-[7.5rem] sm:max-w-[10rem] items-center gap-1 md:gap-1.5 rounded-full bg-accent-500/10 dark:bg-accent-500/20 border border-accent-500/30 px-2 md:px-2.5 text-[11px] md:text-xs font-medium text-accent-700 dark:text-accent-300 shrink-0 select-none"
                    title="Profile is locked to Antigravity for this session"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-500 shrink-0" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span className="truncate">antigravity</span>
                  </div>
                ) : (
                  <div
                    className="relative flex min-w-0 items-center"
                    ref={profileMenuRef}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen((open) => !open)
                        setIsThinkingMenuOpen(false)
                        setIsModelMenuOpen(false)
                      }}
                      disabled={disabled || profileActivateMutation.isPending}
                      className={cn(
                        'inline-flex h-7 md:h-8 max-w-[6.5rem] sm:max-w-[9rem] items-center gap-1 md:gap-1.5 rounded-full bg-primary-100/70 dark:bg-neutral-800/80 px-2 md:px-2.5 text-[11px] md:text-xs font-medium text-primary-600 dark:text-neutral-300 transition-colors hover:bg-primary-200/80 dark:hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 cursor-pointer',
                        isProfileMenuOpen && 'ring-1 ring-accent-500 bg-primary-200/90 dark:bg-neutral-700',
                      )}
                      title={
                        activeProfile
                          ? `${activeProfile.name}${profileMeta(activeProfile) ? ` · ${profileMeta(activeProfile)}` : ''}`
                          : activeProfileName
                      }
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="truncate">{activeProfileName}</span>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={11} />
                    </button>
                    {typeof document !== 'undefined' && isProfileMenuOpen && createPortal(
                      <>
                        <div className="fixed inset-0 z-[9998]" onClick={() => setIsProfileMenuOpen(false)} />
                        <div
                          className="fixed z-[9999] min-w-[14rem] max-h-[18rem] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150 dark:border-neutral-700 dark:bg-neutral-900"
                          style={{
                            left: `${getPopupPosition(profileMenuRef.current, 224).left}px`,
                            bottom: `${getPopupPosition(profileMenuRef.current, 224).bottom}px`,
                          }}
                        >
                          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            Agent profile
                          </div>
                          {profilesQuery.isLoading && (
                            <div className="px-3 py-2 text-xs text-neutral-400 animate-pulse">Loading profiles…</div>
                          )}
                          {(() => {
                            const list = [...(profilesQuery.data?.profiles ?? [])]
                            if (!list.some((p) => p.name === 'default')) {
                              list.unshift({ name: 'default' })
                            }
                            return list.map((profile) => {
                              const selected = profile.name === activeProfileName
                              return (
                                <button
                                  key={profile.name}
                                  type="button"
                                  onClick={() => {
                                    if (selected) {
                                      setIsProfileMenuOpen(false)
                                      return
                                    }
                                    profileActivateMutation.mutate(profile.name)
                                    setIsProfileMenuOpen(false)
                                  }}
                                  className={cn(
                                    'flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                                    selected
                                      ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-neutral-50'
                                      : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60',
                                  )}
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="truncate font-medium">{profile.name}</span>
                                    {selected ? <span className="text-[10px] text-accent-500">active</span> : null}
                                  </span>
                                  {profileMeta(profile) ? <span className="mt-0.5 max-w-[12rem] truncate text-[11px] text-neutral-500">{profileMeta(profile)}</span> : null}
                                </button>
                              )
                            })
                          })()}
                          {profilesQuery.isError ? <div className="px-3 py-2 text-xs text-red-500">Failed to load profiles</div> : null}
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
                )}

                {/* 1b. Project Selector Chip for Antigravity Session */}
                {isAntigravitySession && (
                  <ProjectSessionChip
                    sessionKey={sessionKey || currentSession?.key || currentSession?.id}
                    projectId={currentSession?.projectId}
                    projectName={lockedSessionFolder}
                    source="antigravity"
                    compact
                    className="h-7 md:h-8 shrink-0"
                  />
                )}

                          <div
                            className="relative flex min-w-0 items-center"
                            ref={thinkingMenuRef}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setIsThinkingMenuOpen((open) => !open)
                                setIsProfileMenuOpen(false)
                                setIsModelMenuOpen(false)
                              }}
                              className={cn(
                      'inline-flex h-7 md:h-8 items-center gap-1 md:gap-1.5 rounded-full bg-primary-100/70 dark:bg-neutral-800/80 px-2 md:px-2.5 text-[11px] md:text-xs font-medium text-primary-600 dark:text-neutral-300 transition-colors hover:bg-primary-200/80 dark:hover:bg-neutral-700/80 shrink-0 cursor-pointer',
                      isThinkingMenuOpen && 'ring-1 ring-accent-500 bg-primary-200/90 dark:bg-neutral-700',
                      thinkingLevel === 'off' && 'opacity-70',
                    )}
                              title={`Reasoning effort: ${thinkingLabel(thinkingLevel)}`}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
                                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
                              </svg>
                              <span>{thinkingLabel(thinkingLevel)}</span>
                              <HugeiconsIcon icon={ArrowDown01Icon} size={11} />
                            </button>
                            {typeof document !== 'undefined' && isThinkingMenuOpen && createPortal(
                              <>
                                <div className="fixed inset-0 z-[9998]" onClick={() => setIsThinkingMenuOpen(false)} />
                                <div
                                  className="fixed z-[9999] min-w-[10rem] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150 dark:border-neutral-700 dark:bg-neutral-900"
                                  style={{
                                    left: `${getPopupPosition(thinkingMenuRef.current, 160).left}px`,
                                    bottom: `${getPopupPosition(thinkingMenuRef.current, 160).bottom}px`,
                                  }}
                                >
                                  {((isAgyMode
                                    ? [
                                        ['low', 'Low'],
                                        ['medium', 'Medium'],
                                        ['high', 'High'],
                                      ]
                                    : [
                                        ['off', 'None'],
                                        ['low', 'Low'],
                                        ['medium', 'Medium'],
                                        ['high', 'High'],
                                      ]) as Array<[ThinkingLevel, string]>).map(([level, label]) => (
                                      <button
                                        key={level}
                                        type="button"
                                        onClick={() => handleThinkingSelect(level)}
                                        className={cn(
                                          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                                          thinkingLevel === level
                                            ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-neutral-50'
                                            : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60',
                                        )}
                                      >
                                        <span>{label}</span>
                                        {thinkingLevel === level ? <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> : null}
                                      </button>
                                    ))}
                                </div>
                              </>,
                              document.body
                            )}
                        </div>

                        {!hideModelSelector ? (
                          <div
                            className="relative flex min-w-0 items-center shrink-0"
                            ref={modelSelectorRef}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setIsModelMenuOpen((prev) => !prev)
                                setIsProfileMenuOpen(false)
                                setIsThinkingMenuOpen(false)
                              }}
                              disabled={isModelSwitcherDisabled}
                              className={cn(
                        'inline-flex h-7 md:h-8 max-w-[8rem] sm:max-w-[12rem] md:max-w-[16rem] items-center gap-1 md:gap-1.5 rounded-full bg-primary-100/70 dark:bg-neutral-800/80 px-2 md:px-2.5 text-[11px] md:text-xs font-medium text-primary-600 dark:text-neutral-300 hover:bg-primary-200/80 dark:hover:bg-neutral-700/80 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0',
                        isModelMenuOpen && 'ring-1 ring-accent-500 bg-primary-200/90 dark:bg-neutral-700',
                      )}
                              title={modelButtonLabel}
                            >
                              <span className="truncate">{formatModelName(modelButtonLabel)}</span>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={10} className="shrink-0 text-primary-400 dark:text-neutral-500" />
                    </button>
                            {typeof document !== 'undefined' && !isMobileViewport && isModelMenuOpen && createPortal(
                              <>
                                <div className="fixed inset-0 z-[9998]" onClick={() => { setIsModelMenuOpen(false); setModelSearchQuery(''); }} />
                                <div
                                  className="fixed z-[9999] w-[min(28rem,calc(100vw-2rem))] min-w-[18rem] origin-bottom-left overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900 animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col"
                                  style={{
                                    left: `${getPopupPosition(modelSelectorRef.current, 380).left}px`,
                                    bottom: `${getPopupPosition(modelSelectorRef.current, 380).bottom}px`,
                                  }}
                                >
                                  <div className="border-b border-neutral-200 bg-white/95 p-2 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
                                    <div className="relative flex items-center">
                                      <svg className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                      </svg>
                                      <input
                                        type="text"
                                        value={modelSearchQuery}
                                        onChange={(e) => setModelSearchQuery(e.target.value)}
                                        placeholder="Filter models in realtime..."
                                        className="w-full rounded-lg bg-neutral-100 py-1.5 pl-8 pr-7 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-neutral-800 dark:text-neutral-100"
                                        autoFocus
                                      />
                                      {modelSearchQuery ? (
                                        <button
                                          type="button"
                                          onClick={() => setModelSearchQuery('')}
                                          className="absolute right-2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                                          title="Clear filter"
                                        >
                                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                          </svg>
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="max-h-[20rem] overflow-y-auto overflow-x-hidden p-1">
                                    {(() => {
                                      if (modelsQuery.isLoading && !modelsQuery.data && !isAgyMode) {
                                        return <div className="p-4 text-center text-sm text-neutral-500 animate-pulse">Loading models…</div>
                                      }
                                      const allModels = modelsQuery.data?.models ?? []
                                      const defaultProvider = modelsQuery.data?.currentProvider ?? ''
                                      if (allModels.length === 0 && !isAgyMode) {
                                        return <div className="p-4 text-center text-sm text-neutral-500">No models available</div>
                                      }
                                      const parsed = allModels
                                        .map((m) => {
                                          const mId = String(typeof m === 'string' ? m : m.id || m.model || m.name || 'unknown')
                                          const mName = String(typeof m === 'string' ? m : m.name || m.displayName || m.label || m.id || m.model || m)
                                          const mProvider = typeof m === 'string' ? defaultProvider : ((m as Record<string, unknown>).provider as string) || defaultProvider
                                          const isLocal = typeof m !== 'string' && (m as Record<string, unknown>).description === 'local'
                                          return { id: mId, name: mName, provider: mProvider, isLocal }
                                        })
                                        .filter((m) => (isAgyMode ? isAgyModelId(m.id, m.provider) : true))

                                      let displayModels = parsed
                                      if (isAgyMode) {
                                        const seen = new Set<string>()
                                        const deduped: typeof parsed = []
                                        for (const m of parsed) {
                                          const rawBase = m.id.replace(/^(antigravity|google|anthropic|openai)\//, '').replace(/-(low|medium|high)$/, '')
                                          if (!seen.has(rawBase)) {
                                            seen.add(rawBase)
                                            deduped.push({
                                              id: `antigravity/${rawBase}`,
                                              name: formatModelName(rawBase),
                                              provider: 'antigravity',
                                              isLocal: false,
                                            })
                                          }
                                        }
                                        displayModels = deduped.length > 0 ? deduped : DEFAULT_AGY_MODELS
                                      }

                                      const query = modelSearchQuery.trim().toLowerCase()
                                      const filtered = query
                                        ? displayModels.filter(
                                            (m) =>
                                              m.name.toLowerCase().includes(query) ||
                                              m.id.toLowerCase().includes(query) ||
                                              m.provider.toLowerCase().includes(query),
                                          )
                                        : displayModels
                                      if (filtered.length === 0) {
                                        return (
                                          <div className="p-4 text-center text-xs text-neutral-500">
                                            <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                              No models match &ldquo;{modelSearchQuery}&rdquo;
                                            </p>
                                            <button
                                              type="button"
                                              onClick={() => setModelSearchQuery('')}
                                              className="text-accent-600 hover:underline text-[11px]"
                                            >
                                              Clear filter
                                            </button>
                                          </div>
                                        )
                                      }
                                      const pinnedEntries = filtered.filter((e) => isPinned(e.id))
                                      const unpinnedGroups = new Map<string, typeof parsed>()
                                      for (const entry of filtered) {
                                        if (isPinned(entry.id) && !query) continue
                                        const group = unpinnedGroups.get(entry.provider) ?? []
                                        group.push(entry)
                                        unpinnedGroups.set(entry.provider, group)
                                      }
                                      const activeModelId = persistedSessionModel || currentModel
                                      const isGroupCollapsed = (prov: string, groupList: typeof parsed) => {
                                        if (isAgyMode) return false
                                        if (query) return false
                                        if (collapsedProviders[prov] !== undefined) return collapsedProviders[prov]
                                        const hasActive = groupList.some((m) => isCurrentModel(activeModelId, m.id, m.provider))
                                        return !hasActive
                                      }
                                      const renderEntry = (entry: (typeof parsed)[0]) => {
                                        const activeRawBase = (modelButtonLabel || '').replace(/^antigravity\//, '').replace(/-(low|medium|high)$/, '')
                                        const entryRawBase = entry.id.replace(/^antigravity\//, '').replace(/-(low|medium|high)$/, '')
                                        const isActive = isAgyMode
                                          ? activeRawBase === entryRawBase
                                          : isCurrentModel(
                                              activeModelId,
                                              entry.id,
                                              entry.provider,
                                            )
                                        return (
                                          <div key={entry.id} className="group relative flex items-center">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                handleModelSelect(entry.id, entry.provider || undefined)
                                                setIsModelMenuOpen(false)
                                                setModelSearchQuery('')
                                              }}
                                              className={`flex flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition-colors rounded-lg ${
                                                isActive
                                                  ? 'border-l-2 border-accent-500 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium'
                                                  : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/50'
                                              }`}
                                            >
                                              <span className="flex-1 truncate">{entry.name}</span>
                                              {entry.isLocal ? <span className="text-[10px] text-neutral-400 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700">local</span> : null}
                                              {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> : null}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                togglePin(entry.id)
                                              }}
                                              className={`absolute right-2 rounded p-1 transition-opacity ${
                                                isPinned(entry.id)
                                                  ? 'text-accent-500 opacity-80 hover:opacity-100'
                                                  : 'text-neutral-400 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-accent-500'
                                              }`}
                                              aria-label={isPinned(entry.id) ? `Unpin ${entry.name}` : `Pin ${entry.name}`}
                                            >
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill={isPinned(entry.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                                <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                              </svg>
                                            </button>
                                          </div>
                                        )
                                      }
                                      return (
                                        <>
                                          {pinnedEntries.length > 0 ? (
                                            <div className="mb-1 border-b border-neutral-200 pb-1 dark:border-neutral-700">
                                              <div className="mb-1 flex items-center gap-1 px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="text-accent-500">
                                                  <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                                </svg>
                                                <span>Pinned ({pinnedEntries.length})</span>
                                              </div>
                                              {pinnedEntries.map(renderEntry)}
                                            </div>
                                          ) : null}
                                          {Array.from(unpinnedGroups.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([provider, models]) => {
                                            const collapsed = isGroupCollapsed(provider, models)
                                            return (
                                              <div key={provider} className="mb-1">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setCollapsedProviders((prev) => ({
                                                      ...prev,
                                                      [provider]: !collapsed,
                                                    }))
                                                  }}
                                                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                                                >
                                                  <span className="flex items-center gap-1.5">
                                                    <svg
                                                      className={`h-3 w-3 transition-transform duration-150 ${collapsed ? '-rotate-90 text-neutral-400' : 'rotate-0 text-neutral-600 dark:text-neutral-300'}`}
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      strokeWidth="2"
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                    >
                                                      <polyline points="6 9 12 15 18 9" />
                                                    </svg>
                                                    <span>{provider}</span>
                                                  </span>
                                                  <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                                                    {models.length}
                                                  </span>
                                                </button>
                                                {!collapsed && (
                                                  <div className="mt-0.5 pl-1 space-y-0.5">
                                                    {models.map(renderEntry)}
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </>
                                      )
                                    })()}
                                  </div>
                                </div>
                              </>,
                              document.body
                            )}
                          </div>
                        ) : null}
                      </div>
              <div className="ml-1 flex shrink-0 items-center gap-0.5 md:gap-1">
                <ContextBar compact sessionId={sessionKey} />
                {voiceInput.isSupported || voiceRecorder.isSupported ? (
                  <PromptInputAction
                    tooltip={
                      voiceRecorder.isRecording
                        ? `Recording… ${Math.round(voiceRecorder.durationMs / 1000)}s`
                        : voiceInput.isListening
                          ? 'Listening — tap to stop'
                          : 'Tap: dictate · Hold: voice note'
                    }
                  >
                    <Button
                      onClick={() => {
                        if (voiceInput.isListening) {
                          voiceInput.stop()
                        } else if (voiceRecorder.isRecording) {
                          voiceRecorder.stop()
                        } else {
                          voiceInput.start()
                        }
                      }}
                      onPointerDown={handleMicPointerDown}
                      onPointerUp={handleMicPointerUp}
                      onPointerLeave={handleMicPointerUp}
                      size="icon-sm"
                      variant="ghost"
                      className={cn(
                        'rounded-lg transition-colors select-none',
                        voiceRecorder.isRecording
                          ? 'text-red-600 bg-red-100 hover:bg-red-200 animate-pulse'
                          : voiceInput.isListening
                            ? 'text-red-500 bg-red-50 hover:bg-red-100 animate-pulse'
                            : 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-primary-700',
                      )}
                      aria-label={
                        voiceRecorder.isRecording
                          ? 'Recording voice note'
                          : voiceInput.isListening
                            ? 'Stop listening'
                            : 'Voice input'
                      }
                      disabled={disabled}
                    >
                      <HugeiconsIcon
                        icon={Mic01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                      {voiceRecorder.isRecording ? (
                        <span className="absolute -top-1 -right-1 flex size-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex size-3 rounded-full bg-red-500" />
                        </span>
                      ) : null}
                    </Button>
                  </PromptInputAction>
                ) : null}
                {isLoading ? (
                  <PromptInputAction tooltip="Stop generation">
                    <Button
                      onClick={handleAbort}
                      size="icon-sm"
                      variant="destructive"
                      className="rounded-md"
                      aria-label="Stop generation"
                    >
                      <HugeiconsIcon
                        icon={StopIcon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </Button>
                  </PromptInputAction>
                ) : (
                  <>
                    <PromptInputAction tooltip="Send message">
                      <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitDisabled}
                        size="icon-sm"
                        className="rounded-full"
                        aria-label="Send message"
                      >
                        <HugeiconsIcon
                          icon={ArrowUp02Icon}
                          size={20}
                          strokeWidth={1.5}
                        />
                      </Button>
                    </PromptInputAction>
                  </>
                )}
              </div>
            </PromptInputActions>
      </PromptInput>

      {/* Mobile model picker sheet — portaled to body on mobile */}
      {typeof document !== 'undefined' && isModelMenuOpen && isMobileViewport
              ? createPortal(
                  <>
                    <button
                      type="button"
                      aria-label="Close model picker"
                      className="fixed inset-0 z-[209] bg-black/40 backdrop-blur-xs transition-opacity"
                      onClick={() => {
                        setIsModelMenuOpen(false)
                        setModelSearchQuery('')
                        setMobileProviderFilter('all')
                      }}
                    />
                    <div
                      className="fixed inset-x-0 bottom-0 z-[210] flex flex-col rounded-t-3xl bg-white dark:bg-neutral-900 shadow-2xl transition-all duration-200 overflow-hidden"
                      style={{
                        maxHeight: mobileKeyboardInset > 0 ? `calc(100dvh - ${mobileKeyboardInset + 16}px)` : '88dvh',
                        bottom: mobileKeyboardInset > 0 ? `${mobileKeyboardInset}px` : 0,
                        paddingBottom: mobileKeyboardInset > 0 ? '8px' : 'max(env(safe-area-inset-bottom, 16px), 16px)',
                      }}
                      role="dialog"
                      aria-label="Select model"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {/* Drag handle */}
                      <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-600" />

                      {/* Header with Title and Close Button */}
                      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                            Select Model
                          </span>
                          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs text-neutral-500 font-medium">
                            {modelsQuery.data?.models?.length ?? 0}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsModelMenuOpen(false)
                            setModelSearchQuery('')
                            setMobileProviderFilter('all')
                          }}
                          className="size-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 active:scale-95 transition-all cursor-pointer"
                          aria-label="Close model selector"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
                        </button>
                      </div>

                      {/* Search Bar */}
                      <div className="px-4 pt-3 pb-2">
                        <div className="relative flex items-center">
                          <svg className="absolute left-3.5 size-4 text-neutral-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <input
                            type="text"
                            value={modelSearchQuery}
                            onChange={(e) => setModelSearchQuery(e.target.value)}
                            placeholder="Filter models or providers..."
                            className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-800 py-2.5 pl-10 pr-9 text-base md:text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
                          />
                          {modelSearchQuery ? (
                            <button
                              type="button"
                              onClick={() => setModelSearchQuery('')}
                              className="absolute right-2.5 size-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 active:scale-90 cursor-pointer"
                              title="Clear filter"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* Content Area */}
                      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 space-y-1">
                        {(() => {
                          if (modelsQuery.isLoading && !modelsQuery.data && !isAgyMode) {
                            return (
                              <div className="p-6 text-center text-sm text-neutral-500 animate-pulse">
                                Loading models…
                              </div>
                            )
                          }
                          const allModels = modelsQuery.data?.models ?? []
                          const defaultProvider = modelsQuery.data?.currentProvider ?? ''
                          if (allModels.length === 0 && !isAgyMode) {
                            return (
                              <div className="p-6 text-center text-sm text-neutral-500">
                                <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  No models available
                                </p>
                                <p className="text-xs">
                                  Check your Hermes provider configuration.
                                </p>
                              </div>
                            )
                          }
                          const parsed = allModels
                            .map((m) => {
                              const mId = String(typeof m === 'string' ? m : m.id || m.model || m.name || 'unknown')
                              const mName = String(typeof m === 'string' ? m : m.name || m.displayName || m.label || m.id || m.model || m)
                              const mProvider = typeof m === 'string' ? defaultProvider : ((m as Record<string, unknown>).provider as string) || defaultProvider
                              const isLocal = typeof m !== 'string' && (m as Record<string, unknown>).description === 'local'
                              return { id: mId, name: mName, provider: mProvider, isLocal }
                            })
                            .filter((m) => (isAgyMode ? isAgyModelId(m.id, m.provider) : true))

                          let displayModels = parsed
                          if (isAgyMode) {
                            const seen = new Set<string>()
                            const deduped: typeof parsed = []
                            for (const m of parsed) {
                              const rawBase = m.id.replace(/^(antigravity|google|anthropic|openai)\//, '').replace(/-(low|medium|high)$/, '')
                              if (!seen.has(rawBase)) {
                                seen.add(rawBase)
                                deduped.push({
                                  id: `antigravity/${rawBase}`,
                                  name: formatModelName(rawBase),
                                  provider: 'antigravity',
                                  isLocal: false,
                                })
                              }
                            }
                            displayModels = deduped.length > 0 ? deduped : DEFAULT_AGY_MODELS
                          }

                          // Providers list for quick pill filter
                          const providerNames = Array.from(new Set(parsed.map((m) => m.provider))).filter(Boolean).sort()

                          const query = modelSearchQuery.trim().toLowerCase()
                          let filtered = query
                            ? displayModels.filter(
                                (m) =>
                                  m.name.toLowerCase().includes(query) ||
                                  m.id.toLowerCase().includes(query) ||
                                  m.provider.toLowerCase().includes(query),
                              )
                            : displayModels

                          if (mobileProviderFilter !== 'all') {
                            filtered = filtered.filter((m) => m.provider === mobileProviderFilter)
                          }

                          const pinnedEntries = filtered.filter((e) => isPinned(e.id))
                          const unpinnedGroups = new Map<string, typeof parsed>()
                          for (const entry of filtered) {
                            if (isPinned(entry.id) && !query && mobileProviderFilter === 'all') continue
                            const group = unpinnedGroups.get(entry.provider) ?? []
                            group.push(entry)
                            unpinnedGroups.set(entry.provider, group)
                          }
                          const activeModelId = persistedSessionModel || currentModel
                          const isGroupCollapsed = (prov: string, groupList: typeof parsed) => {
                            if (isAgyMode) return false
                            if (query || mobileProviderFilter !== 'all') return false
                            if (collapsedProviders[prov] !== undefined) return collapsedProviders[prov]
                            const hasActive = groupList.some((m) => isCurrentModel(activeModelId, m.id, m.provider))
                            return !hasActive
                          }

                          const renderEntry = (entry: (typeof parsed)[0]) => {
                            const activeRawBase = (modelButtonLabel || '').replace(/^antigravity\//, '').replace(/-(low|medium|high)$/, '')
                            const entryRawBase = entry.id.replace(/^antigravity\//, '').replace(/-(low|medium|high)$/, '')
                            const isActive = isAgyMode
                              ? activeRawBase === entryRawBase
                              : isCurrentModel(
                                  activeModelId,
                                  entry.id,
                                  entry.provider,
                                )
                            const onSelect = (e: React.SyntheticEvent) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                                document.activeElement.blur()
                              }
                              handleModelSelect(entry.id, entry.provider || undefined)
                              setIsModelMenuOpen(false)
                              setModelSearchQuery('')
                              setMobileProviderFilter('all')
                            }
                            return (
                              <div key={entry.id} className="relative flex items-center mb-1.5 touch-manipulation">
                                <button
                                  type="button"
                                  onClick={onSelect}
                                  onPointerUp={(e) => {
                                    if (e.pointerType === 'touch') {
                                      onSelect(e)
                                    }
                                  }}
                                  className={cn(
                                    'flex flex-1 min-h-[50px] items-center justify-between gap-3 px-3.5 py-2.5 text-left rounded-xl border transition-all active:scale-[0.99] cursor-pointer touch-manipulation',
                                    isActive
                                      ? 'border-accent-500 bg-accent-50/80 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 shadow-xs'
                                      : 'border-neutral-200/60 dark:border-neutral-700/60 bg-neutral-50/80 dark:bg-neutral-800/40 text-neutral-800 dark:text-neutral-200 active:bg-neutral-100 dark:active:bg-neutral-800'
                                  )}
                                >
                                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-2">
                                      <span className={cn('truncate text-[14px] leading-snug', isActive ? 'font-semibold' : 'font-medium')}>
                                        {entry.name}
                                      </span>
                                      {entry.isLocal && (
                                        <span className="text-[10px] text-neutral-500 px-1.5 py-0.2 rounded-full bg-neutral-200/70 dark:bg-neutral-700/70 shrink-0">
                                          local
                                        </span>
                                      )}
                                    </div>
                                    {entry.name !== entry.id && (
                                      <span className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5 leading-tight">
                                        {entry.id}
                                      </span>
                                    )}
                                  </div>
                                  {isActive ? (
                                    <span className="size-6 rounded-full bg-accent-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    </span>
                                  ) : null}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    togglePin(entry.id)
                                  }}
                                  className="ml-1 size-10 rounded-xl flex items-center justify-center text-neutral-400 hover:text-amber-500 active:scale-90 shrink-0 cursor-pointer"
                                  aria-label={isPinned(entry.id) ? `Unpin ${entry.name}` : `Pin ${entry.name}`}
                                >
                                  <svg
                                    className={cn('size-4 transition-colors', isPinned(entry.id) ? 'fill-amber-400 text-amber-500' : 'fill-none text-neutral-300 dark:text-neutral-600')}
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                  </svg>
                                </button>
                              </div>
                            )
                          }

                          return (
                            <>
                              {/* Horizontal Quick-Filter Pills */}
                              {providerNames.length > 1 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 mb-2">
                                  <button
                                    type="button"
                                    onClick={() => setMobileProviderFilter('all')}
                                    className={cn(
                                      'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 cursor-pointer',
                                      mobileProviderFilter === 'all'
                                        ? 'bg-accent-500 text-white shadow-xs'
                                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                                    )}
                                  >
                                    All ({parsed.length})
                                  </button>
                                  {providerNames.map((p) => {
                                    const count = parsed.filter((m) => m.provider === p).length
                                    const isSelected = mobileProviderFilter === p
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => setMobileProviderFilter(isSelected ? 'all' : p)}
                                        className={cn(
                                          'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 cursor-pointer',
                                          isSelected
                                            ? 'bg-accent-500 text-white shadow-xs'
                                            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                                        )}
                                      >
                                        {p} ({count})
                                      </button>
                                    )
                                  })}
                                </div>
                              )}

                              {filtered.length === 0 ? (
                                <div className="p-6 text-center text-xs text-neutral-500">
                                  <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                    No models match your filter
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModelSearchQuery('')
                                      setMobileProviderFilter('all')
                                    }}
                                    className="text-accent-600 hover:underline text-xs cursor-pointer font-medium"
                                  >
                                    Reset filters
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {pinnedEntries.length > 0 && (
                                    <div className="mb-3 border-b border-neutral-100 dark:border-neutral-800 pb-2">
                                      <div className="flex items-center gap-1.5 px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                                        <svg
                                          width="13"
                                          height="13"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          className="text-amber-500"
                                        >
                                          <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                                        </svg>
                                        <span>Pinned ({pinnedEntries.length})</span>
                                      </div>
                                      {pinnedEntries.map(renderEntry)}
                                    </div>
                                  )}
                                  {Array.from(unpinnedGroups.entries())
                                    .sort((a, b) => a[0].localeCompare(b[0]))
                                    .map(([provider, models]) => {
                                      const collapsed = isGroupCollapsed(provider, models)
                                      return (
                                        <div key={provider} className="mb-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCollapsedProviders((prev) => ({
                                                ...prev,
                                                [provider]: !collapsed,
                                              }))
                                            }}
                                            className="flex w-full min-h-[42px] items-center justify-between rounded-xl px-3.5 py-2 my-1 text-xs font-semibold uppercase tracking-wider bg-neutral-100/90 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50 active:bg-neutral-200 dark:active:bg-neutral-700 transition-colors cursor-pointer"
                                          >
                                            <span className="flex items-center gap-2">
                                              <svg
                                                className={`size-3.5 transition-transform duration-200 ${collapsed ? '-rotate-90 text-neutral-400' : 'rotate-0 text-accent-500'}`}
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                              >
                                                <polyline points="6 9 12 15 18 9" />
                                              </svg>
                                              <span>{provider}</span>
                                            </span>
                                            <span className="rounded-full bg-white dark:bg-neutral-700 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 shadow-xs">
                                              {models.length}
                                            </span>
                                          </button>
                                          {!collapsed && (
                                            <div className="mt-1 space-y-1">
                                              {models.map(renderEntry)}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                </>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </>,
                  document.body,
                )
              : null}

      {/* Fullscreen image preview overlay — portaled to body to escape stacking context */}
      {previewImage &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setPreviewImage(null)}
            role="dialog"
            aria-label="Image preview"
          >
            <button
              type="button"
              className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white dark:hover:bg-white/10/30 active:bg-white/40 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setPreviewImage(null)
              }}
              aria-label="Close preview"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={2} />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}

const MemoizedChatComposer = memo(ChatComposerComponent)

export { MemoizedChatComposer as ChatComposer }
export type {
  ChatComposerAttachment,
  ChatComposerHelpers,
  ChatComposerHandle,
  ThinkingLevel,
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Folder01Icon,
  Image01Icon,
  Key01Icon,
  RefreshIcon,
  SparklesIcon,
  Upload01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PixelAvatar } from '@/components/agent-swarm/pixel-avatar'
import { toast } from '@/components/ui/toast'
import { fetchModels, type GatewayModelCatalogEntry } from '@/lib/gateway-api'
import { cn } from '@/lib/utils'

export const PRESET_AVATARS = [
  { id: 'default', label: 'Hermes Classic', src: '/claude-avatar.webp' },
  { id: 'architect-1', label: 'Architect 1 (Mikha Red)', src: '/avatars/profiles/architect-1.png' },
  { id: 'architect-2', label: 'Architect 2', src: '/avatars/profiles/architect-2.png' },
  { id: 'architect-3', label: 'Architect 3', src: '/avatars/profiles/architect-3.png' },
  { id: 'developer-1', label: 'Developer 1 (Headphones)', src: '/avatars/profiles/developer-1.png' },
  { id: 'developer-2', label: 'Developer 2 (Glasses)', src: '/avatars/profiles/developer-2.png' },
  { id: 'developer-3', label: 'Developer 3 (Beanie)', src: '/avatars/profiles/developer-3.png' },
  { id: 'tinker-1', label: 'Tinker 1 (Headlamp)', src: '/avatars/profiles/tinker-1.png' },
  { id: 'tinker-2', label: 'Tinker 2 (DevOps Amber)', src: '/avatars/profiles/tinker-2.png' },
  { id: 'tinker-3', label: 'Tinker 3 (Aviator Goggles)', src: '/avatars/profiles/tinker-3.png' },
  { id: 'curator-1', label: 'Curator 1 (Gold Chain)', src: '/avatars/profiles/curator-1.png' },
  { id: 'curator-2', label: 'Curator 2 (Headband Loupe)', src: '/avatars/profiles/curator-2.png' },
  { id: 'curator-3', label: 'Curator 3 (Tweed & Loupe)', src: '/avatars/profiles/curator-3.png' },
  { id: 'diplomat-1', label: 'Diplomat 1 (Executive Advisor)', src: '/avatars/profiles/diplomat-1.png' },
  { id: 'diplomat-2', label: 'Diplomat 2 (Rose-Gold Comm)', src: '/avatars/profiles/diplomat-2.png' },
  { id: 'diplomat-3', label: 'Diplomat 3 (Skyline Ear-Cuff)', src: '/avatars/profiles/diplomat-3.png' },
  { id: 'operator-1', label: 'Operator 1 (Telemetry Headset)', src: '/avatars/profiles/operator-1.png' },
  { id: 'operator-2', label: 'Operator 2 (Cyber Ops)', src: '/avatars/profiles/operator-2.png' },
  { id: 'operator-3', label: 'Operator 3 (Systems Commander)', src: '/avatars/profiles/operator-3.png' },
  { id: 'researcher-1', label: 'Researcher 1 (AR Prism Clip)', src: '/avatars/profiles/researcher-1.png' },
  { id: 'researcher-2', label: 'Researcher 2 (Studio Reference)', src: '/avatars/profiles/researcher-2.png' },
  { id: 'researcher-3', label: 'Researcher 3 (Bone-Conduction)', src: '/avatars/profiles/researcher-3.png' },
  { id: 'distiller-1', label: 'Distiller 1 (Broadcast Studio)', src: '/avatars/profiles/distiller-1.png' },
  { id: 'distiller-2', label: 'Distiller 2 (Incisive Mic)', src: '/avatars/profiles/distiller-2.png' },
  { id: 'distiller-3', label: 'Distiller 3 (Waveform Audio)', src: '/avatars/profiles/distiller-3.png' },
  { id: 'reviewer-1', label: 'Reviewer 1 (Design Auditor)', src: '/avatars/profiles/reviewer-1.png' },
  { id: 'publisher-1', label: 'Publisher 1 (Creative Stylus)', src: '/avatars/profiles/publisher-1.png' },
  { id: 'hermes', label: 'Hermes', src: '/avatars/hermes.png' },
  { id: 'athena', label: 'Athena', src: '/avatars/athena.png' },
  { id: 'apollo', label: 'Apollo', src: '/avatars/apollo.png' },
  { id: 'artemis', label: 'Artemis', src: '/avatars/artemis.png' },
  { id: 'chronos', label: 'Chronos', src: '/avatars/chronos.png' },
  { id: 'iris', label: 'Iris', src: '/avatars/iris.png' },
  { id: 'nike', label: 'Nike', src: '/avatars/nike.png' },
  { id: 'eros', label: 'Eros', src: '/avatars/eros.png' },
  { id: 'pan', label: 'Pan', src: '/avatars/pan.png' },
  { id: 'pixel', label: 'Pixel Bot', src: 'pixel' },
] as const

export async function resizeImageFileToDataUrl(
  file: File,
  maxSize = 256,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to load image'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        const minDim = Math.min(width, height)
        const sx = (width - minDim) / 2
        const sy = (height - minDim) / 2

        canvas.width = maxSize
        canvas.height = maxSize
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(reader.result as string)
          return
        }

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, maxSize, maxSize)
        try {
          const dataUrl = canvas.toDataURL('image/webp', 0.85)
          resolve(dataUrl)
        } catch {
          resolve(canvas.toDataURL('image/png'))
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

type AvailableModel = {
  id: string
  provider: string
  name: string
}

function normalizeModel(model: GatewayModelCatalogEntry): AvailableModel | null {
  if (typeof model === 'string') {
    return {
      id: model,
      provider: model.includes('/') ? (model.split('/')[0] ?? 'model') : 'model',
      name: model.split('/').pop() ?? model,
    }
  }

  const id = model.id ?? model.alias ?? model.model ?? ''
  if (!id) return null

  return {
    id,
    provider: model.provider ?? id.split('/')[0] ?? 'model',
    name:
      model.label ?? model.displayName ?? model.name ?? id.split('/').pop() ?? id,
  }
}

type ProfileDetail = {
  name: string
  path: string
  active: boolean
  config: Record<string, unknown>
  profileMeta?: Record<string, unknown>
  description: string
  soul: string
  systemPrompt: string
  memory: string
  userContext: string
  avatar?: string
  emoji?: string
  color?: string
  envPath?: string
  hasEnv: boolean
  sessionsDir?: string
  skillsDir?: string
}

export type UnifiedProfileSettingsModalProps = {
  profileName: string | null
  open: boolean
  onClose: () => void
  onSaved?: () => void
  onDeleted?: (name: string) => void
  onRenamed?: (oldName: string, newName: string) => void
}

export function UnifiedProfileSettingsModal({
  profileName,
  open,
  onClose,
  onSaved,
  onDeleted,
  onRenamed,
}: UnifiedProfileSettingsModalProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<
    'overview' | 'soul' | 'memory' | 'config'
  >('overview')
  const [memorySubTab, setMemorySubTab] = useState<'memory' | 'user'>('memory')

  // Form drafts
  const [nameDraft, setNameDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [providerDraft, setProviderDraft] = useState('')
  const [avatarDraft, setAvatarDraft] = useState('')
  const [emojiDraft, setEmojiDraft] = useState('🤖')
  const [soulDraft, setSoulDraft] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [userContextDraft, setUserContextDraft] = useState('')

  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [customUrlOpen, setCustomUrlOpen] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const detailQuery = useQuery({
    queryKey: ['profiles', 'read', profileName],
    queryFn: async () => {
      const res = await fetch(
        `/api/profiles/read?name=${encodeURIComponent(profileName || '')}`,
      )
      if (!res.ok) throw new Error('Failed to load profile')
      const data = (await res.json()) as { profile: ProfileDetail }
      return data.profile
    },
    enabled: Boolean(profileName && open),
  })

  const modelsQuery = useQuery({
    queryKey: ['operations', 'models'],
    queryFn: fetchModels,
    enabled: open,
  })

  const models = useMemo(
    () =>
      (modelsQuery.data?.models ?? [])
        .map(normalizeModel)
        .filter((entry): entry is AvailableModel => Boolean(entry)),
    [modelsQuery.data?.models],
  )

  useEffect(() => {
    if (profileName) {
      setNameDraft(profileName)
    }
  }, [profileName, open])

  useEffect(() => {
    if (detailQuery.data) {
      const p = detailQuery.data
      setNameDraft(p.name || profileName || '')
      setDescriptionDraft(p.description || '')
      setAvatarDraft(p.avatar || '')
      setEmojiDraft(p.emoji || '🤖')
      setSoulDraft(p.soul || p.systemPrompt || '')
      setMemoryDraft(p.memory || '')
      setUserContextDraft(p.userContext || '')

      let modelStr = ''
      let providerStr = ''
      const cfg =
        p && p.config && typeof p.config === 'object'
          ? (p.config as Record<string, unknown>)
          : {}
      if (typeof cfg.model === 'string') {
        modelStr = cfg.model
      } else if (cfg.model && typeof cfg.model === 'object') {
        const m = cfg.model as Record<string, unknown>
        if (typeof m.default === 'string') modelStr = m.default
        if (typeof m.provider === 'string') providerStr = m.provider
      }
      if (!providerStr && typeof cfg.provider === 'string') {
        providerStr = cfg.provider
      }
      setModelDraft(modelStr)
      setProviderDraft(providerStr)
    }
  }, [detailQuery.data])

  if (!open || !profileName) return null

  const isGeneral =
    profileName.toLowerCase() === 'general' ||
    profileName.toLowerCase() === 'default'
  const profile = detailQuery.data

  async function handleActivate() {
    if (!profileName) return
    try {
      const res = await fetch('/api/profiles/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to activate profile')
      }
      toast(`Activated profile ${profileName}`, { type: 'success' })
      await queryClient.invalidateQueries({ queryKey: ['profiles'] })
      await detailQuery.refetch()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Activation failed', {
        type: 'error',
      })
    }
  }

  async function handleRename() {
    if (!profileName || isGeneral) return
    const trimmed = (nameDraft || '').trim()
    if (!trimmed || trimmed === profileName) return

    setRenaming(true)
    try {
      const res = await fetch('/api/profiles/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: profileName, newName: trimmed }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to rename profile')
      }
      toast(`Renamed ${profileName} → ${trimmed}`, { type: 'success' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
      ])
      onRenamed?.(profileName, trimmed)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Rename failed', {
        type: 'error',
      })
    } finally {
      setRenaming(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 256)
      setAvatarDraft(dataUrl)
      toast('Profile picture updated (click Save Changes to persist)', {
        type: 'success',
      })
    } catch (err) {
      toast('Failed to process image file', { type: 'error' })
    }
  }

  async function handleSave() {
    if (!profileName) return
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {
        description: (descriptionDraft || '').trim() || null,
        avatar: (avatarDraft || '').trim() || null,
        emoji: (emojiDraft || '').trim() || null,
        soul: soulDraft || '',
        memory: memoryDraft || '',
        userContext: userContextDraft || '',
      }

      if (modelDraft) patch.model = modelDraft
      if (providerDraft) patch.provider = providerDraft

      const res = await fetch('/api/profiles/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, patch }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to save profile')
      }

      toast('Profile settings saved', { type: 'success' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
        detailQuery.refetch(),
      ])
      onSaved?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save profile', {
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!profileName || isGeneral) return
    if (!window.confirm(`Are you sure you want to delete profile "${profileName}"?`))
      return
    try {
      const res = await fetch('/api/profiles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to delete profile')
      }
      toast(`Deleted profile ${profileName}`, { type: 'success' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['operations'] }),
      ])
      onDeleted?.(profileName)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete profile', {
        type: 'error',
      })
    }
  }

  const selectedModelEntry = (() => {
    if (!modelDraft) return null
    return (
      models.find((m) => m.id === modelDraft) || {
        id: modelDraft,
        name: (modelDraft || '').split('/').pop() || modelDraft,
        provider: providerDraft || ((modelDraft || '').includes('/') ? (modelDraft || '').split('/')[0] : 'custom'),
      }
    )
  })()

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[min(820px,95vw)] max-w-none flex-col p-0">
        {/* Header */}
        <div className="shrink-0 border-b border-primary-200 px-6 pb-4 pt-5 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full border-2 border-primary-200 bg-primary-100 dark:border-neutral-700 dark:bg-neutral-800">
                {avatarDraft === 'pixel' ? (
                  <div className="flex size-full items-center justify-center">
                    <PixelAvatar size={36} color="#6366f1" />
                  </div>
                ) : (
                  <img
                    src={avatarDraft || '/claude-avatar.webp'}
                    alt={profileName}
                    className="size-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src = '/claude-avatar.webp'
                    }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="truncate text-base font-bold">
                    {profileName}
                  </DialogTitle>
                  {profile?.active ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} strokeWidth={2.5} />
                      Active Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-primary-500 dark:text-neutral-400">
                  Hermes Agent Profile Configuration
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!profile?.active && !isGeneral ? (
                <Button variant="outline" size="sm" onClick={() => void handleActivate()} className="gap-1.5 text-xs">
                  <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.8} />
                  Make Active
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void detailQuery.refetch()}
                disabled={detailQuery.isFetching}
                className="gap-1 text-xs"
              >
                <HugeiconsIcon icon={RefreshIcon} size={13} strokeWidth={1.8} className={cn(detailQuery.isFetching && 'animate-spin')} />
                Refresh
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-primary-200 text-primary-500 hover:bg-primary-100 hover:text-primary-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-4 flex gap-1 border-b border-primary-200/60 dark:border-neutral-800">
            {[
              { id: 'overview', label: 'Overview & Picture' },
              { id: 'soul', label: 'Soul (SOUL.md)' },
              { id: 'memory', label: 'Memory & Context' },
              { id: 'config', label: 'Config & Tools' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={cn(
                  'border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
                  activeTab === tab.id
                    ? 'border-accent-500 text-accent-600 dark:text-accent-400'
                    : 'border-transparent text-primary-500 hover:text-primary-800 dark:text-neutral-400 dark:hover:text-neutral-200',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {detailQuery.isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-primary-500">
              Loading profile details…
            </div>
          ) : detailQuery.error ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-red-500">
              {detailQuery.error instanceof Error ? detailQuery.error.message : 'Error loading profile'}
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & PICTURE */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Avatar Picker Section */}
                  <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-neutral-400">
                        <HugeiconsIcon icon={Image01Icon} size={15} strokeWidth={1.8} />
                        Profile Picture
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void handleFileUpload(e)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <HugeiconsIcon icon={Upload01Icon} size={13} strokeWidth={1.8} />
                          Upload Picture
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setCustomUrlOpen((v) => !v)}
                        >
                          Custom URL
                        </Button>
                      </div>
                    </div>

                    {customUrlOpen ? (
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          value={avatarDraft}
                          onChange={(e) => setAvatarDraft(e.target.value)}
                          placeholder="https://... or data:image/..."
                          className="h-8 text-xs font-mono"
                        />
                        {avatarDraft ? (
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAvatarDraft('')}>
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Presets Gallery */}
                    <div className="mt-3 grid grid-cols-4 sm:grid-cols-7 md:grid-cols-9 gap-2 max-h-56 overflow-y-auto p-1 scrollbar-thin rounded-xl border border-primary-200/50 dark:border-neutral-800 bg-primary-50/30 dark:bg-neutral-900/40">
                      {PRESET_AVATARS.map((preset) => {
                        const isSelected =
                          (preset.src === 'pixel' && avatarDraft === 'pixel') ||
                          (preset.src !== 'pixel' &&
                            (avatarDraft === preset.src ||
                              (!avatarDraft && preset.src === '/claude-avatar.webp')))

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setAvatarDraft(preset.src === '/claude-avatar.webp' ? '' : preset.src)}
                            title={preset.label}
                            className={cn(
                              'group relative flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all',
                              isSelected
                                ? 'bg-accent-500/15 ring-2 ring-accent-500'
                                : 'hover:bg-primary-100 dark:hover:bg-neutral-800',
                            )}
                          >
                            <div className="relative size-10 overflow-hidden rounded-full border border-primary-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                              {preset.src === 'pixel' ? (
                                <div className="flex size-full items-center justify-center">
                                  <PixelAvatar size={28} color="#6366f1" />
                                </div>
                              ) : (
                                <img
                                  src={preset.src}
                                  alt={preset.label}
                                  className="size-full object-cover"
                                />
                              )}
                            </div>
                            <span className="max-w-[48px] truncate text-[9px] font-medium text-primary-500 dark:text-neutral-400">
                              {preset.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Name, Emoji & Description */}
                  <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-neutral-400">
                        Profile Identifier
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={nameDraft || ''}
                          onChange={(e) => setNameDraft(e.target.value)}
                          disabled={isGeneral}
                          className="h-10 text-sm font-medium"
                        />
                        {!isGeneral && Boolean(nameDraft?.trim()) && nameDraft?.trim() !== profileName ? (
                          <Button size="sm" onClick={() => void handleRename()} disabled={renaming} className="h-10 text-xs">
                            {renaming ? 'Renaming…' : 'Rename'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-neutral-400">
                        Emoji
                      </label>
                      <Input
                        value={emojiDraft}
                        onChange={(e) => setEmojiDraft(e.target.value)}
                        className="h-10 text-center text-lg"
                        maxLength={4}
                      />
                    </div>
                  </div>

                  {/* Model Selector */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-neutral-400">
                      Default Inference Model
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setModelDropdownOpen((v) => !v)}
                        className="flex h-11 w-full items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      >
                        <span className="truncate">
                          {selectedModelEntry
                            ? `${selectedModelEntry.provider} / ${selectedModelEntry.name}`
                            : 'Default (auto)'}
                        </span>
                        <HugeiconsIcon icon={ArrowDown01Icon} size={16} className={cn('transition-transform', modelDropdownOpen && 'rotate-180')} />
                      </button>

                      {modelDropdownOpen ? (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 w-full overflow-y-auto rounded-xl border border-primary-200 bg-surface p-1 shadow-lg dark:border-neutral-700">
                          <button
                            type="button"
                            onClick={() => {
                              setModelDraft('')
                              setProviderDraft('')
                              setModelDropdownOpen(false)
                            }}
                            className={cn(
                              'flex w-full rounded-lg px-3 py-2 text-left text-xs',
                              !modelDraft ? 'bg-accent-500/10 font-bold text-accent-600' : 'hover:bg-primary-100 dark:hover:bg-neutral-800',
                            )}
                          >
                            Default (auto)
                          </button>
                          {models.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setModelDraft(m.id)
                                setProviderDraft(m.provider)
                                setModelDropdownOpen(false)
                              }}
                              className={cn(
                                'flex w-full rounded-lg px-3 py-2 text-left text-xs',
                                modelDraft === m.id ? 'bg-accent-500/10 font-bold text-accent-600' : 'hover:bg-primary-100 dark:hover:bg-neutral-800',
                              )}
                            >
                              {m.provider} / {m.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Description (profile.yaml) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-neutral-400">
                      Description (profile.yaml)
                    </label>
                    <textarea
                      value={descriptionDraft}
                      onChange={(e) => setDescriptionDraft(e.target.value)}
                      placeholder="Short summary of what this agent profile does..."
                      className="min-h-[80px] w-full rounded-xl border border-primary-200 bg-primary-100/50 p-3 text-xs text-primary-900 outline-none transition-colors focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  </div>

                  {/* Paths & Info Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="rounded-xl border border-primary-200/70 bg-primary-50/50 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/40">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400">Skills</span>
                      <p className="mt-0.5 font-semibold text-primary-800 dark:text-neutral-200">
                        {profile?.skillsDir ? 'Installed' : 'None'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-primary-200/70 bg-primary-50/50 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/40">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400">Environment</span>
                      <p className="mt-0.5 font-semibold text-primary-800 dark:text-neutral-200">
                        {profile?.hasEnv ? '.env Active' : 'No .env'}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-primary-200/70 bg-primary-50/50 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/40">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400">Storage Path</span>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-primary-700 dark:text-neutral-300">
                        {profile?.path}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SOUL (SOUL.md) */}
              {activeTab === 'soul' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-neutral-300">
                        Soul &amp; Instructions (SOUL.md)
                      </h3>
                      <p className="mt-0.5 text-xs text-primary-500 dark:text-neutral-400">
                        The core persona, identity, guardrails, and behavioral instructions stored in{' '}
                        <code className="rounded bg-primary-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                          {profile?.path}/SOUL.md
                        </code>
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={soulDraft}
                    onChange={(e) => setSoulDraft(e.target.value)}
                    placeholder="# Role & Identity\nYou are Tinker, a system engineer..."
                    className="min-h-[350px] w-full rounded-xl border border-primary-200 bg-primary-100/50 p-3 font-mono text-xs leading-relaxed text-primary-900 outline-none transition-colors focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>
              )}

              {/* TAB 3: MEMORY & USER CONTEXT */}
              {activeTab === 'memory' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-neutral-300">
                        Persistent Memory &amp; Context
                      </h3>
                      <p className="mt-0.5 text-xs text-primary-500 dark:text-neutral-400">
                        Curated facts and user context accumulated across sessions.
                      </p>
                    </div>
                    {/* Sub-tabs switch */}
                    <div className="flex rounded-lg border border-primary-200 bg-primary-100/70 p-0.5 dark:border-neutral-700 dark:bg-neutral-800">
                      <button
                        type="button"
                        onClick={() => setMemorySubTab('memory')}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          memorySubTab === 'memory'
                            ? 'bg-surface font-semibold text-ink shadow-xs'
                            : 'text-primary-500 hover:text-ink dark:text-neutral-400',
                        )}
                      >
                        MEMORY.md
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemorySubTab('user')}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          memorySubTab === 'user'
                            ? 'bg-surface font-semibold text-ink shadow-xs'
                            : 'text-primary-500 hover:text-ink dark:text-neutral-400',
                        )}
                      >
                        USER.md
                      </button>
                    </div>
                  </div>

                  {memorySubTab === 'memory' ? (
                    <div>
                      <p className="mb-2 text-[11px] text-primary-400 dark:text-neutral-500">
                        Stored in{' '}
                        <code className="font-mono">{profile?.path}/memories/MEMORY.md</code>
                      </p>
                      <textarea
                        value={memoryDraft}
                        onChange={(e) => setMemoryDraft(e.target.value)}
                        placeholder="Curated facts, hardware specs, notes..."
                        className="min-h-[320px] w-full rounded-xl border border-primary-200 bg-primary-100/50 p-3 font-mono text-xs leading-relaxed text-primary-900 outline-none transition-colors focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                  ) : (
                    <div>
                      <p className="mb-2 text-[11px] text-primary-400 dark:text-neutral-500">
                        Stored in{' '}
                        <code className="font-mono">{profile?.path}/memories/USER.md</code>
                      </p>
                      <textarea
                        value={userContextDraft}
                        onChange={(e) => setUserContextDraft(e.target.value)}
                        placeholder="Information about user preferences and personality..."
                        className="min-h-[320px] w-full rounded-xl border border-primary-200 bg-primary-100/50 p-3 font-mono text-xs leading-relaxed text-primary-900 outline-none transition-colors focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CONFIG & TOOLS */}
              {activeTab === 'config' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-primary-200 bg-primary-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400">
                      <HugeiconsIcon icon={Key01Icon} size={14} strokeWidth={1.8} />
                      Raw Config (config.yaml)
                    </div>
                    <pre className="max-h-60 overflow-auto rounded-lg border border-primary-200 bg-primary-100/70 p-3 font-mono text-xs leading-relaxed text-primary-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                      {JSON.stringify(profile?.config || {}, null, 2)}
                    </pre>
                  </div>

                  {!isGeneral && !profile?.active ? (
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                        Danger Zone
                      </h4>
                      <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
                        Permanently move this profile to trash.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete()}
                        className="mt-3 text-red-600 hover:bg-red-100 dark:hover:bg-red-950"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} className="mr-1.5" />
                        Delete Profile
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-primary-200 px-6 py-3 dark:border-neutral-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}

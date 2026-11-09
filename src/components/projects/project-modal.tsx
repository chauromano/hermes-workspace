'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Edit01Icon,
  Folder01Icon,
  PlusSignIcon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Loading03Icon,
  UserGroupIcon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import {
  useCreateProject,
  useUpdateProject,
  useCreateWorkspaceFolder,
  useProjects,
  useWorkspaceFolders,
  type Project,
} from '@/hooks/use-projects'

export type ProjectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  onCreated?: (project: Project) => void
  onUpdated?: (project: Project) => void
}

function autoSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64)
}

type SafetyMode = 'autonomous' | 'review' | 'approval'
const TASK_TAG_OPTIONS = ['code', 'research', 'docs', 'review', 'ops', 'design'] as const

function inferSafetyMode(w: { greenlightRequiredFor?: string[]; reviewRequired?: boolean }): SafetyMode {
  if ((w.greenlightRequiredFor?.length ?? 0) > 0) return 'approval'
  if (w.reviewRequired) return 'review'
  return 'autonomous'
}

function nextSafetyMode(current: SafetyMode): SafetyMode {
  if (current === 'autonomous') return 'review'
  if (current === 'review') return 'approval'
  return 'autonomous'
}

export function ProjectModal({
  open,
  onOpenChange,
  project,
  onCreated,
  onUpdated,
}: ProjectModalProps) {
  const isEdit = Boolean(project)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [primaryPath, setPrimaryPath] = useState('/workspace')
  const [browseSubpath, setBrowseSubpath] = useState('')
  const [setActive, setSetActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderCreateError, setFolderCreateError] = useState<string | null>(null)

  // Swarm Squad configuration state
  const [enableCustomSwarm, setEnableCustomSwarm] = useState(false)
  const [hadCustomSwarmInitially, setHadCustomSwarmInitially] = useState(false)
  const [loadingSwarm, setLoadingSwarm] = useState(false)
  const [projectWorkers, setProjectWorkers] = useState<
    Array<{
      id: string
      name: string
      role: string
      specialty: string
      model: string
      mission: string
      skills?: string[]
      enabled: boolean
      isCustom?: boolean
      safetyMode: SafetyMode
      preferredTaskTypes: string[]
    }>
  >([])
  const [isAddingSpecialist, setIsAddingSpecialist] = useState(false)
  const [specialistName, setSpecialistName] = useState('')
  const [specialistRole, setSpecialistRole] = useState('')
  const [specialistSpecialty, setSpecialistSpecialty] = useState('')
  const [specialistModel, setSpecialistModel] = useState('')
  const [specialistSafetyMode, setSpecialistSafetyMode] = useState<SafetyMode>('autonomous')
  const [specialistTags, setSpecialistTags] = useState<string[]>([])
  const [specialistError, setSpecialistError] = useState<string | null>(null)

  const { projects: existingProjects } = useProjects({ includeArchived: true })
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const createFolder = useCreateWorkspaceFolder()
  const { data: folderItems, isLoading: loadingFolders } = useWorkspaceFolders(browseSubpath)

  const isSlugTaken = useMemo(() => {
    if (isEdit || !slug) return false
    return existingProjects.some((p) => p.slug.toLowerCase() === slug.toLowerCase())
  }, [isEdit, slug, existingProjects])

  const resetForm = useCallback(() => {
    if (project) {
      setName(project.name || '')
      setSlug(project.slug || '')
      setSlugEdited(true)
      setDescription(project.description || '')
      const initialPath = project.primary_path || '/workspace'
      setPrimaryPath(initialPath)
      if (initialPath.startsWith('/workspace/') && initialPath.length > '/workspace/'.length) {
        setBrowseSubpath(initialPath.slice('/workspace/'.length))
      } else {
        setBrowseSubpath('')
      }
      setSetActive(Boolean(project.is_active))
    } else {
      setName('')
      setSlug('')
      setSlugEdited(false)
      setDescription('')
      setPrimaryPath('/workspace')
      setBrowseSubpath('')
      setSetActive(true)
    }
    setError(null)
    setIsSubmitting(false)
    setIsCreatingFolder(false)
    setNewFolderName('')
    setFolderCreateError(null)
    setIsAddingSpecialist(false)
    setSpecialistName('')
    setSpecialistRole('')
    setSpecialistSpecialty('')
    setSpecialistModel('')
    setSpecialistSafetyMode('autonomous')
    setSpecialistTags([])
    setSpecialistError(null)
  }, [project])

  const fetchSwarmRosterForModal = useCallback(async (projId?: string | null) => {
    setLoadingSwarm(true)
    try {
      const url = projId ? `/api/swarm-roster?projectId=${encodeURIComponent(projId)}` : '/api/swarm-roster'
      const res = await fetch(url)
      const data = await res.json()
      if (data.ok) {
        setHadCustomSwarmInitially(Boolean(data.hasProjectRoster))
        setEnableCustomSwarm(Boolean(data.hasProjectRoster))

        const activeRosterWorkers: Array<any> = Array.isArray(data.roster?.workers) ? data.roster.workers : []
        const globalWorkers: Array<any> = Array.isArray(data.globalRoster?.workers) ? data.globalRoster.workers : []
        const activeIds = new Set(activeRosterWorkers.map((w: any) => w.id))

        const combined: Array<any> = []
        // Add active/custom workers first
        for (const w of activeRosterWorkers) {
          if (w.id.toLowerCase() === 'orchestrator') continue
          combined.push({
            id: w.id,
            name: w.name || w.id,
            role: w.role || 'Worker',
            specialty: w.specialty || '',
            model: w.model || 'Worker',
            mission: w.mission || 'Awaiting orchestrator dispatch.',
            skills: w.skills || [],
            enabled: true,
            isCustom: !globalWorkers.some((gw: any) => gw.id === w.id),
            safetyMode: inferSafetyMode(w),
            preferredTaskTypes: Array.isArray(w.preferredTaskTypes) ? w.preferredTaskTypes : [],
          })
        }
        // Add remaining global workers as unselected if in project mode
        for (const gw of globalWorkers) {
          if (gw.id.toLowerCase() === 'orchestrator' || activeIds.has(gw.id)) continue
          combined.push({
            id: gw.id,
            name: gw.name || gw.id,
            role: gw.role || 'Worker',
            specialty: gw.specialty || '',
            model: gw.model || 'Worker',
            mission: gw.mission || 'Awaiting orchestrator dispatch.',
            skills: gw.skills || [],
            enabled: !data.hasProjectRoster,
            isCustom: false,
            safetyMode: inferSafetyMode(gw),
            preferredTaskTypes: Array.isArray(gw.preferredTaskTypes) ? gw.preferredTaskTypes : [],
          })
        }
        setProjectWorkers(combined)
      }
    } catch {
      // ignore
    } finally {
      setLoadingSwarm(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      resetForm()
      void fetchSwarmRosterForModal(project?.id)
    }
  }, [open, resetForm, fetchSwarmRosterForModal, project])

  const handleNameChange = (val: string) => {
    setName(val)
    if (!isEdit && !slugEdited) {
      setSlug(autoSlug(val))
    }
  }

  const handleDrillFolder = (folderName: string) => {
    hapticTap()
    const nextSub = browseSubpath ? `${browseSubpath}/${folderName}` : folderName
    setBrowseSubpath(nextSub)
    setPrimaryPath(`/workspace/${nextSub}`)
  }

  const handleNavigateUp = () => {
    hapticTap()
    if (!browseSubpath) return
    const parts = browseSubpath.split('/')
    parts.pop()
    const nextSub = parts.join('/')
    setBrowseSubpath(nextSub)
    setPrimaryPath(nextSub ? `/workspace/${nextSub}` : '/workspace')
  }

  const handleBreadcrumbClick = (index: number) => {
    hapticTap()
    if (index === -1) {
      setBrowseSubpath('')
      setPrimaryPath('/workspace')
      return
    }
    const parts = browseSubpath.split('/')
    const nextSub = parts.slice(0, index + 1).join('/')
    setBrowseSubpath(nextSub)
    setPrimaryPath(`/workspace/${nextSub}`)
  }

  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setFolderCreateError(null)

    const trimmed = newFolderName.trim()
    if (!trimmed) {
      setFolderCreateError('Folder name is required')
      return
    }

    try {
      hapticTap()
      const created = await createFolder.mutateAsync({
        subpath: browseSubpath,
        name: trimmed,
      })
      toast.success(`Created folder "${created.name}"`)
      setPrimaryPath(created.path)
      setIsCreatingFolder(false)
      setNewFolderName('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setFolderCreateError(msg)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || createProject.isPending || updateProject.isPending) return
    setError(null)

    if (!name.trim()) {
      setError('Please provide a project name')
      return
    }
    if (!primaryPath.trim()) {
      setError('Please provide a primary workspace folder')
      return
    }

    try {
      setIsSubmitting(true)
      hapticTap()

      let targetProjectId: string | null = null
      if (isEdit && project) {
        const updated = await updateProject.mutateAsync({
          id: project.id,
          name: name.trim(),
          description: description.trim() || null,
          primary_path: primaryPath.trim(),
          set_active: setActive,
        })
        targetProjectId = updated.id

        try {
          toast.success(`Project "${updated.name}" updated successfully`)
        } catch {
          // ignore notification error
        }
        onUpdated?.(updated)
      } else {
        const created = await createProject.mutateAsync({
          name: name.trim(),
          slug: slug.trim() || undefined,
          slug_customized: slugEdited,
          primary_path: primaryPath.trim(),
          description: description.trim() || undefined,
          set_active: setActive,
        })
        targetProjectId = created.id

        try {
          toast.success(`Project "${created.name}" created successfully`)
        } catch {
          // ignore notification error
        }
        onCreated?.(created)
      }

      // Sync Swarm Squad settings if project was saved
      if (targetProjectId) {
        try {
          if (enableCustomSwarm) {
            const enabledWorkers = projectWorkers.filter((w) => w.enabled).map((w) => ({
              id: w.id,
              name: w.name,
              role: w.role,
              specialty: w.specialty,
              model: w.model,
              mission: w.mission,
              skills: w.skills ?? [],
              preferredTaskTypes: w.preferredTaskTypes ?? [],
              reviewRequired: w.safetyMode !== 'autonomous',
              greenlightRequiredFor: w.safetyMode === 'approval' ? ['destructive', 'merge', 'publish'] : [],
            }))
            await fetch('/api/swarm-roster', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'set-roster',
                projectId: targetProjectId,
                workers: enabledWorkers,
              }),
            })
          } else if (isEdit && hadCustomSwarmInitially && !enableCustomSwarm) {
            await fetch('/api/swarm-roster', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'disable-project',
                projectId: targetProjectId,
              }),
            })
          }
        } catch {
          // squad sync errors shouldn't prevent closing modal
        }
      }

      onOpenChange(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const breadcrumbs = useMemo(() => {
    return browseSubpath ? browseSubpath.split('/') : []
  }, [browseSubpath])

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'w-[min(540px,94vw)] max-h-[88vh] rounded-2xl flex flex-col p-0 overflow-hidden',
          'border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-2xl',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-accent-500/15 text-accent-600">
              <HugeiconsIcon icon={isEdit ? Edit01Icon : Folder01Icon} size={18} strokeWidth={2} />
            </span>
            <div>
              <DialogTitle className="text-base font-semibold leading-tight text-[var(--theme-text)]">
                {isEdit ? 'Edit Project' : 'Create Project'}
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--theme-muted)]">
                {isEdit
                  ? 'Update project details, folder attachment, or active context'
                  : 'Anchor workspaces, tasks, and agents to a codebase or folder'}
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 text-[var(--theme-muted)] hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)] transition-colors"
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Name & Slug */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--theme-text)] mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Express Architecture Hub"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] placeholder-[var(--theme-muted)] outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[var(--theme-muted)]">
                  {isEdit ? 'Project Identifier (Slug)' : 'Project Slug (ID)'}
                </label>
                {isEdit ? (
                  <span className="text-[10px] text-[var(--theme-muted)] font-mono">
                    Permanent ID (read-only)
                  </span>
                ) : isSlugTaken ? (
                  <span className="text-[10px] text-amber-500 font-medium">
                    ID in use (auto-number will be added if unchanged)
                  </span>
                ) : null}
              </div>
              {isEdit ? (
                <input
                  type="text"
                  disabled
                  value={slug}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/60 px-3 py-1.5 text-xs font-mono text-[var(--theme-muted)] cursor-not-allowed select-all"
                />
              ) : (
                <input
                  type="text"
                  placeholder="express-architecture-hub"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value)
                    setSlugEdited(true)
                  }}
                  className={cn(
                    'w-full rounded-xl border bg-[var(--theme-bg)] px-3 py-1.5 text-xs font-mono text-[var(--theme-text)] placeholder-[var(--theme-muted)] outline-none transition-all',
                    isSlugTaken
                      ? 'border-amber-500/50 focus:border-amber-500'
                      : 'border-[var(--theme-border)] focus:border-accent-500',
                  )}
                />
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[var(--theme-text)] mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Brief purpose, architecture scope, or milestones..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-xs text-[var(--theme-text)] placeholder-[var(--theme-muted)] outline-none focus:border-accent-500 transition-all resize-none"
            />
          </div>

          {/* Primary Workspace Folder Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--theme-text)]">
              Primary Workspace Folder <span className="text-red-500">*</span>
            </label>

            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1 overflow-x-auto py-1 text-xs text-[var(--theme-muted)] scrollbar-none">
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(-1)}
                className={cn(
                  'rounded px-1.5 py-0.5 hover:bg-[var(--theme-hover)] transition-colors',
                  browseSubpath === '' ? 'font-semibold text-accent-600 dark:text-accent-400' : '',
                )}
              >
                workspace
              </button>
              {breadcrumbs.map((b, idx) => (
                <span key={idx} className="flex items-center gap-1 shrink-0">
                  <span className="opacity-40">/</span>
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(idx)}
                    className={cn(
                      'rounded px-1.5 py-0.5 hover:bg-[var(--theme-hover)] transition-colors',
                      idx === breadcrumbs.length - 1 ? 'font-semibold text-accent-600 dark:text-accent-400' : '',
                    )}
                  >
                    {b}
                  </button>
                </span>
              ))}
            </div>

            {/* Folder Browser Card */}
            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2 space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-medium text-[var(--theme-muted)]">
                  Browse folders under /workspace:
                </span>
                <div className="flex items-center gap-2">
                  {browseSubpath && (
                    <button
                      type="button"
                      onClick={handleNavigateUp}
                      className="flex items-center gap-1 text-[11px] text-accent-600 hover:underline"
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} size={12} />
                      <span>Back up</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      hapticTap()
                      setIsCreatingFolder((v) => !v)
                      setFolderCreateError(null)
                    }}
                    className={cn(
                      'flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-colors',
                      isCreatingFolder
                        ? 'bg-accent-500/20 text-accent-600'
                        : 'text-accent-600 hover:bg-accent-500/10',
                    )}
                  >
                    <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2.2} />
                    <span>New Folder</span>
                  </button>
                </div>
              </div>

              {/* Inline Folder Creation */}
              {isCreatingFolder && (
                <div className="rounded-lg border border-accent-500/30 bg-accent-500/5 p-2 space-y-1.5 transition-all">
                  <div className="flex items-center justify-between text-[11px] font-medium text-[var(--theme-text)]">
                    <span>Create folder in {browseSubpath ? `/${browseSubpath}` : '/workspace'}:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingFolder(false)
                        setFolderCreateError(null)
                      }}
                      className="text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Folder name (e.g. my-project)"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCreateFolder()
                        } else if (e.key === 'Escape') {
                          setIsCreatingFolder(false)
                          setFolderCreateError(null)
                        }
                      }}
                      className="flex-1 rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-xs text-[var(--theme-text)] placeholder-[var(--theme-muted)] outline-none focus:border-accent-500 font-mono transition-all"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      disabled={createFolder.isPending || !newFolderName.trim()}
                      onClick={() => handleCreateFolder()}
                      className="bg-accent-600 hover:bg-accent-700 text-white text-[11px] px-2.5 py-1 h-auto"
                    >
                      {createFolder.isPending ? (
                        <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                      ) : (
                        'Create'
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsCreatingFolder(false)
                        setFolderCreateError(null)
                      }}
                      className="text-[11px] px-2 py-1 h-auto"
                    >
                      Cancel
                    </Button>
                  </div>

                  {folderCreateError && (
                    <div className="text-[10px] text-red-500 font-medium">
                      {folderCreateError}
                    </div>
                  )}
                </div>
              )}

              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                {loadingFolders ? (
                  <div className="flex items-center justify-center py-4 text-xs text-[var(--theme-muted)]">
                    <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin mr-1.5" />
                    Loading folders...
                  </div>
                ) : !folderItems || folderItems.length === 0 ? (
                  <div className="py-3 text-center text-xs text-[var(--theme-muted)] space-y-1">
                    <div>No subfolders found in this directory</div>
                    {!isCreatingFolder && (
                      <button
                        type="button"
                        onClick={() => {
                          hapticTap()
                          setIsCreatingFolder(true)
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-accent-600 hover:underline font-medium"
                      >
                        <HugeiconsIcon icon={PlusSignIcon} size={12} />
                        <span>Create a folder here</span>
                      </button>
                    )}
                  </div>
                ) : (
                  folderItems.map((item) => {
                    const isSelected = primaryPath === item.path
                    return (
                      <div
                        key={item.path}
                        className={cn(
                          'group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                          isSelected
                            ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300 font-medium'
                            : 'hover:bg-[var(--theme-hover)] text-[var(--theme-text)]',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleDrillFolder(item.name)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        >
                          <HugeiconsIcon
                            icon={Folder01Icon}
                            size={14}
                            className={isSelected ? 'text-accent-500' : 'text-[var(--theme-muted)]'}
                          />
                          <span className="truncate">{item.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            hapticTap()
                            setPrimaryPath(item.path)
                          }}
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded transition-all',
                            isSelected
                              ? 'bg-accent-500 text-white font-medium'
                              : 'opacity-0 group-hover:opacity-100 hover:bg-accent-500/20 text-accent-600',
                          )}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Direct Path Input */}
              <div className="pt-1.5 border-t border-[var(--theme-border)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="block text-[10px] text-[var(--theme-muted)]">
                    Selected Path:
                  </span>
                  <span className="text-[9px] text-[var(--theme-muted)] font-mono">
                    (will be created if it does not exist)
                  </span>
                </div>
                <input
                  type="text"
                  value={primaryPath}
                  onChange={(e) => setPrimaryPath(e.target.value)}
                  className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1.5 text-xs font-mono text-[var(--theme-text)] outline-none focus:border-accent-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Swarm Squad Section */}
          <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="enable-custom-swarm"
                  checked={enableCustomSwarm}
                  onChange={(e) => setEnableCustomSwarm(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-[var(--theme-border)] text-accent-600 focus:ring-accent-500 accent-accent-600 cursor-pointer"
                />
                <div>
                  <label htmlFor="enable-custom-swarm" className="text-xs font-medium text-[var(--theme-text)] cursor-pointer select-none flex items-center gap-1.5">
                    <HugeiconsIcon icon={UserGroupIcon} size={14} className="text-accent-600" />
                    <span>Enable Custom Project Swarm (swarm.yaml)</span>
                  </label>
                  <p className="text-[11px] text-[var(--theme-muted)] leading-tight mt-0.5">
                    Configure a dedicated agent squad for this project's Swarm and Missions. When unchecked, inherits the Global Swarm.
                  </p>
                </div>
              </div>
            </div>

            {enableCustomSwarm && (
              <div className="pt-2 border-t border-[var(--theme-border)] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[var(--theme-muted)]">
                    {projectWorkers.filter((w) => w.enabled).length} of {projectWorkers.length} agents enabled
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap()
                        setProjectWorkers((prev) => prev.map((w) => ({ ...w, enabled: true })))
                      }}
                      className="text-accent-600 hover:underline"
                    >
                      Enable all
                    </button>
                    <span className="text-[var(--theme-border)]">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap()
                        setIsAddingSpecialist((v) => !v)
                        setSpecialistError(null)
                      }}
                      className="text-accent-600 hover:underline font-medium flex items-center gap-1"
                    >
                      <HugeiconsIcon icon={PlusSignIcon} size={11} strokeWidth={2.2} />
                      <span>Add Specialist</span>
                    </button>
                  </div>
                </div>

                {/* Inline Add Specialist Form */}
                {isAddingSpecialist && (
                  <div className="rounded-lg border border-accent-500/30 bg-accent-500/5 p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-medium text-[var(--theme-text)]">
                      <span>Add specialist to project squad:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingSpecialist(false)
                          setSpecialistError(null)
                        }}
                        className="text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <input
                          type="text"
                          placeholder="Name (e.g. Vault Indexer)"
                          value={specialistName}
                          onChange={(e) => setSpecialistName(e.target.value)}
                          className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-xs text-[var(--theme-text)] outline-none focus:border-accent-500"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Role (e.g. Knowledge Steward)"
                          value={specialistRole}
                          onChange={(e) => setSpecialistRole(e.target.value)}
                          className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-xs text-[var(--theme-text)] outline-none focus:border-accent-500"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Specialty (e.g. Obsidian wikilinks)"
                          value={specialistSpecialty}
                          onChange={(e) => setSpecialistSpecialty(e.target.value)}
                          className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-xs text-[var(--theme-text)] outline-none focus:border-accent-500"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Model (e.g. GPT-5.5, qwen2.5)"
                          value={specialistModel}
                          onChange={(e) => setSpecialistModel(e.target.value)}
                          className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-xs text-[var(--theme-text)] outline-none focus:border-accent-500"
                        />
                      </div>
                    </div>

                    {/* Safety Mode Selector */}
                    <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                      <span className="text-[var(--theme-muted)] text-[10px]">Safety:</span>
                      {(['autonomous', 'review', 'approval'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSpecialistSafetyMode(mode)}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors border',
                            specialistSafetyMode === mode
                              ? mode === 'autonomous'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                                : mode === 'review'
                                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
                                  : 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40'
                              : 'bg-[var(--theme-bg)] text-[var(--theme-muted)] border-[var(--theme-border)] opacity-60 hover:opacity-100',
                          )}
                        >
                          {mode === 'autonomous' ? '🟢 Auto' : mode === 'review' ? '🟡 Review' : '🔴 Approval'}
                        </button>
                      ))}
                    </div>

                    {/* Task Affinity Tags */}
                    <div className="flex flex-wrap items-center gap-1 text-[10px] pt-0.5">
                      <span className="text-[var(--theme-muted)]">Affinity:</span>
                      {TASK_TAG_OPTIONS.map((tag) => {
                        const isSelected = specialistTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSpecialistTags((prev) =>
                                isSelected ? prev.filter((t) => t !== tag) : [...prev, tag],
                              )
                            }}
                            className={cn(
                              'px-1.5 py-0.5 rounded transition-colors',
                              isSelected
                                ? 'bg-accent-500/20 text-accent-700 dark:text-accent-300 font-medium'
                                : 'bg-[var(--theme-bg)] text-[var(--theme-muted)] hover:text-[var(--theme-text)] border border-[var(--theme-border)]',
                            )}
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </div>

                    {specialistError && (
                      <div className="text-[10px] text-red-500 font-medium">
                        {specialistError}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() => {
                          if (!specialistName.trim()) {
                            setSpecialistError('Specialist name is required')
                            return
                          }
                          const newId = autoSlug(specialistName)
                          if (!newId || projectWorkers.some((w) => w.id === newId)) {
                            setSpecialistError('Name generates duplicate or invalid worker ID')
                            return
                          }
                          setProjectWorkers((prev) => [
                            ...prev,
                            {
                              id: newId,
                              name: specialistName.trim(),
                              role: specialistRole.trim() || 'Specialist',
                              specialty: specialistSpecialty.trim(),
                              model: specialistModel.trim() || 'Worker',
                              mission: `Specialist for ${specialistName.trim()}`,
                              enabled: true,
                              isCustom: true,
                              safetyMode: specialistSafetyMode,
                              preferredTaskTypes: specialistTags,
                            },
                          ])
                          setIsAddingSpecialist(false)
                          setSpecialistName('')
                          setSpecialistRole('')
                          setSpecialistSpecialty('')
                          setSpecialistModel('')
                          setSpecialistSafetyMode('autonomous')
                          setSpecialistTags([])
                          setSpecialistError(null)
                        }}
                        className="bg-accent-600 hover:bg-accent-700 text-white text-[11px] px-2.5 py-1 h-auto"
                      >
                        Add Specialist
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsAddingSpecialist(false)
                          setSpecialistError(null)
                        }}
                        className="text-[11px] px-2 py-1 h-auto"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Worker List */}
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                  {loadingSwarm ? (
                    <div className="py-3 text-center text-xs text-[var(--theme-muted)]">
                      <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin inline mr-1" />
                      Loading squad roster...
                    </div>
                  ) : projectWorkers.length === 0 ? (
                    <div className="py-2 text-center text-xs text-[var(--theme-muted)]">
                      No workers in roster
                    </div>
                  ) : (
                    projectWorkers.map((worker) => (
                      <div
                        key={worker.id}
                        className={cn(
                          'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors border',
                          worker.enabled
                            ? 'bg-[var(--theme-card)] border-[var(--theme-border)] text-[var(--theme-text)]'
                            : 'bg-transparent border-transparent opacity-60 hover:opacity-100 text-[var(--theme-muted)]',
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={worker.enabled}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setProjectWorkers((prev) =>
                                prev.map((w) => (w.id === worker.id ? { ...w, enabled: checked } : w)),
                              )
                            }}
                            className="size-3.5 rounded border-[var(--theme-border)] text-accent-600 accent-accent-600 cursor-pointer"
                          />
                          <div className="min-w-0 truncate">
                            <span className="font-medium text-[var(--theme-text)] mr-1.5">
                              {worker.name}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--theme-muted)] mr-2">
                              ({worker.id})
                            </span>
                            <span className="text-[11px] text-[var(--theme-muted-2)]">
                              — {worker.role} {worker.specialty ? `(${worker.specialty})` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {worker.preferredTaskTypes && worker.preferredTaskTypes.length > 0 && (
                            <div className="hidden sm:flex items-center gap-1">
                              {worker.preferredTaskTypes.slice(0, 2).map((tag) => (
                                <span key={tag} className="text-[9px] px-1 py-0.2 rounded bg-[var(--theme-bg)] text-[var(--theme-muted)] border border-[var(--theme-border)]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            title={`Safety Mode: ${worker.safetyMode} (click to cycle: Auto -> Review -> Approval)`}
                            onClick={() => {
                              hapticTap()
                              setProjectWorkers((prev) =>
                                prev.map((w) =>
                                  w.id === worker.id ? { ...w, safetyMode: nextSafetyMode(w.safetyMode) } : w,
                                ),
                              )
                            }}
                            className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors',
                              worker.safetyMode === 'autonomous'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                : worker.safetyMode === 'review'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                  : 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
                            )}
                          >
                            {worker.safetyMode === 'autonomous' ? '🟢 Auto' : worker.safetyMode === 'review' ? '🟡 Review' : '🔴 Approval'}
                          </button>

                          {worker.isCustom && (
                            <button
                              type="button"
                              onClick={() => {
                                hapticTap()
                                setProjectWorkers((prev) => prev.filter((w) => w.id !== worker.id))
                              }}
                              className="p-1 text-[var(--theme-muted)] hover:text-red-500 rounded transition-colors"
                              title="Remove specialist"
                            >
                              <HugeiconsIcon icon={Delete02Icon} size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Set as Active */}
          <div className="flex items-center gap-2.5 pt-1">
            <input
              type="checkbox"
              id="set-active-checkbox"
              checked={setActive}
              onChange={(e) => setSetActive(e.target.checked)}
              className="size-4 rounded border-[var(--theme-border)] text-accent-600 focus:ring-accent-500 accent-accent-600 cursor-pointer"
            />
            <label htmlFor="set-active-checkbox" className="text-xs text-[var(--theme-text)] cursor-pointer select-none">
              Make this the active project immediately
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--theme-border)]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createProject.isPending || updateProject.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting || createProject.isPending || updateProject.isPending}
              className="min-w-28 bg-accent-600 hover:bg-accent-700 text-white font-medium"
            >
              {isSubmitting || createProject.isPending || updateProject.isPending ? (
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
                  {isEdit ? 'Saving...' : 'Creating...'}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={isEdit ? CheckmarkCircle01Icon : PlusSignIcon}
                    size={14}
                    strokeWidth={2.2}
                  />
                  {isEdit ? 'Save Changes' : 'Create Project'}
                </span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

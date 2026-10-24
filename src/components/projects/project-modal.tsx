'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Folder01Icon,
  PlusSignIcon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Loading03Icon,
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
  useWorkspaceFolders,
  type Project,
} from '@/hooks/use-projects'

export type ProjectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (project: Project) => void
}

function autoSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64)
}

export function ProjectModal({ open, onOpenChange, onCreated }: ProjectModalProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [primaryPath, setPrimaryPath] = useState('/workspace')
  const [browseSubpath, setBrowseSubpath] = useState('')
  const [setActive, setSetActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const createProject = useCreateProject()
  const { data: folderItems, isLoading: loadingFolders } = useWorkspaceFolders(browseSubpath)

  const resetForm = useCallback(() => {
    setName('')
    setSlug('')
    setSlugEdited(false)
    setDescription('')
    setPrimaryPath('/workspace')
    setBrowseSubpath('')
    setSetActive(true)
    setError(null)
  }, [])

  useEffect(() => {
    if (open) {
      resetForm()
    }
  }, [open, resetForm])

  const handleNameChange = (val: string) => {
    setName(val)
    if (!slugEdited) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      hapticTap()
      const project = await createProject.mutateAsync({
        name: name.trim(),
        slug: slug.trim() || undefined,
        primary_path: primaryPath.trim(),
        description: description.trim() || undefined,
        set_active: setActive,
      })

      toast.success(`Project "${project.name}" created successfully`)
      onCreated?.(project)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
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
                <HugeiconsIcon icon={Folder01Icon} size={18} strokeWidth={2} />
              </span>
              <div>
                <DialogTitle className="text-base font-semibold leading-tight text-[var(--theme-text)]">
                  Create Project
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--theme-muted)]">
                  Anchor workspaces, tasks, and agents to a codebase or folder
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
                <label className="block text-xs font-medium text-[var(--theme-muted)] mb-1">
                  Project Slug (ID)
                </label>
                <input
                  type="text"
                  placeholder="express-architecture-hub"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value)
                    setSlugEdited(true)
                  }}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-xs font-mono text-[var(--theme-text)] placeholder-[var(--theme-muted)] outline-none focus:border-accent-500 transition-all"
                />
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
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                  {loadingFolders ? (
                    <div className="flex items-center justify-center py-4 text-xs text-[var(--theme-muted)]">
                      <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin mr-1.5" />
                      Loading folders...
                    </div>
                  ) : !folderItems || folderItems.length === 0 ? (
                    <div className="py-3 text-center text-xs text-[var(--theme-muted)]">
                      No subfolders found in this directory
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
                  <span className="block text-[10px] text-[var(--theme-muted)] mb-1">
                    Selected Path:
                  </span>
                  <input
                    type="text"
                    value={primaryPath}
                    onChange={(e) => setPrimaryPath(e.target.value)}
                    className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1.5 text-xs font-mono text-[var(--theme-text)] outline-none focus:border-accent-500 transition-all"
                  />
                </div>
              </div>
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
                disabled={createProject.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={createProject.isPending}
                className="min-w-28 bg-accent-600 hover:bg-accent-700 text-white font-medium"
              >
                {createProject.isPending ? (
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2.2} />
                    Create Project
                  </span>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
    </DialogRoot>
  )
}

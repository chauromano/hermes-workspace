'use client'

import { useState, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  Folder01Icon,
  PlusSignIcon,
  FolderOpenIcon,
} from '@hugeicons/core-free-icons'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import {
  useProjects,
  useSetActiveProject,
  useSetSessionProject,
} from '@/hooks/use-projects'
import { ProjectModal } from './project-modal'

type ProjectSessionChipProps = {
  sessionKey?: string
  projectId?: string | null
  projectName?: string | null
  className?: string
  compact?: boolean
  /** `composer` renders a borderless pill that matches the chat composer toolbar. */
  variant?: 'default' | 'composer'
  /** Hide the text label (icon-only trigger) — used when the composer is narrow. */
  iconOnly?: boolean
  /** Optional class name applied to the label text and arrow (e.g. for responsive hiding). */
  labelClassName?: string
}

/**
 * Shared project-selection logic for a chat session. Used by the composer
 * project pill (desktop) and the mobile chat-settings sheet.
 */
export function useSessionProjectSelection({
  sessionKey,
  projectId,
  projectName,
}: Pick<ProjectSessionChipProps, 'sessionKey' | 'projectId' | 'projectName'>) {
  const [overrideTarget, setOverrideTarget] = useState<{ id: string | null; name: string } | null>(null)
  const { projects, activeId } = useProjects()
  const setSessionProjectMutation = useSetSessionProject()
  const setActiveProjectMutation = useSetActiveProject()

  useEffect(() => {
    setOverrideTarget(null)
  }, [projectId, sessionKey])

  // Find assigned project or match against active project for new sessions
  const effectiveProjectId = overrideTarget ? overrideTarget.id : (projectId !== undefined ? projectId : activeId)
  const currentProject = projects.find((p) => p.id === effectiveProjectId)
  const displayName = overrideTarget?.name ?? currentProject?.name ?? projectName ?? 'None'
  const isPersonalSandbox = !effectiveProjectId

  const handleSelect = (targetId: string | null) => {
    hapticTap()
    const targetName = targetId ? (projects.find((p) => p.id === targetId)?.name ?? 'Project') : 'None'
    setOverrideTarget({ id: targetId, name: targetName })

    if (!sessionKey || sessionKey === 'new') {
      setActiveProjectMutation.mutate(targetId, {
        onSuccess: () => {
          toast.success(`Active project set to: ${targetName}`)
        },
        onError: (err: unknown) => {
          setOverrideTarget(null)
          toast.error(err instanceof Error ? err.message : 'Failed to switch project')
        },
      })
      return
    }

    setSessionProjectMutation.mutate(
      {
        sessionKey,
        projectId: targetId,
      },
      {
        onSuccess: () => {
          toast.success(`Session moved to: ${targetName}`)
        },
        onError: (err: unknown) => {
          setOverrideTarget(null)
          toast.error(err instanceof Error ? err.message : 'Failed to change project')
        },
      },
    )
  }

  return {
    projects,
    effectiveProjectId,
    currentProject,
    displayName,
    isPersonalSandbox,
    handleSelect,
  }
}

export function ProjectSessionChip({
  sessionKey,
  projectId,
  projectName,
  className,
  compact = false,
  variant = 'default',
  iconOnly = false,
  labelClassName,
}: ProjectSessionChipProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const {
    projects,
    effectiveProjectId,
    displayName,
    isPersonalSandbox,
    handleSelect,
  } = useSessionProjectSelection({ sessionKey, projectId, projectName })
  const isComposer = variant === 'composer'

  return (
    <>
      <MenuRoot>
        <MenuTrigger
          className={cn(
            'inline-flex items-center gap-1 rounded-full transition-all cursor-pointer select-none font-medium text-xs',
            isComposer
              ? 'h-8 gap-1.5 px-2.5 max-w-[11rem] bg-transparent text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-800/60 aria-expanded:bg-primary-100 dark:aria-expanded:bg-primary-800/60'
              : [
                  'border border-[var(--theme-border)] bg-[var(--theme-card)] hover:bg-[var(--theme-hover)] text-[var(--theme-text)]',
                  compact ? 'px-2 py-0.5 text-[11px] max-w-[120px]' : 'px-2.5 py-1 max-w-[190px]',
                ],
            iconOnly && 'w-8 justify-center px-0',
            className,
          )}
          title={`Project: ${displayName} (click to change)`}
          aria-label={`Project: ${displayName}`}
        >
          <HugeiconsIcon
            icon={isPersonalSandbox ? Folder01Icon : FolderOpenIcon}
            size={isComposer ? 15 : compact ? 12 : 13}
            strokeWidth={isComposer ? 1.6 : undefined}
            className={cn(
              'shrink-0',
              isPersonalSandbox ? 'text-[var(--theme-muted)]' : 'text-accent-500',
            )}
          />
          {iconOnly ? null : (
            <>
              <span className={cn('truncate', labelClassName)}>{displayName}</span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={compact ? 10 : 11}
                className={cn('shrink-0 opacity-40 ml-0.5', labelClassName)}
              />
            </>
          )}
        </MenuTrigger>

        <MenuContent
          align="start"
          side={isComposer ? 'top' : 'bottom'}
          className="z-50 min-w-[240px] max-w-[300px] rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-1.5 shadow-xl text-xs space-y-0.5"
        >
          <div className="px-2.5 py-1.5 border-b border-[var(--theme-border)] mb-1">
            <span className="block text-[10px] font-semibold text-[var(--theme-muted)] uppercase tracking-wider">
              Session Project
            </span>
            <p className="text-[11px] text-[var(--theme-muted)] mt-0.5 leading-tight">
              Changing project updates this session&apos;s working directory.
            </p>
          </div>

          {/* No Project / None Option */}
          <MenuItem
            onClick={() => handleSelect(null)}
            className={cn(
              'flex items-center justify-between w-full rounded-lg px-2.5 py-1.5 text-xs text-[var(--theme-text)] hover:bg-[var(--theme-hover)] transition-colors cursor-pointer',
              isPersonalSandbox && 'bg-accent-500/10 text-accent-600 dark:text-accent-400 font-semibold',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <HugeiconsIcon icon={Folder01Icon} size={14} className="shrink-0 text-[var(--theme-muted)]" />
              <div className="min-w-0 text-left">
                <span className="truncate block">None</span>
                <span className="text-[10px] text-[var(--theme-muted)] block">No project</span>
              </div>
            </div>
            {isPersonalSandbox && (
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={13} className="text-accent-600 shrink-0" />
            )}
          </MenuItem>

          {/* Project List */}
          {projects.length > 0 && (
            <div className="max-h-48 overflow-y-auto scrollbar-thin py-0.5 space-y-0.5 border-t border-[var(--theme-border)] mt-1 pt-1">
              {projects.map((proj) => {
                const isSelected = effectiveProjectId === proj.id
                return (
                  <MenuItem
                    key={proj.id}
                    onClick={() => handleSelect(proj.id)}
                    className={cn(
                      'flex items-center justify-between w-full rounded-lg px-2.5 py-1.5 text-xs text-[var(--theme-text)] hover:bg-[var(--theme-hover)] transition-colors cursor-pointer',
                      isSelected && 'bg-accent-500/10 text-accent-600 dark:text-accent-400 font-semibold',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <HugeiconsIcon
                        icon={isSelected ? FolderOpenIcon : Folder01Icon}
                        size={14}
                        className={cn('shrink-0', isSelected ? 'text-accent-600' : 'text-accent-500')}
                      />
                      <div className="min-w-0 text-left flex-1">
                        <span className="truncate block">{proj.name}</span>
                        {proj.primary_path && (
                          <span className="text-[10px] text-[var(--theme-muted)] font-mono truncate block" title={proj.primary_path}>
                            {proj.primary_path}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <HugeiconsIcon icon={CheckmarkCircle01Icon} size={13} className="text-accent-600 shrink-0 ml-1.5" />
                    )}
                  </MenuItem>
                )
              })}
            </div>
          )}

          {/* Create New Project Shortcut */}
          <div className="border-t border-[var(--theme-border)] mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                hapticTap()
                setModalOpen(true)
              }}
              className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-xs text-accent-600 dark:text-accent-400 hover:bg-[var(--theme-hover)] font-medium transition-colors"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2.2} />
              <span>Create New Project...</span>
            </button>
          </div>
        </MenuContent>
      </MenuRoot>

      <ProjectModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}

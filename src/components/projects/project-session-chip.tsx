'use client'

import { useState } from 'react'
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
}

export function ProjectSessionChip({
  sessionKey,
  projectId,
  projectName,
  className,
  compact = false,
}: ProjectSessionChipProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const { projects, activeId } = useProjects()
  const setSessionProjectMutation = useSetSessionProject()
  const setActiveProjectMutation = useSetActiveProject()

  // Find assigned project or match against active project for new sessions
  const effectiveProjectId = projectId !== undefined ? projectId : activeId
  const currentProject = projects.find((p) => p.id === effectiveProjectId)
  const displayName = currentProject?.name ?? projectName ?? 'Personal Sandbox'
  const isPersonalSandbox = !effectiveProjectId

  const handleSelect = async (targetId: string | null) => {
    hapticTap()
    if (!sessionKey || sessionKey === 'new') {
      // For unsaved/new chat, directly switch active project
      setActiveProjectMutation.mutate(targetId, {
        onSuccess: () => {
          const name = targetId ? projects.find((p) => p.id === targetId)?.name : 'Personal Sandbox'
          toast.success(`Active project set to: ${name}`)
        },
      })
      return
    }

    try {
      await setSessionProjectMutation.mutateAsync({
        sessionKey,
        projectId: targetId,
      })
      const targetName = targetId ? projects.find((p) => p.id === targetId)?.name : 'Personal Sandbox'
      toast.success(`Session moved to: ${targetName}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change project')
    }
  }

  return (
    <>
      <MenuRoot>
        <MenuTrigger
          className={cn(
            'inline-flex items-center gap-1 rounded-full border transition-all cursor-pointer select-none font-medium text-xs',
            'border-[var(--theme-border)] bg-[var(--theme-card)] hover:bg-[var(--theme-hover)] text-[var(--theme-text)]',
            compact ? 'px-2 py-0.5 text-[11px] max-w-[120px]' : 'px-2.5 py-1 max-w-[190px]',
            className,
          )}
          title={`Session Project: ${displayName} (Click to change)`}
        >
          <HugeiconsIcon
            icon={isPersonalSandbox ? Folder01Icon : FolderOpenIcon}
            size={compact ? 12 : 13}
            className={cn(
              'shrink-0',
              isPersonalSandbox ? 'text-[var(--theme-muted)]' : 'text-accent-500',
            )}
          />
          <span className="truncate">{displayName}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={compact ? 10 : 11}
            className="shrink-0 opacity-40 ml-0.5"
          />
        </MenuTrigger>

        <MenuContent
          align="start"
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

          {/* Personal Sandbox Option */}
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
                <span className="truncate block">Personal Sandbox</span>
                <span className="text-[10px] text-[var(--theme-muted)] font-mono block">/workspace</span>
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

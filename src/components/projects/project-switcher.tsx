'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Folder01Icon,
  PlusSignIcon,
  FolderOpenIcon,
} from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import { useProjects, useSetActiveProject } from '@/hooks/use-projects'
import { ProjectModal } from './project-modal'

export type ProjectSwitcherProps = {
  variant?: 'sidebar' | 'mobile' | 'compact'
  className?: string
  isCollapsed?: boolean
}

export function ProjectSwitcher({
  variant = 'sidebar',
  className,
  isCollapsed = false,
}: ProjectSwitcherProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const { projects, activeProject } = useProjects()
  const setActiveMutation = useSetActiveProject()

  const handleSelectProject = (projectId: string | null) => {
    hapticTap()
    setActiveMutation.mutate(projectId)
  }

  const activeLabel = activeProject ? activeProject.name : 'Personal Sandbox'

  return (
    <>
      <MenuRoot>
        <MenuTrigger
          className={cn(
            'group flex items-center transition-all select-none outline-none',
            variant === 'sidebar' && [
              'w-full gap-2 rounded-xl px-2.5 py-1.5 text-left border border-[var(--theme-border)] bg-[var(--theme-card)]',
              'hover:border-accent-500/50 hover:bg-[var(--theme-hover)] text-xs',
            ],
            variant === 'mobile' && [
              'w-full gap-2.5 rounded-xl px-3 py-2 text-left border border-[var(--theme-border)] bg-[var(--theme-card)]',
              'active:scale-[0.99] text-xs font-medium',
            ],
            variant === 'compact' && [
              'size-8 items-center justify-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]',
              'hover:bg-[var(--theme-hover)]',
            ],
            className,
          )}
          aria-label="Switch Active Project"
        >
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg',
              activeProject
                ? 'bg-accent-500/15 text-accent-600'
                : 'bg-primary-100 text-primary-500 dark:bg-primary-900/40 dark:text-primary-400',
              variant === 'compact' ? 'size-6' : 'size-6',
            )}
          >
            <HugeiconsIcon icon={activeProject ? FolderOpenIcon : Folder01Icon} size={14} strokeWidth={1.8} />
          </span>

          {!isCollapsed && variant !== 'compact' && (
            <>
              <div className="flex-1 min-w-0">
                <span className="block text-[10px] text-[var(--theme-muted)] uppercase tracking-wider font-semibold leading-tight">
                  Project
                </span>
                <span className="block truncate text-xs font-medium text-[var(--theme-text)]">
                  {activeLabel}
                </span>
              </div>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={14}
                className="text-[var(--theme-muted)] group-hover:text-[var(--theme-text)] transition-colors shrink-0"
              />
            </>
          )}
        </MenuTrigger>

        <MenuContent
          side={variant === 'mobile' ? 'bottom' : 'bottom'}
          align={variant === 'sidebar' ? 'start' : 'center'}
          className="w-64 max-h-80 overflow-y-auto scrollbar-thin rounded-xl p-1.5"
        >
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
            Active Project Context
          </div>

          {/* Project List */}
          <div className="space-y-0.5">
            {projects.map((p) => {
              const isSelected = activeProject?.id === p.id
              return (
                <MenuItem
                  key={p.id}
                  onClick={() => handleSelectProject(p.id)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300 font-semibold'
                      : 'hover:bg-[var(--theme-hover)] text-[var(--theme-text)]',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={14}
                      className={isSelected ? 'text-accent-600' : 'text-[var(--theme-muted)] shrink-0'}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      {p.primary_path && (
                        <span className="block truncate text-[10px] text-[var(--theme-muted)] font-mono">
                          {p.primary_path.replace('/workspace/', '')}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={14}
                      className="text-accent-600 shrink-0"
                    />
                  )}
                </MenuItem>
              )
            })}

            {/* Sandbox Option */}
            <MenuItem
              onClick={() => handleSelectProject(null)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer border-t border-[var(--theme-border)]/50 mt-1 pt-1.5',
                !activeProject
                  ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300 font-semibold'
                  : 'hover:bg-[var(--theme-hover)] text-[var(--theme-text)]',
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="size-2 rounded-full bg-[var(--theme-muted)]/60" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate">No Project (Personal Sandbox)</span>
                  <span className="block truncate text-[10px] text-[var(--theme-muted)]">
                    Use each profile's default folder
                  </span>
                </div>
              </div>
              {!activeProject && (
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={14}
                  className="text-accent-600 shrink-0"
                />
              )}
            </MenuItem>
          </div>

          {/* New Project & Manage Actions */}
          <div className="border-t border-[var(--theme-border)] mt-1.5 pt-1 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                hapticTap()
                setModalOpen(true)
              }}
              className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-600 hover:bg-accent-500/10 transition-colors"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2.2} />
              <span>Create New Project</span>
            </button>
            <Link
              to="/projects"
              className="flex items-center justify-between w-full rounded-lg px-2.5 py-1.5 text-xs text-[var(--theme-text)] hover:bg-[var(--theme-hover)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Folder01Icon} size={14} className="text-[var(--theme-muted)]" />
                <span>Manage All Projects</span>
              </div>
              <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="text-[var(--theme-muted)]" />
            </Link>
          </div>
        </MenuContent>
      </MenuRoot>

      {/* Creation Modal */}
      <ProjectModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}

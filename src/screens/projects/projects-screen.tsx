'use client'

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Archive02Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  Edit01Icon,
  File01Icon,
  Folder01Icon,
  FolderOpenIcon,
  PlusSignIcon,
  Search01Icon,
  Tag01Icon,
  CheckListIcon,
} from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import {
  useProjects,
  useSetActiveProject,
  useDeleteProject,
  useArchiveProject,
  useRestoreProject,
  useUpdateProject,
  useAddProjectFolder,
  useRemoveProjectFolder,
  type Project,
} from '@/hooks/use-projects'
import { ProjectModal } from '@/components/projects/project-modal'

export function ProjectsScreen() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [addingFolderProject, setAddingFolderProject] = useState<Project | null>(null)
  const [folderPathInput, setFolderPathInput] = useState('')
  const [folderLabelInput, setFolderLabelInput] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const { projects, activeProject, activeId, isLoading } = useProjects({
    includeArchived: showArchived,
  })

  const setActiveMutation = useSetActiveProject()
  const deleteMutation = useDeleteProject()
  const archiveMutation = useArchiveProject()
  const restoreMutation = useRestoreProject()
  const updateMutation = useUpdateProject()
  const addFolderMutation = useAddProjectFolder()
  const removeFolderMutation = useRemoveProjectFolder()

  const handleSetActive = (id: string | null) => {
    hapticTap()
    setActiveMutation.mutate(id, {
      onSuccess: () => {
        toast.success(id ? 'Active project updated' : 'Switched to personal sandbox')
      },
    })
  }

  const handleDelete = (project: Project) => {
    hapticTap()
    if (confirm(`Are you sure you want to delete project "${project.name}"?`)) {
      deleteMutation.mutate(project.id, {
        onSuccess: () => {
          toast.success(`Deleted project "${project.name}"`)
        },
      })
    }
  }

  const handleArchiveToggle = (project: Project) => {
    hapticTap()
    if (project.archived) {
      restoreMutation.mutate(project.id, {
        onSuccess: () => toast.success(`Restored "${project.name}"`),
      })
    } else {
      archiveMutation.mutate(project.id, {
        onSuccess: () => toast.success(`Archived "${project.name}"`),
      })
    }
  }

  const handleAddFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addingFolderProject || !folderPathInput.trim()) return

    try {
      hapticTap()
      await addFolderMutation.mutateAsync({
        id: addingFolderProject.id,
        path: folderPathInput.trim(),
        label: folderLabelInput.trim() || undefined,
      })
      toast.success('Folder attached to project')
      setAddingFolderProject(null)
      setFolderPathInput('')
      setFolderLabelInput('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add folder')
    }
  }

  const handleRemoveFolder = (projectId: string, path: string) => {
    hapticTap()
    if (confirm(`Remove folder "${path}" from this project?`)) {
      removeFolderMutation.mutate({ id: projectId, path }, {
        onSuccess: () => toast.success('Folder removed from project'),
      })
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter((p) => {
      if (!showArchived && p.archived) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.primary_path && p.primary_path.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      )
    })
  }, [projects, search, showArchived])

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--theme-text)] tracking-tight">
            Projects
          </h1>
          <p className="text-xs sm:text-sm text-[var(--theme-muted)] mt-1">
            First-class workspaces that anchor codebases, Kanban tasks, and multi-agent execution
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              hapticTap()
              setModalOpen(true)
            }}
            className="bg-accent-600 hover:bg-accent-700 text-white font-medium gap-1.5 shadow-sm"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={15} strokeWidth={2.2} />
            <span>New Project</span>
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]"
          />
          <input
            type="text"
            placeholder="Search projects by name, slug, or folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] pl-9 pr-3 py-2 text-xs sm:text-sm text-[var(--theme-text)] placeholder-[var(--theme-muted)] outline-none focus:border-accent-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-[var(--theme-muted)]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-3.5 rounded border-[var(--theme-border)] text-accent-600 accent-accent-600"
            />
            <span>Show Archived</span>
          </label>
        </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 animate-pulse space-y-3"
            >
              <div className="size-8 rounded-lg bg-[var(--theme-hover)]" />
              <div className="h-4 bg-[var(--theme-hover)] rounded w-2/3" />
              <div className="h-3 bg-[var(--theme-hover)] rounded w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--theme-border)] p-12 text-center">
          <HugeiconsIcon
            icon={Folder01Icon}
            size={36}
            className="mx-auto text-[var(--theme-muted)] mb-3 opacity-60"
          />
          <h3 className="text-sm font-semibold text-[var(--theme-text)]">
            No projects found
          </h3>
          <p className="text-xs text-[var(--theme-muted)] max-w-xs mx-auto mt-1 mb-4">
            {search ? 'Try adjusting your search criteria' : 'Create your first project to organize repositories and tasks.'}
          </p>
          <Button
            size="sm"
            onClick={() => setModalOpen(true)}
            className="bg-accent-600 text-white font-medium gap-1"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
            <span>Create Project</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((proj) => {
            const isActive = proj.id === activeId || proj.is_active
            return (
              <div
                key={proj.id}
                className={cn(
                  'rounded-2xl border p-4 flex flex-col justify-between transition-all bg-[var(--theme-card)]',
                  isActive
                    ? 'border-accent-500 ring-2 ring-accent-500/20 shadow-md'
                    : 'border-[var(--theme-border)] hover:border-accent-500/40',
                )}
              >
                <div>
                  {/* Top line: Icon, Name, Active Badge */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-xl',
                          isActive
                            ? 'bg-accent-500 text-white'
                            : 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300',
                        )}
                      >
                        <HugeiconsIcon icon={isActive ? FolderOpenIcon : Folder01Icon} size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-[var(--theme-text)] truncate leading-tight">
                          {proj.name}
                        </h3>
                        <span className="text-[10px] font-mono text-[var(--theme-muted)]">
                          {proj.slug}
                        </span>
                      </div>
                    </div>

                    {isActive ? (
                      <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-accent-600 dark:text-accent-400 bg-accent-500/15 px-2 py-0.5 rounded-full">
                        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={12} />
                        Active
                      </span>
                    ) : null}
                  </div>

                  {/* Description */}
                  {proj.description && (
                    <p className="text-xs text-[var(--theme-muted)] line-clamp-2 mb-3">
                      {proj.description}
                    </p>
                  )}

                  {/* Primary Folder */}
                  <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2.5 space-y-1.5 mb-3 text-xs">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--theme-muted)] uppercase tracking-wider">
                      <span>Primary Folder</span>
                      <Link
                        to="/files"
                        className="text-accent-600 hover:underline flex items-center gap-0.5"
                      >
                        <span>Files</span>
                        <HugeiconsIcon icon={ArrowRight01Icon} size={10} />
                      </Link>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--theme-text)] truncate" title={proj.primary_path ?? ''}>
                      {proj.primary_path || 'None specified'}
                    </div>
                  </div>

                  {/* Secondary Folders (if any) */}
                  {proj.folders && proj.folders.length > 1 && (
                    <div className="space-y-1 mb-3">
                      <span className="block text-[10px] font-semibold text-[var(--theme-muted)] uppercase tracking-wider">
                        Linked Folders ({proj.folders.length - 1})
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
                        {proj.folders
                          .filter((f) => !f.is_primary)
                          .map((f) => (
                            <div
                              key={f.path}
                              className="flex items-center justify-between text-[11px] font-mono rounded-lg bg-[var(--theme-bg)] px-2 py-1 text-[var(--theme-text)]"
                            >
                              <span className="truncate flex-1" title={f.path}>
                                {f.path.replace('/workspace/', '')}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFolder(proj.id, f.path)}
                                className="text-[var(--theme-muted)] hover:text-red-500 p-0.5"
                                title="Remove folder"
                              >
                                <HugeiconsIcon icon={Delete02Icon} size={11} />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-[var(--theme-border)] flex items-center justify-between gap-1.5 mt-2">
                  <div className="flex items-center gap-1">
                    {!isActive && (
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() => handleSetActive(proj.id)}
                        className="bg-accent-600 hover:bg-accent-700 text-white font-medium"
                      >
                        Set Active
                      </Button>
                    )}

                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setAddingFolderProject(proj)}
                      title="Attach another repository or directory"
                    >
                      <HugeiconsIcon icon={Add01Icon} size={13} className="mr-1" />
                      Add Folder
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleArchiveToggle(proj)}
                      title={proj.archived ? 'Restore' : 'Archive'}
                    >
                      <HugeiconsIcon icon={Archive02Icon} size={13} />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleDelete(proj)}
                      className="text-red-500 hover:bg-red-500/10"
                      title="Delete project"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={13} />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Creation Modal */}
      <ProjectModal open={modalOpen} onOpenChange={setModalOpen} />

      {/* Add Folder Modal */}
      {addingFolderProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-[min(440px,94vw)] rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-[var(--theme-text)]">
              Attach Folder to {addingFolderProject.name}
            </h3>
            <p className="text-xs text-[var(--theme-muted)]">
              Add a secondary repository, assets directory, or sibling workspace folder.
            </p>

            <form onSubmit={handleAddFolderSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--theme-text)] mb-1">
                  Folder Path <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="/workspace/dev/my-repo"
                  value={folderPathInput}
                  onChange={(e) => setFolderPathInput(e.target.value)}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-xs font-mono text-[var(--theme-text)] outline-none focus:border-accent-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--theme-muted)] mb-1">
                  Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. backend, docs, assets"
                  value={folderLabelInput}
                  onChange={(e) => setFolderLabelInput(e.target.value)}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-xs text-[var(--theme-text)] outline-none focus:border-accent-500 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingFolderProject(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  className="bg-accent-600 text-white font-medium"
                >
                  Attach Folder
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

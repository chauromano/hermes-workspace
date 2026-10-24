import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Project, CreateProjectInput } from '@/server/projects-backend'

export type { Project, CreateProjectInput }

export const PROJECTS_QUERY_KEY = ['projects'] as const
export const FOLDERS_QUERY_KEY = ['projects', 'folders'] as const

export function useProjects(options?: { includeArchived?: boolean }) {
  const includeArchived = options?.includeArchived ?? false

  const query = useQuery({
    queryKey: [...PROJECTS_QUERY_KEY, { includeArchived }],
    queryFn: async (): Promise<{ projects: Project[]; active_id: string | null }> => {
      const url = `/api/projects${includeArchived ? '?include_archived=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to fetch projects: ${res.statusText}`)
      }
      return res.json()
    },
    staleTime: 30_000,
  })

  const projects = query.data?.projects ?? []
  const activeId = query.data?.active_id ?? null
  const activeProject = projects.find((p) => p.id === activeId || p.is_active)

  return {
    ...query,
    projects,
    activeId,
    activeProject,
  }
}

export function useWorkspaceFolders(subpath = '') {
  return useQuery({
    queryKey: [...FOLDERS_QUERY_KEY, subpath],
    queryFn: async (): Promise<Array<{ name: string; path: string }>> => {
      const encoded = encodeURIComponent(subpath)
      const res = await fetch(`/api/projects?type=folders&subpath=${encoded}`)
      if (!res.ok) {
        return []
      }
      const data = await res.json()
      return Array.isArray(data.folders) ? data.folders : []
    },
    staleTime: 60_000,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateProjectInput): Promise<Project> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create project (${res.status})`)
      }
      const data = await res.json()
      return data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useSetActiveProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string | null): Promise<string | null> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_active', id }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to set active project (${res.status})`)
      }
      const data = await res.json()
      return data.active_id ?? null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<boolean> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to delete project (${res.status})`)
      }
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      description?: string | null
      primary_path?: string
      icon?: string | null
      color?: string | null
      board_slug?: string | null
    }): Promise<Project> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', ...input }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to update project (${res.status})`)
      }
      const data = await res.json()
      return data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useAddProjectFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      path: string
      label?: string
      is_primary?: boolean
    }): Promise<Project> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_folder', ...input }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to add project folder (${res.status})`)
      }
      const data = await res.json()
      return data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useRemoveProjectFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      path: string
    }): Promise<Project> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_folder', ...input }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to remove project folder (${res.status})`)
      }
      const data = await res.json()
      return data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useArchiveProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<Project> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', id }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to archive project (${res.status})`)
      }
      const data = await res.json()
      return data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

export function useRestoreProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<Project> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', id }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to restore project (${res.status})`)
      }
      const data = await res.json()
      return data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })
}

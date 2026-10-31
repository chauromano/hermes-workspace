import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Project, CreateProjectInput } from '@/server/projects-backend'
import type { SessionMeta } from '@/screens/chat/types'

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

export function useCreateWorkspaceFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      subpath = '',
      name,
    }: {
      subpath?: string
      name: string
    }): Promise<{ name: string; path: string }> => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_folder', subpath, name }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create folder (${res.status})`)
      }
      const data = await res.json()
      return data.folder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_QUERY_KEY })
    },
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
    onMutate: async (newActiveId: string | null) => {
      await queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY })
      const previous = queryClient.getQueryData<{ projects: Project[]; active_id: string | null }>(PROJECTS_QUERY_KEY)
      if (previous) {
        queryClient.setQueryData(PROJECTS_QUERY_KEY, {
          ...previous,
          active_id: newActiveId,
          projects: previous.projects.map((p) => ({
            ...p,
            is_active: p.id === newActiveId,
          })),
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROJECTS_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
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

export function useSetSessionProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sessionKey,
      projectId,
    }: {
      sessionKey: string
      projectId: string | null
    }): Promise<{ success: boolean; cwd: string | null; projectId: string | null; projectName: string }> => {
      const res = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, projectId }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to set session project (${res.status})`)
      }
      const data = await res.json()
      return data.entry
    },
    onMutate: async ({ sessionKey, projectId }) => {
      await queryClient.cancelQueries({ queryKey: ['chat', 'sessions'] })
      await queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY })

      const prevSessions = queryClient.getQueryData<SessionMeta[]>(['chat', 'sessions'])
      const prevProjects = queryClient.getQueryData<{ projects: Project[]; active_id: string | null }>(PROJECTS_QUERY_KEY)

      const targetProject = prevProjects?.projects.find((p) => p.id === projectId)
      const targetName = targetProject ? targetProject.name : 'Personal Sandbox'
      const targetSlug = targetProject ? targetProject.slug : null
      const targetCwd = targetProject ? targetProject.primary_path : '/workspace'

      if (prevSessions) {
        queryClient.setQueryData<SessionMeta[]>(['chat', 'sessions'], (old) => {
          if (!old) return old
          return old.map((s) => {
            const sid = s.key || s.friendlyId || (s as any).id
            if (sid === sessionKey || s.friendlyId === sessionKey || s.key === sessionKey) {
              return {
                ...s,
                projectId,
                projectName: targetName,
                projectSlug: targetSlug,
                cwd: targetCwd,
              }
            }
            return s
          })
        })
      }

      if (prevProjects) {
        queryClient.setQueryData(PROJECTS_QUERY_KEY, {
          ...prevProjects,
          active_id: projectId,
          projects: prevProjects.projects.map((p) => ({
            ...p,
            is_active: p.id === projectId,
          })),
        })
      }

      return { prevSessions, prevProjects }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevSessions) {
        queryClient.setQueryData(['chat', 'sessions'], context.prevSessions)
      }
      if (context?.prevProjects) {
        queryClient.setQueryData(PROJECTS_QUERY_KEY, context.prevProjects)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] })
    },
  })
}

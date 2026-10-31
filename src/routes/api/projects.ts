import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  listProjects,
  createProject,
  setActiveProject,
  updateProject,
  addProjectFolder,
  removeProjectFolder,
  archiveProject,
  deleteProject,
  listWorkspaceDirectories,
  createWorkspaceDirectory,
  type CreateProjectInput,
} from '../../server/projects-backend'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/projects')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const type = url.searchParams.get('type')

        // Folder auto-completion helper for Project creation
        if (type === 'folders') {
          const subpath = url.searchParams.get('subpath') || ''
          const folders = listWorkspaceDirectories(subpath)
          return jsonResponse({ folders })
        }

        const includeArchived = url.searchParams.get('include_archived') === 'true'
        const result = listProjects({ includeArchived })
        return jsonResponse(result)
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          const action = typeof body.action === 'string' ? body.action : 'create'

          if (action === 'create_folder') {
            const subpath = typeof body.subpath === 'string' ? body.subpath : ''
            const name =
              typeof body.name === 'string'
                ? body.name
                : typeof body.folder_name === 'string'
                  ? body.folder_name
                  : ''
            if (!name || !name.trim()) {
              return jsonResponse({ error: 'Folder name is required' }, 400)
            }
            const folder = createWorkspaceDirectory(subpath, name)
            return jsonResponse({ success: true, folder }, 201)
          }

          if (action === 'set_active') {
            const ident = typeof body.id === 'string' ? body.id : null
            const res = setActiveProject(ident)
            return jsonResponse({ success: true, active_id: res.active_id })
          }

          if (action === 'update') {
            const ident = typeof body.id === 'string' ? body.id : ''
            if (!ident) {
              return jsonResponse({ error: 'Project ID is required' }, 400)
            }
            const project = updateProject(ident, {
              name: typeof body.name === 'string' ? body.name : undefined,
              description: body.description !== undefined ? String(body.description) : undefined,
              primary_path: typeof body.primary_path === 'string' ? body.primary_path : undefined,
              icon: body.icon !== undefined ? String(body.icon) : undefined,
              color: body.color !== undefined ? String(body.color) : undefined,
              board_slug: body.board_slug !== undefined ? String(body.board_slug) : undefined,
            })
            return jsonResponse({ success: true, project })
          }

          if (action === 'add_folder') {
            const ident = typeof body.id === 'string' ? body.id : ''
            const folderPath = typeof body.path === 'string' ? body.path : ''
            if (!ident || !folderPath) {
              return jsonResponse({ error: 'Project ID and folder path are required' }, 400)
            }
            const project = addProjectFolder(
              ident,
              folderPath,
              typeof body.label === 'string' ? body.label : '',
              body.is_primary === true,
            )
            return jsonResponse({ success: true, project })
          }

          if (action === 'remove_folder') {
            const ident = typeof body.id === 'string' ? body.id : ''
            const folderPath = typeof body.path === 'string' ? body.path : ''
            if (!ident || !folderPath) {
              return jsonResponse({ error: 'Project ID and folder path are required' }, 400)
            }
            const project = removeProjectFolder(ident, folderPath)
            return jsonResponse({ success: true, project })
          }

          if (action === 'archive') {
            const ident = typeof body.id === 'string' ? body.id : ''
            if (!ident) {
              return jsonResponse({ error: 'Project ID is required' }, 400)
            }
            const project = archiveProject(ident, true)
            return jsonResponse({ success: true, project })
          }

          if (action === 'restore') {
            const ident = typeof body.id === 'string' ? body.id : ''
            if (!ident) {
              return jsonResponse({ error: 'Project ID is required' }, 400)
            }
            const project = archiveProject(ident, false)
            return jsonResponse({ success: true, project })
          }

          if (action === 'delete') {
            const ident = typeof body.id === 'string' ? body.id : ''
            if (!ident) {
              return jsonResponse({ error: 'Project ID is required for deletion' }, 400)
            }
            const ok = deleteProject(ident)
            return jsonResponse({ success: ok })
          }

          // Create new project
          if (!body.name || typeof body.name !== 'string') {
            return jsonResponse({ error: 'Project name is required' }, 400)
          }
          if (!body.primary_path || typeof body.primary_path !== 'string') {
            return jsonResponse({ error: 'Primary workspace folder is required' }, 400)
          }

          const input: CreateProjectInput = {
            name: body.name,
            slug: typeof body.slug === 'string' ? body.slug : undefined,
            slug_customized: body.slug_customized === true,
            primary_path: body.primary_path,
            description: typeof body.description === 'string' ? body.description : undefined,
            icon: typeof body.icon === 'string' ? body.icon : undefined,
            color: typeof body.color === 'string' ? body.color : undefined,
            board_slug: typeof body.board_slug === 'string' ? body.board_slug : undefined,
            set_active: body.set_active === true,
            folders: Array.isArray(body.folders) ? (body.folders as Array<{ path: string; label?: string }>) : undefined,
          }

          const project = createProject(input)
          return jsonResponse({ success: true, project }, 201)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          return jsonResponse({ error: message }, 500)
        }
      },
    },
  },
})

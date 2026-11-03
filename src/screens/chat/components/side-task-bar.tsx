import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { useEffect, useRef } from 'react'

export type SideTask = {
  id: string
  key: string
  title: string | null
  profileName: string
  startedAt: number
  lastActivityAt: number | null
  messageCount: number
  toolCallCount: number
  status: 'active' | 'idle'
  lastAssistantMessage?: string | null
}

export function SideTaskBar({
  parentSessionKey,
}: {
  parentSessionKey?: string | null
}) {
  const queryClient = useQueryClient()
  const prevActiveRef = useRef<boolean>(false)

  const sideTasksQuery = useQuery({
    queryKey: ['side-tasks', parentSessionKey],
    queryFn: async () => {
      if (!parentSessionKey) return []
      const res = await fetch(`/api/sessions/side-tasks?parentSessionKey=${encodeURIComponent(parentSessionKey)}`)
      if (!res.ok) return []
      const data = (await res.json()) as { sideTasks?: Array<SideTask> }
      return data.sideTasks || []
    },
    enabled: Boolean(parentSessionKey && parentSessionKey !== 'new'),
    refetchInterval: (query) => {
      const tasks = query.state.data || []
      const anyActive = tasks.some((t) => t.status === 'active')
      return anyActive ? 2500 : false
    },
  })

  const sideTasks = sideTasksQuery.data || []
  const hasActive = sideTasks.some((t) => t.status === 'active')

  // When a side task finishes (active -> idle), invalidate parent history so the injected message appears
  useEffect(() => {
    if (prevActiveRef.current && !hasActive && parentSessionKey) {
      void queryClient.invalidateQueries({ queryKey: ['chat', 'history'] })
    }
    prevActiveRef.current = hasActive
  }, [hasActive, parentSessionKey, queryClient])

  if (sideTasks.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-2 space-y-1.5 select-none">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400">
        <span>Linked Side Tasks</span>
        <span className="rounded-full bg-primary-100 dark:bg-neutral-800 px-1.5 py-0.2 text-[10px]">
          {sideTasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {sideTasks.map((task) => {
          const isActive = task.status === 'active'
          const avatarUrl =
            task.profileName === 'antigravity'
              ? '/antigravity-avatar.webp'
              : `/api/profiles/avatar?name=${encodeURIComponent(task.profileName)}`

          return (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50/50 dark:bg-neutral-900/50 px-3 py-2 text-xs transition-colors hover:border-primary-300 dark:hover:border-neutral-700"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <img
                  src={avatarUrl}
                  alt={task.profileName}
                  className="size-5 rounded-full object-cover shrink-0"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).src = '/claude-avatar.webp'
                  }}
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary-900 dark:text-neutral-100 truncate">
                      @{task.profileName}
                    </span>
                    <span className="text-[11px] text-primary-500 dark:text-neutral-400 truncate">
                      {task.title?.replace(/^@[a-zA-Z0-9_-]+:\s*/, '') || 'Side task'}
                    </span>
                  </div>
                  {task.lastAssistantMessage && !isActive && (
                    <span className="text-[11px] text-primary-600 dark:text-neutral-300 truncate opacity-90 mt-0.5">
                      {task.lastAssistantMessage}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isActive ? (
                  <div className="flex items-center gap-1.5 text-accent-600 dark:text-accent-400 font-medium text-[11px]">
                    <span className="size-2 rounded-full bg-accent-500 animate-pulse" />
                    <span>Working...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                    <span>Complete</span>
                  </div>
                )}

                <Link
                  to="/chat/$sessionKey"
                  params={{ sessionKey: task.id }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-accent-600 dark:text-accent-400 hover:underline px-2 py-1 rounded hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors"
                >
                  <span>Inspect</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

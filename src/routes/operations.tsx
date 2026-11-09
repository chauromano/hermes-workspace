import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { OperationsScreen } from '@/screens/agents/operations-screen'
import { CrewScreen } from '@/screens/crew/crew-screen'
import { HugeiconsIcon } from '@hugeicons/react'
import { AiBrain03Icon, Activity01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/operations')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === 'monitoring' ? ('monitoring' as const) : ('agents' as const),
  }),
  component: OperationsRoute,
  errorComponent: function OperationsError({ error }) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-primary-50">
        <h2 className="text-xl font-semibold text-primary-900 mb-3">
          Failed to Load Agents
        </h2>
        <p className="text-sm text-primary-600 mb-4 max-w-md">
          {error instanceof Error
            ? error.message
            : 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          Reload Page
        </button>
      </div>
    )
  },
  pendingComponent: function OperationsPending() {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent mb-3" />
          <p className="text-sm text-primary-500">Loading agents...</p>
        </div>
      </div>
    )
  },
})

function OperationsRoute() {
  const { tab: initialTab } = Route.useSearch()
  const [tab, setTab] = useState<'agents' | 'monitoring'>(initialTab ?? 'agents')
  usePageTitle(tab === 'monitoring' ? 'Agent Monitoring' : 'Agents')

  return (
    <div className="min-h-full overflow-y-auto bg-surface text-ink">
      <div className="mx-auto w-full max-w-[1320px] px-3 pt-4 sm:px-5">
        <div className="flex w-fit items-center gap-1 rounded-xl border border-primary-200 bg-primary-50/85 p-1 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setTab('agents')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              tab === 'agents'
                ? 'bg-primary-100 text-ink shadow-sm dark:bg-neutral-800'
                : 'text-primary-500 hover:text-ink',
            )}
          >
            <HugeiconsIcon icon={AiBrain03Icon} size={16} strokeWidth={1.8} />
            Agents
          </button>
          <button
            type="button"
            onClick={() => setTab('monitoring')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              tab === 'monitoring'
                ? 'bg-primary-100 text-ink shadow-sm dark:bg-neutral-800'
                : 'text-primary-500 hover:text-ink',
            )}
          >
            <HugeiconsIcon icon={Activity01Icon} size={16} strokeWidth={1.8} />
            Monitoring
          </button>
        </div>
      </div>
      {tab === 'agents' ? <OperationsScreen /> : <CrewScreen />}
    </div>
  )
}

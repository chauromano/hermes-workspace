import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ProfilesScreen } from '@/screens/profiles/profiles-screen'

export const Route = createFileRoute('/profiles')({
  ssr: false,
  component: ProfilesRoute,
})

function ProfilesRoute() {
  usePageTitle('Profiles')

  return (
    <div className="min-h-full overflow-y-auto bg-surface text-ink">
      <ProfilesScreen />
    </div>
  )
}

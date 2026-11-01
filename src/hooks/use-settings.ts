import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getTheme, isValidTheme, setTheme, syncAppearanceToServer } from '@/lib/theme'

export type SettingsThemeMode = 'system' | 'light' | 'dark'
export type AccentColor = 'orange' | 'purple' | 'blue' | 'green'
export type InterfaceFont = 'system' | 'inter' | 'serif' | 'mono'
export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious'

export type StudioSettings = {
  claudeUrl: string
  claudeToken: string
  theme: SettingsThemeMode
  accentColor: AccentColor
  showUsageMeter: boolean
  editorFontSize: number
  editorWordWrap: boolean
  editorMinimap: boolean
  notificationsEnabled: boolean
  usageThreshold: number
  smartSuggestionsEnabled: boolean
  preferredBudgetModel: string
  preferredPremiumModel: string
  onlySuggestCheaper: boolean
  showSystemMetricsFooter: boolean
  interfaceFont: InterfaceFont
  interfaceDensity: InterfaceDensity
  /** Mobile chat nav mode: 'dock' = iMessage (no nav in chat), 'integrated' = chat input in nav pill, 'scroll-hide' = nav shows on scroll up */
  mobileChatNavMode: 'dock' | 'integrated' | 'scroll-hide'
  /** Hidden experimental: show Echo Studio (dashboard builder scaffold) in nav. Off by default. */
  experimentalEchoStudio: boolean
}

type SettingsState = {
  settings: StudioSettings
  updateSettings: (updates: Partial<StudioSettings>) => void
}

export const defaultStudioSettings: StudioSettings = {
  claudeUrl: '',
  claudeToken: '',
  theme: 'system',
  accentColor: 'blue',
  showUsageMeter: false,
  editorFontSize: 13,
  editorWordWrap: true,
  editorMinimap: false,
  notificationsEnabled: true,
  usageThreshold: 80,
  smartSuggestionsEnabled: false,
  preferredBudgetModel: '',
  preferredPremiumModel: '',
  onlySuggestCheaper: false,
  showSystemMetricsFooter: false,
  interfaceFont: 'system',
  interfaceDensity: 'comfortable',
  mobileChatNavMode: 'dock',
  experimentalEchoStudio: false,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    function createSettingsStore(set) {
      return {
        settings: defaultStudioSettings,
        updateSettings: function updateSettings(updates) {
          set(function applyUpdates(state) {
            return {
              settings: {
                ...state.settings,
                ...updates,
              },
            }
          })
          if (
            updates.interfaceFont !== undefined ||
            updates.interfaceDensity !== undefined ||
            updates.accentColor !== undefined
          ) {
            syncAppearanceToServer({
              interfaceFont: updates.interfaceFont,
              interfaceDensity: updates.interfaceDensity,
              accentColor: updates.accentColor,
            })
          }
        },
      }
    },
    {
      name: 'claude-settings',
      skipHydration: true,
    },
  ),
)

export function useSettings() {
  useEffect(() => {
    void useSettingsStore.persist.rehydrate()
  }, [])

  const settings = useSettingsStore(function selectSettings(state) {
    return state.settings
  })
  const updateSettings = useSettingsStore(function selectUpdateSettings(state) {
    return state.updateSettings
  })

  return {
    settings,
    updateSettings,
  }
}

export function resolveTheme(theme: SettingsThemeMode): 'light' | 'dark' {
  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'

  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyInterfacePreferences(settings: Partial<StudioSettings>) {
  if (typeof document === 'undefined') return
  if (settings.interfaceFont) {
    document.documentElement.dataset.interfaceFont = settings.interfaceFont
  }
  if (settings.interfaceDensity) {
    document.documentElement.dataset.interfaceDensity = settings.interfaceDensity
  }
  if (settings.accentColor) {
    document.documentElement.setAttribute('data-accent', settings.accentColor)
  }
}

export function applyTheme(_theme?: SettingsThemeMode) {
  setTheme(getTheme())
  applyInterfacePreferences(useSettingsStore.getState().settings)
}

export async function initializeSettingsAppearance() {
  if (typeof window === 'undefined') return

  // 1. Instant local render without flicker
  const localTheme = getTheme()
  setTheme(localTheme, { skipServerSync: true })
  applyInterfacePreferences(useSettingsStore.getState().settings)

  // 2. Hydrate local store
  await useSettingsStore.persist.rehydrate()
  applyInterfacePreferences(useSettingsStore.getState().settings)

  // 3. Reconcile with server-persisted appearance settings
  try {
    const res = await fetch('/api/appearance')
    if (res.ok) {
      const server = (await res.json()) as {
        theme?: string
        interfaceFont?: InterfaceFont
        interfaceDensity?: InterfaceDensity
        accentColor?: AccentColor
      }

      if (server.theme && isValidTheme(server.theme)) {
        if (server.theme !== localTheme) {
          setTheme(server.theme, { skipServerSync: true })
        }
      } else if (localTheme) {
        syncAppearanceToServer({ theme: localTheme })
      }

      const updates: Partial<StudioSettings> = {}
      if (server.interfaceFont) updates.interfaceFont = server.interfaceFont
      if (server.interfaceDensity) updates.interfaceDensity = server.interfaceDensity
      if (server.accentColor) updates.accentColor = server.accentColor

      if (Object.keys(updates).length > 0) {
        useSettingsStore.getState().updateSettings(updates)
        applyInterfacePreferences(useSettingsStore.getState().settings)
      } else {
        const state = useSettingsStore.getState().settings
        syncAppearanceToServer({
          interfaceFont: state.interfaceFont,
          interfaceDensity: state.interfaceDensity,
          accentColor: state.accentColor,
        })
      }
    }
  } catch {
    // Non-fatal if offline
  }
}

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

export type ProfileSummary = {
  name: string
  path: string
  active: boolean
  exists: boolean
  model?: string
  provider?: string
  description?: string
  soul?: string
  systemPrompt?: string
  avatar?: string
  emoji?: string
  color?: string
  skillCount: number
  sessionCount: number
  hasEnv: boolean
  updatedAt?: string
}

export type ProfileDetail = {
  name: string
  path: string
  active: boolean
  config: Record<string, unknown>
  profileMeta?: Record<string, unknown>
  description: string
  soul: string
  systemPrompt: string
  memory: string
  userContext: string
  avatar?: string
  emoji?: string
  color?: string
  envPath?: string
  hasEnv: boolean
  sessionsDir?: string
  skillsDir?: string
}

const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const TEXT_REWRITE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.yaml',
  '.yml',
  '.json',
  '.jsonl',
  '.toml',
  '.env',
  '.plist',
  '.sh',
  '.js',
  '.ts',
  '.tsx',
])

function getHermesRoot(): string {
  return (
    process.env.HERMES_HOME ??
    process.env.CLAUDE_HOME ??
    path.join(os.homedir(), '.hermes')
  )
}

function getClaudeRoot(): string {
  return getHermesRoot()
}

export function getProfilesRoot(): string {
  return path.join(getClaudeRoot(), 'profiles')
}

function getActiveProfilePath(): string {
  return path.join(getClaudeRoot(), 'active_profile')
}

function stickyActiveProfileEnabled(): boolean {
  return process.env.HERMES_WORKSPACE_STICKY_PROFILE !== '0'
}

/**
 * Validate a profile name that will be *written* to disk. The 'default'
 * profile is reserved — callers must not create or mutate it via the UI.
 */
function validateProfileName(name: string): string {
  const trimmed = validateProfileIdentifier(name)
  if (trimmed === 'default' || trimmed === 'general')
    throw new Error('General profile cannot be modified here')
  return trimmed
}

/**
 * Validate a profile name that will only be *read* (e.g. `cloneFrom` source).
 * Any existing profile name is allowed, including 'default'.
 */
function validateProfileIdentifier(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name is required')
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..')
  ) {
    throw new Error('Invalid profile name')
  }
  return trimmed
}

function safeReadText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

function readYamlConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) return {}
  try {
    const parsed = YAML.parse(safeReadText(configPath)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function countFilesRecursive(
  rootPath: string,
  predicate: (fullPath: string) => boolean,
): number {
  if (!fs.existsSync(rootPath)) return 0
  let count = 0
  const stack = [rootPath]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: Array<fs.Dirent> = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (predicate(fullPath)) count += 1
    }
  }
  return count
}

function latestMtime(paths: Array<string>): string | undefined {
  let latest = 0
  for (const target of paths) {
    if (!fs.existsSync(target)) continue
    try {
      const stat = fs.statSync(target)
      latest = Math.max(latest, stat.mtimeMs)
    } catch {
      // ignore
    }
  }
  return latest > 0 ? new Date(latest).toISOString() : undefined
}

function readProfileMetaYaml(profilePath: string): Record<string, unknown> {
  const profileYamlPath = path.join(profilePath, 'profile.yaml')
  return readYamlConfig(profileYamlPath)
}

function extractDescription(
  config: Record<string, unknown>,
  profileMeta?: Record<string, unknown>,
): string {
  if (profileMeta && typeof profileMeta.description === 'string' && profileMeta.description.trim()) {
    return profileMeta.description.trim()
  }

  const direct = config.description
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const metadata = config.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const nested = (metadata as Record<string, unknown>).description
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
  }

  return ''
}

function extractAvatarMeta(
  profileMeta: Record<string, unknown>,
  config: Record<string, unknown>,
): { avatar?: string; emoji?: string; color?: string } {
  const avatar =
    typeof profileMeta.avatar === 'string' && profileMeta.avatar.trim()
      ? profileMeta.avatar.trim()
      : typeof config.avatar === 'string' && config.avatar.trim()
        ? config.avatar.trim()
        : undefined

  const emoji =
    typeof profileMeta.emoji === 'string' && profileMeta.emoji.trim()
      ? profileMeta.emoji.trim()
      : typeof config.emoji === 'string' && config.emoji.trim()
        ? config.emoji.trim()
        : undefined

  const color =
    typeof profileMeta.color === 'string' && profileMeta.color.trim()
      ? profileMeta.color.trim()
      : typeof config.color === 'string' && config.color.trim()
        ? config.color.trim()
        : undefined

  return { avatar, emoji, color }
}

function extractSoul(
  config: Record<string, unknown>,
  profilePath: string,
): string {
  const soulPath = path.join(profilePath, 'SOUL.md')
  if (fs.existsSync(soulPath)) {
    try {
      const text = safeReadText(soulPath).trim()
      if (text) return text
    } catch {
      // ignore
    }
  }

  const configured = config.system_prompt
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim()
  }

  return ''
}

function extractSystemPrompt(
  config: Record<string, unknown>,
  profilePath: string,
): string {
  return extractSoul(config, profilePath)
}

function readMemoryFile(
  profilePath: string,
  filename: 'MEMORY.md' | 'USER.md',
): string {
  const subPath = path.join(profilePath, 'memories', filename)
  if (fs.existsSync(subPath)) {
    try {
      return safeReadText(subPath).trim()
    } catch {
      // ignore
    }
  }

  const rootPath = path.join(profilePath, filename)
  if (fs.existsSync(rootPath)) {
    try {
      return safeReadText(rootPath).trim()
    } catch {
      // ignore
    }
  }

  return ''
}

// ---------------------------------------------------------------------------
// Dashboard API fallback for split-host deployments
// ---------------------------------------------------------------------------

function getDashboardUrl(): string | undefined {
  const url = process.env.HERMES_DASHBOARD_URL?.trim()
  return url || undefined
}

function getDashboardToken(): string | undefined {
  return (
    process.env.HERMES_API_TOKEN?.trim() ||
    process.env.CLAUDE_API_TOKEN?.trim() ||
    process.env.CLAUDE_DASHBOARD_TOKEN?.trim() ||
    undefined
  )
}

async function fetchDashboardProfiles(): Promise<{
  profiles: Array<ProfileSummary>
  activeProfile: string
} | null> {
  const dashboardUrl = getDashboardUrl()
  if (!dashboardUrl) return null

  try {
    const token = getDashboardToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${dashboardUrl}/api/profiles`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null

    const data = (await response.json()) as {
      profiles?: Array<{
        name: string
        model?: string
        provider?: string
        description?: string
        is_default?: boolean
        skill_count?: number
        session_count?: number
        has_env?: boolean
        updated_at?: string
      }>
    }

    if (!data.profiles || !Array.isArray(data.profiles)) return null

    const activeProfile =
      data.profiles.find((p) => p.is_default)?.name || 'default'

    const profiles: Array<ProfileSummary> = data.profiles.map((p) => ({
      name: p.name,
      path: p.is_default
        ? getClaudeRoot()
        : path.join(getProfilesRoot(), p.name),
      active: p.name === activeProfile,
      exists: true,
      model: p.model,
      provider: p.provider,
      description: p.description,
      skillCount: p.skill_count ?? 0,
      sessionCount: p.session_count ?? 0,
      hasEnv: p.has_env ?? false,
      updatedAt: p.updated_at,
    }))

    profiles.sort((a, b) => {
      if (a.active && !b.active) return -1
      if (!a.active && b.active) return 1
      return Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
    })

    return { profiles, activeProfile }
  } catch (error) {
    // Dashboard unreachable or returned unexpected data — fall back to filesystem
    return null
  }
}

/**
 * List profiles with dashboard API fallback for split-host deployments.
 * When HERMES_DASHBOARD_URL is set and reachable, fetches from the dashboard
 * API. Falls back to filesystem reads for colocated deployments.
 */
export async function listProfilesWithFallback(): Promise<{
  profiles: Array<ProfileSummary>
  activeProfile: string
}> {
  // Try dashboard first for split-host deployments
  const dashboardResult = await fetchDashboardProfiles()
  if (dashboardResult) return dashboardResult

  // Fall back to filesystem (colocated deployment)
  return {
    profiles: listProfiles(),
    activeProfile: getActiveProfileName(),
  }
}

/**
 * Read a single profile with dashboard API fallback for split-host deployments.
 */
export async function readProfileWithFallback(
  name: string,
): Promise<ProfileDetail> {
  // Try filesystem first (fast path for colocated deployments)
  const normalized = name.trim() || 'general'
  const isDefault = normalized === 'default' || normalized === 'general'
  const profilePath =
    isDefault
      ? getClaudeRoot()
      : path.join(getProfilesRoot(), validateProfileIdentifier(normalized))

  if (fs.existsSync(profilePath)) {
    return readProfile(normalized)
  }

  // Filesystem miss — try dashboard API for split-host deployments
  const dashboardUrl = getDashboardUrl()
  if (dashboardUrl) {
    try {
      const token = getDashboardToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${dashboardUrl}/api/profiles`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const data = (await response.json()) as {
          profiles?: Array<{
            name: string
            model?: string
            provider?: string
            description?: string
            is_default?: boolean
          }>
        }
        const match = data.profiles?.find(
          (p) => p.name === normalized || (normalized === 'default' && p.is_default),
        )
        if (match) {
          const active = getActiveProfileName()
          return {
            name: match.name,
            path: match.is_default
              ? getClaudeRoot()
              : path.join(getProfilesRoot(), match.name),
            active: match.name === active,
            config: {
              ...(match.model ? { model: match.model } : {}),
              ...(match.provider ? { provider: match.provider } : {}),
            },
            description: match.description || '',
            systemPrompt: '',
            hasEnv: false,
          }
        }
      }
    } catch {
      // Dashboard unreachable — fall through to error
    }
  }

  throw new Error('Profile not found')
}

export function getActiveProfileName(): string {
  const activePath = getActiveProfilePath()
  if (!fs.existsSync(activePath)) return 'general'
  try {
    const raw = safeReadText(activePath).trim()
    if (!raw || raw === 'default') return 'general'
    return raw
  } catch {
    return 'general'
  }
}

export function listProfiles(): Array<ProfileSummary> {
  const profilesRoot = getProfilesRoot()
  const activeProfile = getActiveProfileName()
  const results: Array<ProfileSummary> = []

  if (fs.existsSync(profilesRoot)) {
    let entries: Array<fs.Dirent> = []
    try {
      entries = fs.readdirSync(profilesRoot, { withFileTypes: true })
    } catch {
      entries = []
    }

    for (const entry of entries) {
      const name = entry.name
      if (name === 'default' || name === 'general') continue
      const profilePath = path.join(profilesRoot, name)
      if (!entry.isDirectory()) {
        if (!entry.isSymbolicLink()) continue
        try {
          if (!fs.statSync(profilePath).isDirectory()) continue
        } catch {
          continue
        }
      }
      const configPath = path.join(profilePath, 'config.yaml')
      const envPath = path.join(profilePath, '.env')
      const skillsDir = path.join(profilePath, 'skills')
      const sessionsDir = path.join(profilePath, 'sessions')
      const config = readYamlConfig(configPath)
      const profileMeta = readProfileMetaYaml(profilePath)
      const { avatar, emoji, color } = extractAvatarMeta(profileMeta, config)
      const skillCount = countFilesRecursive(
        skillsDir,
        (full) => path.basename(full) === 'SKILL.md',
      )
      const sessionCount = countFilesRecursive(sessionsDir, (full) =>
        /\.(jsonl|json|sqlite|db)$/i.test(full),
      )
      // Resolve model/provider from nested or flat config structure
      let modelName: string | undefined
      let providerName: string | undefined
      if (typeof config.model === 'string') {
        modelName = config.model
      } else if (
        config.model &&
        typeof config.model === 'object' &&
        !Array.isArray(config.model)
      ) {
        const m = config.model as Record<string, unknown>
        if (typeof m.default === 'string') modelName = m.default
        if (typeof m.provider === 'string') providerName = m.provider
      }
      if (!providerName && typeof config.provider === 'string') {
        providerName = config.provider
      }
      const soul = extractSoul(config, profilePath) || undefined
      results.push({
        name,
        path: profilePath,
        active: name === activeProfile,
        exists: true,
        model: modelName,
        provider: providerName,
        description: extractDescription(config, profileMeta) || undefined,
        soul,
        systemPrompt: soul,
        avatar,
        emoji,
        color,
        skillCount,
        sessionCount,
        hasEnv: fs.existsSync(envPath),
        updatedAt: latestMtime([
          profilePath,
          configPath,
          envPath,
          skillsDir,
          sessionsDir,
        ]),
      })
    }
  }

  const root = getClaudeRoot()
  const config = readYamlConfig(path.join(root, 'config.yaml'))
  const rootMeta = readProfileMetaYaml(root)
  const rootAvatarMeta = extractAvatarMeta(rootMeta, config)
  // Resolve model/provider for default profile too
  let defaultModel: string | undefined
  let defaultProvider: string | undefined
  if (typeof config.model === 'string') {
    defaultModel = config.model
  } else if (
    config.model &&
    typeof config.model === 'object' &&
    !Array.isArray(config.model)
  ) {
    const m = config.model as Record<string, unknown>
    if (typeof m.default === 'string') defaultModel = m.default
    if (typeof m.provider === 'string') defaultProvider = m.provider
  }
  if (!defaultProvider && typeof config.provider === 'string') {
    defaultProvider = config.provider
  }
  const rootSoul = extractSoul(config, root) || undefined
  results.unshift({
    name: 'general',
    path: root,
    active: activeProfile === 'default' || activeProfile === 'general',
    exists: true,
    model: defaultModel,
    provider: defaultProvider,
    description: extractDescription(config, rootMeta) || undefined,
    soul: rootSoul,
    systemPrompt: rootSoul,
    avatar: rootAvatarMeta.avatar,
    emoji: rootAvatarMeta.emoji,
    color: rootAvatarMeta.color,
    skillCount: countFilesRecursive(
      path.join(root, 'skills'),
      (full) => path.basename(full) === 'SKILL.md',
    ),
    sessionCount: countFilesRecursive(path.join(root, 'sessions'), (full) =>
      /\.(jsonl|json|sqlite|db)$/i.test(full),
    ),
    hasEnv: fs.existsSync(path.join(root, '.env')),
    updatedAt: latestMtime([root, path.join(root, 'config.yaml')]),
  })

  results.sort((a, b) => {
    if (a.active && !b.active) return -1
    if (!a.active && b.active) return 1
    return Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
  })
  return results
}

export function readProfile(name: string): ProfileDetail {
  const active = getActiveProfileName()
  const normalized = name.trim() || 'general'
  const isDefault = normalized === 'default' || normalized === 'general'
  const profilePath =
    isDefault
      ? getClaudeRoot()
      : path.join(getProfilesRoot(), validateProfileName(normalized))
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  const configPath = path.join(profilePath, 'config.yaml')
  const envPath = path.join(profilePath, '.env')
  const sessionsDir = path.join(profilePath, 'sessions')
  const skillsDir = path.join(profilePath, 'skills')
  const config = readYamlConfig(configPath)
  const profileMeta = readProfileMetaYaml(profilePath)
  const { avatar, emoji, color } = extractAvatarMeta(profileMeta, config)
  const soul = extractSoul(config, profilePath)
  const memory = readMemoryFile(profilePath, 'MEMORY.md')
  const userContext = readMemoryFile(profilePath, 'USER.md')

  return {
    name: normalized,
    path: profilePath,
    active: normalized === active,
    config,
    profileMeta,
    description: extractDescription(config, profileMeta),
    soul,
    systemPrompt: soul,
    memory,
    userContext,
    avatar,
    emoji,
    color,
    envPath: fs.existsSync(envPath) ? envPath : undefined,
    hasEnv: fs.existsSync(envPath),
    sessionsDir: fs.existsSync(sessionsDir) ? sessionsDir : undefined,
    skillsDir: fs.existsSync(skillsDir) ? skillsDir : undefined,
  }
}

export function setActiveProfile(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name is required')
  // "default" or "general" means clear the active_profile file (revert to default)
  if (trimmed === 'default' || trimmed === 'general') {
    if (stickyActiveProfileEnabled()) {
      const activePath = getActiveProfilePath()
      if (fs.existsSync(activePath)) fs.unlinkSync(activePath)
    }
    return
  }
  const normalized = validateProfileName(trimmed)
  const profilePath = path.join(getProfilesRoot(), normalized)
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  if (stickyActiveProfileEnabled()) {
    fs.mkdirSync(getClaudeRoot(), { recursive: true })
    fs.writeFileSync(getActiveProfilePath(), `${normalized}\n`, 'utf-8')
  }
  console.warn(
    `[profiles] Active profile set to "${normalized}". Restart the Hermes Agent gateway for this profile switch to take effect.`,
  )
}

export function createProfile(
  name: string,
  options?: {
    cloneFrom?: string
    model?: string
    provider?: string
    description?: string
    soul?: string
    avatar?: string
    emoji?: string
    color?: string
  },
): ProfileDetail {
  const normalized = validateProfileName(name)
  const profilePath = path.join(getProfilesRoot(), normalized)
  if (fs.existsSync(profilePath)) throw new Error('Profile already exists')
  fs.mkdirSync(profilePath, { recursive: true })

  const configPath = path.join(profilePath, 'config.yaml')
  const envPath = path.join(profilePath, '.env')
  const soulPath = path.join(profilePath, 'SOUL.md')
  const profileYamlPath = path.join(profilePath, 'profile.yaml')
  const memoriesDir = path.join(profilePath, 'memories')

  // Clone config from source profile if specified
  if (options?.cloneFrom) {
    const sourceName = validateProfileIdentifier(options.cloneFrom)
    // The 'default' profile lives at ~/.hermes, not ~/.hermes/profiles/default
    const sourceRoot =
      sourceName === 'default' || sourceName === 'general'
        ? getClaudeRoot()
        : path.join(getProfilesRoot(), sourceName)
    const sourceConfigPath = path.join(sourceRoot, 'config.yaml')
    if (fs.existsSync(sourceConfigPath)) {
      fs.copyFileSync(sourceConfigPath, configPath)
    } else {
      fs.writeFileSync(
        configPath,
        YAML.stringify({ model: '', provider: '' }),
        'utf-8',
      )
    }

    const sourceEnvPath = path.join(sourceRoot, '.env')
    if (fs.existsSync(sourceEnvPath)) {
      fs.copyFileSync(sourceEnvPath, envPath)
    }

    const sourceSoulPath = path.join(sourceRoot, 'SOUL.md')
    if (fs.existsSync(sourceSoulPath)) {
      fs.copyFileSync(sourceSoulPath, soulPath)
    }

    const sourceProfileYaml = path.join(sourceRoot, 'profile.yaml')
    if (fs.existsSync(sourceProfileYaml)) {
      fs.copyFileSync(sourceProfileYaml, profileYamlPath)
    }

    const sourceMemoriesDir = path.join(sourceRoot, 'memories')
    if (fs.existsSync(sourceMemoriesDir)) {
      fs.mkdirSync(memoriesDir, { recursive: true })
      for (const memFile of ['MEMORY.md', 'USER.md']) {
        const srcF = path.join(sourceMemoriesDir, memFile)
        if (fs.existsSync(srcF)) {
          fs.copyFileSync(srcF, path.join(memoriesDir, memFile))
        }
      }
    }
  } else {
    fs.writeFileSync(
      configPath,
      YAML.stringify({ model: '', provider: '' }),
      'utf-8',
    )
    fs.writeFileSync(
      envPath,
      '# Per-profile secrets for this Hermes profile.\n# API keys and tokens set here override the shell environment.\n# Behavioral settings belong in config.yaml, not here.\n',
      'utf-8',
    )
    fs.writeFileSync(
      soulPath,
      options?.soul || '# Role & Identity\n',
      'utf-8',
    )
    fs.mkdirSync(memoriesDir, { recursive: true })
  }

  // Explicit soul override
  if (options?.soul !== undefined) {
    fs.writeFileSync(soulPath, options.soul, 'utf-8')
  }

  // Override model/provider if specified
  if (options?.model || options?.provider) {
    const config = readYamlConfig(configPath)
    const currentModelObj =
      config.model && typeof config.model === 'object' && !Array.isArray(config.model)
        ? (config.model as Record<string, unknown>)
        : {}
    const newModelStr = options.model ? options.model.trim() : typeof currentModelObj.default === 'string' ? currentModelObj.default : ''
    const newProviderStr = options.provider ? options.provider.trim() : (newModelStr.includes('/') ? newModelStr.split('/')[0] : (typeof currentModelObj.provider === 'string' ? currentModelObj.provider : ''))

    config.model = {
      ...currentModelObj,
      default: newModelStr,
      provider: newProviderStr,
    }
    fs.writeFileSync(configPath, YAML.stringify(config), 'utf-8')
  }

  // Write profile.yaml metadata if provided
  if (options?.description !== undefined || options?.avatar !== undefined || options?.emoji !== undefined || options?.color !== undefined) {
    const currentProfileMeta = readProfileMetaYaml(profilePath)
    if (options.description !== undefined) currentProfileMeta.description = options.description.trim()
    if (options.avatar !== undefined) currentProfileMeta.avatar = options.avatar.trim()
    if (options.emoji !== undefined) currentProfileMeta.emoji = options.emoji.trim()
    if (options.color !== undefined) currentProfileMeta.color = options.color.trim()
    fs.writeFileSync(profileYamlPath, YAML.stringify(currentProfileMeta), 'utf-8')
  }

  // Create subdirectories
  fs.mkdirSync(path.join(profilePath, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(profilePath, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(profilePath, 'memories'), { recursive: true })
  fs.mkdirSync(path.join(profilePath, 'workspace'), { recursive: true })
  fs.mkdirSync(path.join(profilePath, 'cron'), { recursive: true })
  fs.mkdirSync(path.join(profilePath, 'logs'), { recursive: true })
  fs.mkdirSync(path.join(profilePath, 'plans'), { recursive: true })

  return readProfile(normalized)
}

export function deleteProfile(name: string): void {
  const normalized = validateProfileName(name)
  if (normalized === getActiveProfileName())
    throw new Error('Cannot delete the active profile')
  const profilePath = path.join(getProfilesRoot(), normalized)
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  const trashDir = path.join(getClaudeRoot(), 'trash')
  fs.mkdirSync(trashDir, { recursive: true })
  const trashName = `${normalized}-${Date.now()}`
  fs.renameSync(profilePath, path.join(trashDir, trashName))
}

export function updateProfileConfig(
  name: string,
  patch: Record<string, unknown>,
): ProfileDetail {
  const normalized = name.trim() || 'default'
  const isDefault = normalized === 'default' || normalized === 'general'
  const profilePath =
    isDefault
      ? getClaudeRoot()
      : path.join(getProfilesRoot(), validateProfileName(normalized))
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  const configPath = path.join(profilePath, 'config.yaml')
  const current = readYamlConfig(configPath)
  const updates = { ...patch }

  // 1. Handle soul / system_prompt -> write directly to SOUL.md & clear config.system_prompt
  if ('soul' in updates || 'system_prompt' in updates) {
    const soulVal = updates.soul !== undefined ? updates.soul : updates.system_prompt
    const soulText = typeof soulVal === 'string' ? soulVal : ''
    fs.writeFileSync(path.join(profilePath, 'SOUL.md'), soulText, 'utf-8')
    delete updates.soul
    delete updates.system_prompt
    delete current.system_prompt
  }

  // 2. Handle memory -> write to memories/MEMORY.md
  if ('memory' in updates) {
    const memText = typeof updates.memory === 'string' ? updates.memory : ''
    const memDir = path.join(profilePath, 'memories')
    fs.mkdirSync(memDir, { recursive: true })
    fs.writeFileSync(path.join(memDir, 'MEMORY.md'), memText, 'utf-8')
    delete updates.memory
  }

  // 3. Handle userContext -> write to memories/USER.md
  if ('userContext' in updates) {
    const userText = typeof updates.userContext === 'string' ? updates.userContext : ''
    const memDir = path.join(profilePath, 'memories')
    fs.mkdirSync(memDir, { recursive: true })
    fs.writeFileSync(path.join(memDir, 'USER.md'), userText, 'utf-8')
    delete updates.userContext
  }

  // 4. Handle profile.yaml fields (description, avatar, emoji, color)
  const metaKeys = ['description', 'avatar', 'emoji', 'color']
  const hasMetaUpdates = metaKeys.some((k) => k in updates)
  if (hasMetaUpdates) {
    const profileYamlPath = path.join(profilePath, 'profile.yaml')
    const currentMeta = readProfileMetaYaml(profilePath)
    for (const key of metaKeys) {
      if (key in updates) {
        const val = updates[key]
        if (val === null || val === '') {
          delete currentMeta[key]
        } else {
          currentMeta[key] = typeof val === 'string' ? val.trim() : val
        }
        delete updates[key]
      }
    }
    fs.writeFileSync(profileYamlPath, YAML.stringify(currentMeta), 'utf-8')
  }

  // 5. Handle model & provider in updates without breaking nested model object
  if ('model' in updates || 'provider' in updates) {
    const currentModelObj =
      current.model && typeof current.model === 'object' && !Array.isArray(current.model)
        ? (current.model as Record<string, unknown>)
        : {}
    let modelVal = typeof updates.model === 'string' ? updates.model.trim() : (typeof currentModelObj.default === 'string' ? currentModelObj.default : '')
    let providerVal = typeof updates.provider === 'string' ? updates.provider.trim() : ''

    if (!providerVal && modelVal.includes('/')) {
      providerVal = modelVal.split('/')[0]
    }
    if (!providerVal && typeof currentModelObj.provider === 'string') {
      providerVal = currentModelObj.provider
    }

    current.model = {
      ...currentModelObj,
      default: modelVal,
      ...(providerVal ? { provider: providerVal } : {}),
    }
    delete updates.model
    delete updates.provider
  }

  // Deep merge helper (same logic as claude-config.ts)
  function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ) {
    for (const [key, value] of Object.entries(source)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        target[key] &&
        typeof target[key] === 'object'
      ) {
        deepMerge(
          target[key] as Record<string, unknown>,
          value as Record<string, unknown>,
        )
      } else {
        target[key] = value
      }
    }
  }

  // Handle null values as explicit removals
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      delete current[key]
      delete updates[key]
    }
  }
  deepMerge(current, updates)

  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, YAML.stringify(current), 'utf-8')
  return readProfile(normalized)
}

export function renameProfile(oldName: string, newName: string): ProfileDetail {
  const from = validateProfileName(oldName)
  const to = validateProfileName(newName)
  const fromPath = path.join(getProfilesRoot(), from)
  const toPath = path.join(getProfilesRoot(), to)
  if (!fs.existsSync(fromPath)) throw new Error('Profile not found')
  if (fs.existsSync(toPath)) throw new Error('Target profile already exists')
  fs.renameSync(fromPath, toPath)
  if (stickyActiveProfileEnabled() && getActiveProfileName() === from) {
    fs.writeFileSync(getActiveProfilePath(), `${to}\n`, 'utf-8')
  }
  return readProfile(to)
}

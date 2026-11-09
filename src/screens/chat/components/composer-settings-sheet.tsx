'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Folder01Icon,
  FolderOpenIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { formatModelName } from '@/lib/format-model-name'
import type { useSessionProjectSelection } from '@/components/projects/project-session-chip'
import { ProjectModal } from '@/components/projects/project-modal'

export type SessionProjectSelection = ReturnType<typeof useSessionProjectSelection>

export type ComposerThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'adaptive'

export const EFFORT_OPTIONS: Array<[ComposerThinkingLevel, string]> = [
  ['off', 'None'],
  ['low', 'Low'],
  ['medium', 'Med'],
  ['high', 'High'],
]

export function effortLabel(level: ComposerThinkingLevel): string {
  if (level === 'off') return 'None'
  if (level === 'low') return 'Low'
  if (level === 'medium') return 'Medium'
  if (level === 'adaptive') return 'Auto'
  return 'High'
}

/** Compact segmented control for reasoning effort / thinking level. */
export function EffortSegmented({
  value,
  onChange,
  size = 'sm',
  className,
}: {
  value: ComposerThinkingLevel
  onChange: (level: ComposerThinkingLevel) => void
  size?: 'sm' | 'lg'
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Thinking effort"
      className={cn(
        'grid grid-cols-4 gap-0.5 rounded-xl bg-neutral-100 p-0.5 dark:bg-neutral-800',
        className,
      )}
    >
      {EFFORT_OPTIONS.map(([level, label]) => {
        const selected = value === level
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={(event) => {
              event.stopPropagation()
              onChange(level)
            }}
            className={cn(
              'rounded-[10px] font-medium transition-all cursor-pointer',
              size === 'lg' ? 'py-2 text-sm' : 'py-1 text-xs',
              selected
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-950 dark:text-neutral-50'
                : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Small brain glyph used for the effort indicator. */
export function BrainGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  )
}

/** Person glyph used for the agent/profile indicator. */
export function ProfileGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

type SheetProfile = {
  name: string
  model?: string
  provider?: string
}

type ComposerSettingsSheetProps = {
  open: boolean
  onClose: () => void
  // Agent profile
  profiles: Array<SheetProfile>
  activeProfileName: string
  profilePending?: boolean
  profilesError?: boolean
  onSelectProfile: (name: string) => void
  // Project
  showProject: boolean
  project: SessionProjectSelection
  // Model + effort
  modelLabel: string
  modelDisabled?: boolean
  onOpenModelPicker: () => void
  thinkingLevel: ComposerThinkingLevel
  onThinkingChange: (level: ComposerThinkingLevel) => void
}

/**
 * Mobile bottom sheet that surfaces every chat control that does not fit in
 * the compact composer toolbar: agent profile, project, model and effort.
 */
export function ComposerSettingsSheet({
  open,
  onClose,
  profiles,
  activeProfileName,
  profilePending,
  profilesError,
  onSelectProfile,
  showProject,
  project,
  modelLabel,
  modelDisabled,
  onOpenModelPicker,
  thinkingLevel,
  onThinkingChange,
}: ComposerSettingsSheetProps) {
  const [projectModalOpen, setProjectModalOpen] = useState(false)

  if (typeof document === 'undefined') return null

  return (
    <>
      {open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close chat settings"
                className="fixed inset-0 z-[199] bg-black/30"
                onClick={onClose}
              />
              <div
                className="fixed inset-x-0 bottom-0 z-[200] flex max-h-[85dvh] flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-neutral-900 animate-in slide-in-from-bottom-10 duration-200"
                style={{
                  paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)',
                }}
                role="dialog"
                aria-label="Chat settings"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                    Chat settings
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="size-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 active:scale-95"
                    aria-label="Close chat settings"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 space-y-5">
                  {/* Model + effort */}
                  <section>
                    <SectionLabel>Model</SectionLabel>
                    <button
                      type="button"
                      disabled={modelDisabled}
                      onClick={onOpenModelPicker}
                      className="flex w-full min-h-[48px] items-center justify-between gap-3 rounded-xl border border-neutral-200/70 bg-neutral-50 px-3.5 py-2.5 text-left active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700/60 dark:bg-neutral-800/50"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        {formatModelName(modelLabel)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-500">
                        Change
                        <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                      </span>
                    </button>
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        <BrainGlyph size={12} />
                        Thinking effort
                      </div>
                      <EffortSegmented
                        value={thinkingLevel}
                        onChange={onThinkingChange}
                        size="lg"
                      />
                    </div>
                  </section>

                  {/* Project */}
                  {showProject ? (
                    <section>
                      <SectionLabel>Project</SectionLabel>
                      <div className="space-y-1">
                        <OptionRow
                          selected={project.isPersonalSandbox}
                          onClick={() => project.handleSelect(null)}
                          icon={<HugeiconsIcon icon={Folder01Icon} size={16} className="text-neutral-400" />}
                          title="None"
                          subtitle="No project"
                        />
                        {project.projects.map((proj) => {
                          const selected = project.effectiveProjectId === proj.id
                          return (
                            <OptionRow
                              key={proj.id}
                              selected={selected}
                              onClick={() => project.handleSelect(proj.id)}
                              icon={
                                <HugeiconsIcon
                                  icon={selected ? FolderOpenIcon : Folder01Icon}
                                  size={16}
                                  className="text-accent-500"
                                />
                              }
                              title={proj.name}
                              subtitle={proj.primary_path || undefined}
                            />
                          )
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            onClose()
                            setProjectModalOpen(true)
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-accent-600 active:bg-neutral-100 dark:text-accent-400 dark:active:bg-neutral-800"
                        >
                          <HugeiconsIcon icon={PlusSignIcon} size={15} strokeWidth={2.2} />
                          New project…
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {/* Agent profile */}
                  <section>
                    <SectionLabel>Agent profile</SectionLabel>
                    <div className="space-y-1">
                      {profiles.map((profile) => {
                        const selected = profile.name === activeProfileName
                        const meta = [profile.model, profile.provider]
                          .map((v) => (typeof v === 'string' ? v.trim() : ''))
                          .filter(Boolean)
                          .join(' · ')
                        return (
                          <OptionRow
                            key={profile.name}
                            selected={selected}
                            disabled={profilePending}
                            onClick={() => {
                              if (!selected) onSelectProfile(profile.name)
                            }}
                            icon={
                              <span className="flex size-6 items-center justify-center rounded-full bg-primary-100 text-[11px] font-semibold uppercase text-primary-600 dark:bg-primary-800 dark:text-primary-200">
                                {profile.name.slice(0, 1)}
                              </span>
                            }
                            title={profile.name}
                            subtitle={meta || undefined}
                          />
                        )
                      })}
                      {profilesError ? (
                        <div className="px-3 py-2 text-xs text-red-500">
                          Failed to load profiles
                        </div>
                      ) : null}
                    </div>
                  </section>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
      <ProjectModal open={projectModalOpen} onOpenChange={setProjectModalOpen} />
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
      {children}
    </div>
  )
}

function OptionRow({
  selected,
  disabled,
  onClick,
  icon,
  title,
  subtitle,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3.5 py-2 text-left transition-colors disabled:opacity-60',
        selected
          ? 'bg-accent-500/10 text-accent-700 dark:text-accent-300'
          : 'text-neutral-800 active:bg-neutral-100 dark:text-neutral-200 dark:active:bg-neutral-800',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', selected ? 'font-semibold' : 'font-medium')}>
          {title}
        </span>
        {subtitle ? (
          <span className="block truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
            {subtitle}
          </span>
        ) : null}
      </span>
      {selected ? (
        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="shrink-0 text-accent-600" />
      ) : null}
    </button>
  )
}

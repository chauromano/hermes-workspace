import { describe, expect, it } from 'vitest'
import { NATIVE_CONDUCTOR_MODE_NOTE, buildNativeConductorAssignments, toNativeConductorMissionRecord } from './conductor-spawn'
import type { SwarmMission } from '../../server/swarm-missions'

describe('native Conductor fallback', () => {
  it('labels native-swarm as the official OOTB fallback when dashboard Conductor is unavailable', () => {
    expect(NATIVE_CONDUCTOR_MODE_NOTE).toContain('official Workspace-native Swarm fallback')
    expect(NATIVE_CONDUCTOR_MODE_NOTE).toContain('dashboard Conductor API')
  })

  it('decomposes production missions onto named Workspace Swarm lanes', () => {
    const assignments = buildNativeConductorAssignments('Fix conductor and make it production ready', {
      maxParallel: 4,
      supervised: false,
    })

    expect(assignments.map((assignment) => assignment.workerId)).toEqual(['ops-watch', 'builder', 'reviewer', 'qa'])
    expect(assignments[0].task).toContain('Conductor mission: Fix conductor')
    expect(assignments.every((assignment) => assignment.direct === true)).toBe(true)
    expect(assignments.every((assignment) => assignment.reviewRequired === false)).toBe(true)
  })

  it('uses KM Agent when the mission asks for documentation even with a smaller lane count', () => {
    const assignments = buildNativeConductorAssignments('Write docs and handoff for the release', {
      maxParallel: 3,
      supervised: true,
    })

    expect(assignments.map((assignment) => assignment.workerId)).toContain('km-agent')
    expect(assignments.some((assignment) => assignment.task.includes('Supervised mode'))).toBe(true)
  })

  it('does not collapse generic two-lane missions to a single worker', () => {
    const assignments = buildNativeConductorAssignments('Create a small UI prototype', {
      maxParallel: 2,
      supervised: false,
    })

    expect(assignments.map((assignment) => assignment.workerId)).toEqual(['builder', 'reviewer'])
  })

  it('uses custom project roster workers when provided', () => {
    const customWorkers = [
      {
        id: 'orchestrator',
        name: 'Orchestrator',
        role: 'Orchestrator',
        specialty: 'routing',
        model: 'GPT-5.5',
        mission: 'Coordinate work',
        skills: [],
        tools: [],
        capabilities: [],
        preferredTaskTypes: [],
        modes: [],
        plugins: [],
        pluginToolsets: [],
        mcpServers: [],
        greenlightRequiredFor: [],
        maxConcurrentTasks: 1,
        acceptsBroadcast: true,
        reviewRequired: false,
      },
      {
        id: 'vault-indexer',
        name: 'Vault Indexer',
        role: 'Knowledge Steward',
        specialty: 'Markdown wikilinks',
        model: 'qwen2.5-coder',
        mission: 'Index and organize Obsidian notes.',
        skills: ['obsidian-cli'],
        tools: [],
        capabilities: [],
        preferredTaskTypes: [],
        modes: [],
        plugins: [],
        pluginToolsets: [],
        mcpServers: [],
        greenlightRequiredFor: [],
        maxConcurrentTasks: 1,
        acceptsBroadcast: true,
        reviewRequired: false,
      },
      {
        id: 'summarizer',
        name: 'Summarizer',
        role: 'Note Synthesizer',
        specialty: 'Executive briefings',
        model: 'GPT-5.5',
        mission: 'Summarize meeting and literature notes.',
        skills: [],
        tools: [],
        capabilities: [],
        preferredTaskTypes: [],
        modes: [],
        plugins: [],
        pluginToolsets: [],
        mcpServers: [],
        greenlightRequiredFor: [],
        maxConcurrentTasks: 1,
        acceptsBroadcast: true,
        reviewRequired: false,
      },
    ]

    const assignments = buildNativeConductorAssignments('Index new research notes and summarize meetings', {
      maxParallel: 2,
      supervised: false,
      rosterWorkers: customWorkers,
    })

    expect(assignments.map((a) => a.workerId)).toEqual(['vault-indexer', 'summarizer'])
    expect(assignments[0].task).toContain('Lane: Vault Indexer / Knowledge Steward.')
    expect(assignments[0].task).toContain('Specialty focus: Markdown wikilinks.')
    expect(assignments[1].task).toContain('Lane: Summarizer / Note Synthesizer.')
  })

  it('routes to best matching squad workers and appends reviewer when worker is review-gated', () => {
    const squad = [
      {
        id: 'dev',
        name: 'Dev',
        role: 'Full-Stack Developer',
        specialty: 'React and API code',
        model: 'Worker',
        mission: 'Write code',
        skills: [],
        tools: [],
        capabilities: [],
        preferredTaskTypes: ['code', 'build'],
        modes: [],
        plugins: [],
        pluginToolsets: [],
        mcpServers: [],
        greenlightRequiredFor: [],
        maxConcurrentTasks: 1,
        acceptsBroadcast: true,
        reviewRequired: true,
      },
      {
        id: 'researcher',
        name: 'Researcher',
        role: 'Research Agent',
        specialty: 'Web and academic search',
        model: 'Worker',
        mission: 'Research stuff',
        skills: [],
        tools: [],
        capabilities: [],
        preferredTaskTypes: ['research'],
        modes: [],
        plugins: [],
        pluginToolsets: [],
        mcpServers: [],
        greenlightRequiredFor: [],
        maxConcurrentTasks: 1,
        acceptsBroadcast: true,
        reviewRequired: false,
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        role: 'Code Reviewer',
        specialty: 'Security and regression review',
        model: 'Worker',
        mission: 'Review diffs',
        skills: [],
        tools: [],
        capabilities: [],
        preferredTaskTypes: ['review', 'security'],
        modes: [],
        plugins: [],
        pluginToolsets: [],
        mcpServers: [],
        greenlightRequiredFor: [],
        maxConcurrentTasks: 1,
        acceptsBroadcast: true,
        reviewRequired: false,
      },
    ]

    const assignments = buildNativeConductorAssignments('Implement a new React UI component and fix button styles', {
      maxParallel: 2,
      supervised: false,
      rosterWorkers: squad,
    })

    // 'dev' has highest score for code/ui. Since dev has reviewRequired: true and maxParallel=2,
    // reviewer should be auto-included as the 2nd lane.
    expect(assignments.map((a) => a.workerId)).toEqual(['dev', 'reviewer'])
    expect(assignments[0].reviewRequired).toBe(true)
    expect(assignments[1].reviewRequired).toBe(false)
  })

  it('normalizes native swarm missions into the Conductor mission status contract', () => {
    const mission: SwarmMission = {
      id: 'conductor-test',
      title: 'Conductor: smoke',
      state: 'executing',
      createdAt: 1,
      updatedAt: 2,
      assignments: [
        {
          id: 'a1',
          workerId: 'builder',
          task: 'Run smoke',
          rationale: 'Builder',
          dependsOn: [],
          reviewRequired: false,
          state: 'dispatched',
          dispatchedAt: 1,
          completedAt: null,
          reviewedAt: null,
          reviewedBy: null,
          checkpoint: null,
        },
      ],
      events: [
        { id: 'e1', type: 'created', at: 1, message: 'Mission created' },
      ],
    }

    const record = toNativeConductorMissionRecord(mission)
    expect(record.id).toBe('conductor-test')
    expect(record.status).toBe('running')
    expect(record.nativeSwarm).toBe(true)
    expect(record.modeOfficialOotb).toBe(true)
    expect(record.modeNote).toBe(NATIVE_CONDUCTOR_MODE_NOTE)
    expect(record.lines.join('\n')).toContain('builder dispatched')
  })
})

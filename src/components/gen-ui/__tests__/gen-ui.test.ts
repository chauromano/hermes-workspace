import { describe, expect, it } from 'vitest'
import {
  parseInlineGenUiBlocks,
  splitGenUiToolSections,
} from '../parser'
import {
  ChartPropsSchema,
  ComparisonCardsPropsSchema,
  DataTablePropsSchema,
  KpiGridPropsSchema,
  safeParseGenUiJson,
} from '../schemas'

describe('Gen-UI Parser & Schemas', () => {
  it('parses completed <gen-ui> tags and strips them from cleanedText', () => {
    const input = `Here is the cluster overview:\n\n<gen-ui component="kpi_grid" title="Cluster KPIs">\n{"columns":2,"items":[{"label":"CPU","value":"24%","status":"healthy"}]}\n</gen-ui>\n\nAll systems nominal.`
    const result = parseInlineGenUiBlocks(input, false)

    expect(result.cleanedText).toBe(
      'Here is the cluster overview:\n\nAll systems nominal.',
    )
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]?.component).toBe('kpi_grid')
    expect(result.blocks[0]?.title).toBe('Cluster KPIs')
    expect(result.blocks[0]?.isStreaming).toBe(false)

    const kpiCheck = KpiGridPropsSchema.safeParse(result.blocks[0]?.props)
    expect(kpiCheck.success).toBe(true)
  })

  it('detects unclosed <gen-ui> tags during active streaming without leaking raw JSON', () => {
    const streamingInput = `Analyzing metrics...\n<gen-ui component="chart" title="Latency">\n{"chartType":"bar","data":[{"name":"A"`
    const result = parseInlineGenUiBlocks(streamingInput, true)

    expect(result.cleanedText).toBe('Analyzing metrics...')
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]?.isStreaming).toBe(true)
    expect(result.blocks[0]?.component).toBe('chart')
  })

  it('parses ```gen-ui fenced blocks', () => {
    const fenced = '```gen-ui component="comparison_cards" title="Options"\n{"items":[{"title":"Option A","recommended":true}]}\n```'
    const result = parseInlineGenUiBlocks(fenced, false)
    expect(result.cleanedText).toBe('')
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]?.component).toBe('comparison_cards')
    expect(
      ComparisonCardsPropsSchema.safeParse(result.blocks[0]?.props).success,
    ).toBe(true)
  })

  it('separates render_ui tool calls from regular tool sections', () => {
    const sections = [
      {
        key: 'call-1',
        type: 'terminal',
        input: { command: 'docker ps' },
        outputText: 'ok',
        state: 'output-available',
      },
      {
        key: 'call-2',
        type: 'render_ui',
        input: {
          component: 'data_table',
          title: 'Containers',
          props: {
            columns: [{ key: 'name', label: 'Name' }],
            rows: [{ name: 'hermes-gateway' }],
          },
        },
        outputText: '',
        state: 'output-available',
      },
    ]

    const { regularToolSections, toolGenUiBlocks } =
      splitGenUiToolSections(sections)
    expect(regularToolSections).toHaveLength(1)
    expect(regularToolSections[0]?.type).toBe('terminal')
    expect(toolGenUiBlocks).toHaveLength(1)
    expect(toolGenUiBlocks[0]?.component).toBe('data_table')
    expect(
      DataTablePropsSchema.safeParse(toolGenUiBlocks[0]?.props).success,
    ).toBe(true)
  })

  it('validates chart schema defaults', () => {
    const raw = safeParseGenUiJson(
      '{"chartType":"line","xKey":"day","data":[{"day":"Mon","count":5}]}',
    )
    expect(raw.ok).toBe(true)
    if (raw.ok) {
      const parsed = ChartPropsSchema.safeParse(raw.data)
      expect(parsed.success).toBe(true)
    }
  })
})

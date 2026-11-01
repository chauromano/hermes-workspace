import { z } from 'zod'

export const GEN_UI_COMPONENTS = [
  'chart',
  'data_table',
  'kpi_grid',
  'comparison_cards',
  'interactive_form',
  'a2ui_surface',
  'architecture_canvas',
  'mindmap',
  'c4_diagram',
  'plantuml',
  'schema_form',
] as const

export type GenUiComponentType = (typeof GEN_UI_COMPONENTS)[number]

// 1. Chart Schema
export const ChartSeriesSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
})

export const ChartPropsSchema = z.object({
  chartType: z.enum(['bar', 'line', 'area', 'pie']).default('bar'),
  data: z.array(z.record(z.string(), z.unknown())).default([]),
  xKey: z.string().default('name'),
  series: z.array(ChartSeriesSchema).default([]),
  height: z.number().min(160).max(600).optional().default(280),
  subtitle: z.string().optional(),
})

export type ChartProps = z.infer<typeof ChartPropsSchema>

// 2. Data Table Schema
export const DataTableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(['left', 'center', 'right']).optional().default('left'),
  badge: z.boolean().optional().default(false),
})

export const DataTablePropsSchema = z.object({
  columns: z.array(DataTableColumnSchema).default([]),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  searchable: z.boolean().optional().default(true),
  pageSize: z.number().min(3).max(50).optional().default(8),
  rowActionLabel: z.string().optional(),
  rowActionPromptTemplate: z.string().optional(),
})

export type DataTableProps = z.infer<typeof DataTablePropsSchema>

// 3. KPI Grid Schema
export const KpiItemSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  delta: z.string().optional(),
  trend: z.enum(['up', 'down', 'neutral']).optional().default('neutral'),
  subtext: z.string().optional(),
  status: z.enum(['healthy', 'warning', 'error', 'info']).optional(),
})

export const KpiGridPropsSchema = z.object({
  columns: z.number().min(1).max(4).optional().default(3),
  items: z.array(KpiItemSchema).default([]),
})

export type KpiGridProps = z.infer<typeof KpiGridPropsSchema>

// 4. Comparison Cards Schema
export const ComparisonItemSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  recommended: z.boolean().optional().default(false),
  metrics: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional()
    .default([]),
  pros: z.array(z.string()).optional().default([]),
  cons: z.array(z.string()).optional().default([]),
  actionLabel: z.string().optional(),
  actionPrompt: z.string().optional(),
})

export const ComparisonCardsPropsSchema = z.object({
  items: z.array(ComparisonItemSchema).default([]),
})

export type ComparisonCardsProps = z.infer<typeof ComparisonCardsPropsSchema>

// 5. Interactive Form Schema
export const FormFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z
    .enum(['text', 'number', 'select', 'checkbox', 'textarea'])
    .default('text'),
  options: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  required: z.boolean().optional().default(false),
  placeholder: z.string().optional(),
})

export const InteractiveFormPropsSchema = z.object({
  description: z.string().optional(),
  submitLabel: z.string().optional().default('Submit Response'),
  fields: z.array(FormFieldSchema).default([]),
})

export type InteractiveFormProps = z.infer<typeof InteractiveFormPropsSchema>

// 6. A2UI Declarative Surface Schema
export type A2UINode = {
  type:
    | 'card'
    | 'grid'
    | 'stack'
    | 'stat'
    | 'badge'
    | 'alert'
    | 'tabs'
    | 'table'
    | 'button'
    | 'text'
    | 'divider'
  title?: string
  subtitle?: string
  content?: string
  value?: string | number
  delta?: string
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  columns?: number
  direction?: 'row' | 'col'
  actionPrompt?: string
  headers?: Array<string>
  rows?: Array<Array<string | number>>
  tabs?: Array<{ label: string; children: Array<A2UINode> }>
  children?: Array<A2UINode>
}

export const A2UISurfacePropsSchema = z.object({
  root: z.record(z.string(), z.unknown()).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
})

// 7. Interactive Architecture Canvas Schema (@xyflow/react + dagre)
export const ArchitectureNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z
    .enum(['default', 'system', 'container', 'database', 'external', 'user'])
    .optional()
    .default('default'),
  technology: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['healthy', 'warning', 'error', 'info']).optional(),
  actionPrompt: z.string().optional(),
})

export const ArchitectureEdgeSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  animated: z.boolean().optional().default(false),
})

export const ArchitectureCanvasPropsSchema = z.object({
  direction: z.enum(['TB', 'LR', 'BT', 'RL']).optional().default('TB'),
  nodes: z.array(ArchitectureNodeSchema).default([]),
  edges: z.array(ArchitectureEdgeSchema).default([]),
  height: z.number().min(240).max(800).optional().default(420),
})

export type ArchitectureCanvasProps = z.infer<typeof ArchitectureCanvasPropsSchema>

// 8. Mind Map Schema (markmap-view)
export const MindmapPropsSchema = z.object({
  markdown: z.string().optional(),
  content: z.string().optional(),
  height: z.number().min(200).max(800).optional().default(380),
})

export type MindmapProps = z.infer<typeof MindmapPropsSchema>

// 9. C4 Diagram & Flowchart Schema (mermaid)
export const C4DiagramPropsSchema = z.object({
  chartDefinition: z.string().optional(),
  code: z.string().optional(),
  diagramType: z
    .enum(['C4Context', 'C4Container', 'C4Component', 'C4Deployment', 'flowchart', 'sequenceDiagram'])
    .optional(),
  height: z.number().min(180).max(800).optional(),
})

export type C4DiagramProps = z.infer<typeof C4DiagramPropsSchema>

// 10. PlantUML Diagram Schema (plantuml-encoder)
export const PlantUMLPropsSchema = z.object({
  code: z.string().optional(),
  server: z.string().optional().default('https://www.plantuml.com/plantuml'),
})

export type PlantUMLProps = z.infer<typeof PlantUMLPropsSchema>

// 11. Schema Form Schema (@rjsf/core)
export const SchemaFormPropsSchema = z.object({
  schema: z.record(z.string(), z.unknown()),
  uiSchema: z.record(z.string(), z.unknown()).optional(),
  formData: z.record(z.string(), z.unknown()).optional(),
  submitLabel: z.string().optional().default('Submit Form'),
})

export type SchemaFormProps = z.infer<typeof SchemaFormPropsSchema>

export type GenUiBlock = {
  id: string
  component: GenUiComponentType | string
  title: string
  rawPayload: string
  props: Record<string, unknown> | null
  isStreaming: boolean
  error?: string
}

export function safeParseGenUiJson(
  raw: string,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json|gen-ui|a2ui|mermaid|plantuml)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  if (!trimmed) {
    return { ok: false, error: 'Empty payload' }
  }

  // Handle bare markdown or raw plantuml/mermaid strings
  if (
    trimmed.startsWith('@startuml') ||
    trimmed.startsWith('C4') ||
    trimmed.startsWith('flowchart') ||
    trimmed.startsWith('graph ')
  ) {
    return { ok: true, data: { code: trimmed, chartDefinition: trimmed } }
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, data: parsed as Record<string, unknown> }
    }
    if (Array.isArray(parsed)) {
      return { ok: true, data: { items: parsed, data: parsed, rows: parsed } }
    }
    return { ok: false, error: 'Payload must be a JSON object' }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON syntax',
    }
  }
}

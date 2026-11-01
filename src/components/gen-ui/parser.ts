import { safeParseGenUiJson } from './schemas'
import type { GenUiBlock } from './schemas'

export type GenUiParseResult = {
  cleanedText: string
  blocks: Array<GenUiBlock>
}

function parseTagAttributes(rawAttributes: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const attributeRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  for (const match of rawAttributes.matchAll(attributeRegex)) {
    const key = (match[1] || '').trim().toLowerCase()
    const value = (match[2] || match[3] || match[4] || '').trim()
    if (key) {
      attributes[key] = value
    }
  }
  return attributes
}

/**
 * Extracts <gen-ui component="..." title="...">JSON</gen-ui> and ```gen-ui / ```a2ui
 * fences from assistant text. Also detects an in-progress unclosed <gen-ui ...> tag at
 * the end of streaming text so raw JSON does not flash in the chat bubble.
 */
export function parseInlineGenUiBlocks(
  text: string,
  isStreaming = false,
): GenUiParseResult {
  if (!text) return { cleanedText: '', blocks: [] }

  const blocks: Array<GenUiBlock> = []
  let index = 0

  // 1. Match completed <gen-ui ...>...</gen-ui> tags
  let workingText = text.replace(
    /<gen-ui\b([^>]*)>([\s\S]*?)<\/gen-ui>/gi,
    (_, rawAttrs: string, rawBody: string) => {
      const attrs = parseTagAttributes(rawAttrs || '')
      const component = (attrs.component || attrs.type || 'a2ui_surface')
        .trim()
        .toLowerCase()
      const title = (attrs.title || 'Interactive View').trim()
      const body = (rawBody || '').trim()
      const parsed = safeParseGenUiJson(body)

      blocks.push({
        id: `gen-ui-tag-${index++}`,
        component,
        title,
        rawPayload: body,
        props: parsed.ok ? parsed.data : null,
        isStreaming: false,
        error: parsed.ok ? undefined : parsed.error,
      })
      return ''
    },
  )

  // 2. Match completed ```gen-ui or ```a2ui fenced blocks
  workingText = workingText.replace(
    /```(gen-ui|a2ui)\b([^\n]*)\n([\s\S]*?)```/gi,
    (_, fenceType: string, headerMeta: string, rawBody: string) => {
      const attrs = parseTagAttributes(headerMeta || '')
      const parsed = safeParseGenUiJson(rawBody || '')
      const inferredComponent =
        attrs.component ||
        attrs.type ||
        (parsed.ok && typeof parsed.data.component === 'string'
          ? parsed.data.component
          : fenceType.toLowerCase() === 'a2ui'
            ? 'a2ui_surface'
            : 'chart')
      const inferredTitle =
        attrs.title ||
        (parsed.ok && typeof parsed.data.title === 'string'
          ? parsed.data.title
          : 'Interactive Widget')
      const resolvedProps =
        parsed.ok &&
        parsed.data.props &&
        typeof parsed.data.props === 'object' &&
        !Array.isArray(parsed.data.props)
          ? (parsed.data.props as Record<string, unknown>)
          : parsed.ok
            ? parsed.data
            : null

      blocks.push({
        id: `gen-ui-fence-${index++}`,
        component: String(inferredComponent).trim().toLowerCase(),
        title: String(inferredTitle).trim(),
        rawPayload: (rawBody || '').trim(),
        props: resolvedProps,
        isStreaming: false,
        error: parsed.ok ? undefined : parsed.error,
      })
      return ''
    },
  )

  // 3. Handle unclosed <gen-ui ...> tag during active streaming
  if (isStreaming) {
    const unclosedTagMatch = workingText.match(/<gen-ui\b([^>]*)>([\s\S]*)$/i)
    if (unclosedTagMatch && typeof unclosedTagMatch.index === 'number') {
      const attrs = parseTagAttributes(unclosedTagMatch[1] || '')
      const partialBody = (unclosedTagMatch[2] || '').trim()
      blocks.push({
        id: `gen-ui-streaming-${index++}`,
        component: (attrs.component || attrs.type || 'a2ui_surface')
          .trim()
          .toLowerCase(),
        title: (attrs.title || 'Generating Interactive UI…').trim(),
        rawPayload: partialBody,
        props: null,
        isStreaming: true,
      })
      workingText = workingText.slice(0, unclosedTagMatch.index)
    }
  }

  return {
    cleanedText: workingText.replace(/\n{3,}/g, '\n\n').trim(),
    blocks,
  }
}

export type ToolSectionLike = {
  key: string
  type: string
  input?: Record<string, unknown>
  outputText: string
  errorText?: string
  state: string
}

/**
 * Separates `render_ui` tool calls from normal tool sections so they render
 * as CopilotKit-style Generative UI widgets instead of TuiActivityCard debug rows.
 */
export function splitGenUiToolSections<T extends ToolSectionLike>(
  sections: Array<T>,
): {
  regularToolSections: Array<T>
  toolGenUiBlocks: Array<GenUiBlock>
} {
  const regularToolSections: Array<T> = []
  const toolGenUiBlocks: Array<GenUiBlock> = []

  for (const section of sections) {
    const normalizedName = (section.type || '').trim().toLowerCase()
    if (normalizedName !== 'render_ui' && normalizedName !== 'render_gen_ui') {
      regularToolSections.push(section)
      continue
    }

    const input = section.input || {}
    let payloadObj: Record<string, unknown> | null = null

    if (typeof input.component === 'string') {
      payloadObj =
        input.props && typeof input.props === 'object' && !Array.isArray(input.props)
          ? (input.props as Record<string, unknown>)
          : input
    } else if (section.outputText) {
      const parsedOut = safeParseGenUiJson(section.outputText)
      if (parsedOut.ok) {
        payloadObj =
          parsedOut.data.props &&
          typeof parsedOut.data.props === 'object' &&
          !Array.isArray(parsedOut.data.props)
            ? (parsedOut.data.props as Record<string, unknown>)
            : parsedOut.data
      }
    }

    const component =
      typeof input.component === 'string'
        ? input.component.trim().toLowerCase()
        : 'a2ui_surface'
    const title =
      typeof input.title === 'string' && input.title.trim()
        ? input.title.trim()
        : 'Interactive View'
    const isStreaming =
      section.state === 'input-streaming' || section.state === 'input-available'

    toolGenUiBlocks.push({
      id: `gen-ui-tool-${section.key}`,
      component,
      title,
      rawPayload: JSON.stringify(input, null, 2),
      props: payloadObj,
      isStreaming: isStreaming && !payloadObj,
      error: section.errorText,
    })
  }

  return { regularToolSections, toolGenUiBlocks }
}

import YAML, { YAMLError } from "yaml"
import type { SourcePosition } from "../types"

interface YamlParseResult {
  data: Record<string, unknown>
  warning?: string
  position?: SourcePosition
}

import { isRecord } from "../utils"

export interface FrontmatterSplit {
  yamlText: string
  yamlOffset: number
  cooklangOffset: number
}

function preserveNewlinesAsSpaces(text: string): string {
  return text.replace(/[^\n\r]/g, " ")
}

function splitLinesInclusive(source: string): Array<{ line: string; offset: number }> {
  const lines: Array<{ line: string; offset: number }> = []
  let offset = 0

  while (offset < source.length) {
    const lineStart = offset
    while (offset < source.length && source[offset] !== "\n" && source[offset] !== "\r") {
      offset += 1
    }

    if (source[offset] === "\r" && source[offset + 1] === "\n") {
      offset += 2
    } else if (source[offset] === "\n" || source[offset] === "\r") {
      offset += 1
    }

    lines.push({ line: source.slice(lineStart, offset), offset: lineStart })
  }

  if (source.length === 0) {
    return []
  }

  return lines
}

function isYamlFenceLine(line: string): boolean {
  return line.trimEnd() === "---"
}

export function splitYamlFrontmatter(source: string): FrontmatterSplit | null {
  let firstFence: { start: number; end: number } | null = null

  for (const { line, offset } of splitLinesInclusive(source)) {
    if (!isYamlFenceLine(line)) continue

    const fence = { start: offset, end: offset + line.length }
    if (!firstFence) {
      firstFence = fence
      continue
    }

    return {
      yamlText: source.slice(firstFence.end, fence.start),
      yamlOffset: firstFence.end,
      cooklangOffset: fence.end,
    }
  }

  return null
}

export function maskFrontmatter(source: string, split: FrontmatterSplit | null): string {
  if (!split) return source
  return (
    preserveNewlinesAsSpaces(source.slice(0, split.cooklangOffset)) +
    source.slice(split.cooklangOffset)
  )
}

function computeYamlOffset(content: string, line: number, col: number): number {
  const linesAbove = content.split("\n").slice(0, line - 1)
  return linesAbove.reduce((sum, l) => sum + l.length + 1, 0) + col - 1
}

/** Lenient line-by-line `key: value` parser for frontmatter that isn't valid YAML. */
function parseFrontmatterLines(content: string): Record<string, string> | null {
  const data: Record<string, string> = {}
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx <= 0) return null
    const key = trimmed.slice(0, colonIdx).trim()
    const value = trimmed.slice(colonIdx + 1).trim()
    if (!key) return null
    data[key] = value
  }
  return Object.keys(data).length > 0 ? data : null
}

export function parseYamlFrontmatter(content: string, yamlStartOffset: number): YamlParseResult {
  try {
    const parsed = YAML.parse(content)
    if (parsed == null) {
      const fallback = parseFrontmatterLines(content)
      if (fallback) return { data: fallback }
      return { data: {} }
    }
    if (!isRecord(parsed)) {
      const fallback = parseFrontmatterLines(content)
      if (fallback) return { data: fallback }
      const typeName = Array.isArray(parsed) ? "an array" : `a ${typeof parsed}`
      return {
        data: {},
        warning: `Invalid YAML frontmatter: expected a key/value mapping, got ${typeName}`,
        position: { line: 2, column: 1, offset: yamlStartOffset },
      }
    }
    return { data: parsed }
  } catch (error: unknown) {
    const linePos = error instanceof YAMLError ? error.linePos : undefined
    const errorOffset = linePos?.[0]
      ? computeYamlOffset(content, linePos[0].line, linePos[0].col)
      : 0
    return {
      data: {},
      warning: `Invalid YAML frontmatter: ${error instanceof Error ? error.message : "parse error"}`,
      position: linePos?.[0]
        ? {
            line: linePos[0].line,
            column: linePos[0].col,
            offset: yamlStartOffset + errorOffset,
          }
        : undefined,
    }
  }
}

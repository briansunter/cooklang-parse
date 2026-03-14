interface CommentRange {
  start: number
  end: number
}

function processRecipeLine(
  line: string,
  lineOffset: number,
  inBlockCommentInput: boolean,
  commentRanges: CommentRange[],
): { line: string; inBlockComment: boolean } {
  let output = ""
  let idx = 0
  let inBlockComment = inBlockCommentInput
  let currentCommentStart = inBlockComment ? 0 : -1

  while (idx < line.length) {
    const ch = line[idx]
    const next = line[idx + 1]

    if (inBlockComment) {
      if (ch === "-" && next === "]") {
        if (currentCommentStart >= 0) {
          commentRanges.push({
            start: lineOffset + currentCommentStart,
            end: lineOffset + idx + 2,
          })
          currentCommentStart = -1
        }
        output += "  "
        idx += 2
        inBlockComment = false
        continue
      }

      output += " "
      idx += 1
      continue
    }

    if (ch === "[" && next === "-") {
      currentCommentStart = idx
      output += "  "
      idx += 2
      inBlockComment = true
      continue
    }

    output += ch ?? ""
    idx += 1
  }

  if (inBlockComment && currentCommentStart >= 0) {
    commentRanges.push({
      start: lineOffset + currentCommentStart,
      end: lineOffset + line.length,
    })
  }

  return { line: output, inBlockComment }
}

function isSectionLine(line: string): boolean {
  return line.startsWith("==") || line === "=" || /^=[^=@]/.test(line)
}

function shouldPreserveLine(line: string): boolean {
  return line.startsWith(">") || isSectionLine(line) || /^\s*>>/.test(line) || /^\s*-- /.test(line)
}

/**
 * Strip step-level block comments [- ... -] from source while preserving source offsets.
 * Returns both the transformed source and the stripped source ranges so text items can
 * later remove comment placeholders from user-facing output.
 */
export function stripBlockComments(source: string): {
  source: string
  commentRanges: CommentRange[]
} {
  let output = ""
  let idx = 0
  let inFrontmatter = false
  let frontmatterAllowed = true
  let inBlockComment = false
  const commentRanges: CommentRange[] = []

  while (idx < source.length) {
    const lineStart = idx

    while (idx < source.length && source[idx] !== "\n" && source[idx] !== "\r") {
      idx += 1
    }

    const line = source.slice(lineStart, idx)

    let newline = ""
    if (source[idx] === "\r" && source[idx + 1] === "\n") {
      newline = "\r\n"
      idx += 2
    } else if (source[idx] === "\n" || source[idx] === "\r") {
      newline = source[idx] ?? ""
      idx += 1
    }

    if (!inFrontmatter && frontmatterAllowed && line === "---") {
      inFrontmatter = true
      output += line + newline
      continue
    }

    if (inFrontmatter) {
      output += line + newline
      if (line === "---") {
        inFrontmatter = false
        frontmatterAllowed = false
      }
      continue
    }

    if (frontmatterAllowed && line.trim() !== "" && !/^\s*>>/.test(line)) {
      frontmatterAllowed = false
    }

    if (!inBlockComment && shouldPreserveLine(line)) {
      output += line + newline
      continue
    }

    const processed = processRecipeLine(line, lineStart, inBlockComment, commentRanges)
    output += processed.line + newline
    inBlockComment = processed.inBlockComment
  }

  return { source: output, commentRanges }
}

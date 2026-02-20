/** Strip block comments [- ... -] from source, preserving only newlines. */
export function stripBlockComments(source: string): string {
  return source.replace(/\[-[\s\S]*?-\]/g, match => {
    return match.replace(/[^\n]/g, "")
  })
}

/**
 * Normalize marker spacing variants accepted by cooklang-rs parser:
 * - `@ example{}` -> `@example{}`
 * - `# 10{}` -> `#10{}`
 * - `~ {5}` -> `~{5}`
 */
export function normalizeMarkerSpacing(source: string): string {
  return source
    .replace(/~([ \t]+)(?=\{)/g, "~")
    .replace(/@([ \t]+)(?=[^ \t\r\n][^\n]*\{)/g, "@")
    .replace(/#([ \t]+)(?=[^ \t\r\n][^\n]*\{)/g, "#")
}

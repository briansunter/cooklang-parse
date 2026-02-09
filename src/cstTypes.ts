/**
 * Type-safe helpers for working with Ohm.js CST nodes in semantic actions.
 */

interface CanonicalCSTNode {
  toCanonical(): unknown
  sourceString: string
}

/**
 * Safely call toCanonical on a node that might have the method
 */
export function safeToCanonical(node: unknown): unknown {
  if (
    typeof node === "object" &&
    node !== null &&
    "toCanonical" in node &&
    typeof (node as CanonicalCSTNode).toCanonical === "function"
  ) {
    return (node as CanonicalCSTNode).toCanonical()
  }
  return null
}

/**
 * Safely get sourceString from a node or semantic action context
 */
export function safeGetSourceString(nodeOrCtx: unknown): string {
  if (typeof nodeOrCtx === "object" && nodeOrCtx !== null && "sourceString" in nodeOrCtx) {
    return String((nodeOrCtx as { sourceString: unknown }).sourceString)
  }
  return ""
}

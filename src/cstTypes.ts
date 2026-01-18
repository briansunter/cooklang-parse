/**
 * Type definitions for Ohm.js CST nodes in semantic actions
 *
 * Ohm.js doesn't provide TypeScript types for CST nodes in semantic actions.
 * These definitions provide type safety while working with the dynamic CST.
 */

/**
 * A CST node that has been augmented with a semantic action
 */
interface CanonicalCSTNode {
  toCanonical(): unknown
  sourceString: string
  numChildren: number
  children: CanonicalCSTNode[]
}

/**
 * 'this' context in semantic actions
 */
interface SemanticContext {
  sourceString: string
}

/**
 * Type guard for CanonicalCSTNode
 */
function isCanonicalCSTNode(node: unknown): node is CanonicalCSTNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "toCanonical" in node &&
    typeof (node as CanonicalCSTNode).toCanonical === "function" &&
    "sourceString" in node &&
    "numChildren" in node &&
    "children" in node
  )
}

/**
 * Type guard for SemanticContext
 */
function isSemanticContext(ctx: unknown): ctx is SemanticContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "sourceString" in ctx &&
    typeof (ctx as SemanticContext).sourceString === "string"
  )
}

/**
 * Safely call toCanonical on a node that might have the method
 */
function safeToCanonical(node: unknown): unknown {
  if (isCanonicalCSTNode(node)) {
    return node.toCanonical()
  }
  return null
}

/**
 * Safely get sourceString from a node or context
 */
function safeGetSourceString(nodeOrCtx: unknown): string {
  if (typeof nodeOrCtx === "object" && nodeOrCtx !== null && "sourceString" in nodeOrCtx) {
    return String((nodeOrCtx as { sourceString: string | number | boolean }).sourceString)
  }
  return ""
}

/**
 * Safely get numChildren from a node
 */
function safeGetNumChildren(node: unknown): number {
  if (typeof node === "object" && node !== null && "numChildren" in node) {
    const num = (node as { numChildren: number | string }).numChildren
    return typeof num === "number" ? num : Number.parseInt(String(num), 10) || 0
  }
  return 0
}

/**
 * Check if a node has any children
 */
function nodeHasChildren(node: unknown): boolean {
  return safeGetNumChildren(node) > 0
}

export type { CanonicalCSTNode, SemanticContext }

export {
  isCanonicalCSTNode,
  isSemanticContext,
  nodeHasChildren,
  safeGetNumChildren,
  safeGetSourceString,
  safeToCanonical,
}

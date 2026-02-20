import type { ParseCooklangOptions } from "../types"
import type { ExtensionState } from "./internal-types"

export function resolveExtensions(options?: ParseCooklangOptions): ExtensionState {
  const preset = options?.extensions ?? "canonical"
  return preset === "all"
    ? { modes: true, inlineQuantities: true }
    : { modes: false, inlineQuantities: false }
}

export function hasAllExtensions(options?: ParseCooklangOptions): boolean {
  return options?.extensions === "all"
}

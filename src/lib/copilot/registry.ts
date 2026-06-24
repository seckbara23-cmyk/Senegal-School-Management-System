// ─── Copilot provider registry ───────────────────────────────────────────────
//
// Resolves the active provider. Default is the deterministic engine; a future
// Claude/OpenAI adapter registers here and is selected via COPILOT_PROVIDER (no
// schema, no per-school config yet). Unknown ids fall back to deterministic so
// the copilot is always functional.

import type { CopilotProvider } from './provider'
import { deterministicProvider } from './providers/deterministic'

const REGISTRY: Record<string, CopilotProvider> = {
  deterministic: deterministicProvider,
  // claude: claudeProvider,   // Phase 10B
  // openai: openaiProvider,   // Phase 10B
}

export const DEFAULT_PROVIDER_ID = 'deterministic'

export function getCopilotProvider(id?: string): CopilotProvider {
  const requested = id ?? process.env.COPILOT_PROVIDER ?? DEFAULT_PROVIDER_ID
  return REGISTRY[requested] ?? deterministicProvider
}

export function listCopilotProviders(): { id: string; label: string }[] {
  return Object.values(REGISTRY).map((p) => ({ id: p.id, label: p.label }))
}

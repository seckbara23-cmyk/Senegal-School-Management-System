// ─── Deterministic provider (current behavior, no LLM) ───────────────────────
//
// Wraps the existing pure answer generator and attaches explainability metadata.
// Same context ⇒ same answer (byte-for-byte) — the Phase 8 behavior is preserved
// exactly; only the metadata envelope is added.

import type { CopilotProvider, CopilotRequest } from '../provider'
import { buildMetadata } from '../provider'
import { generateAnswer } from '../answer-generator'
import { parseLocale } from '@/lib/i18n/locale'

export const deterministicProvider: CopilotProvider = {
  id: 'deterministic',
  label: 'Moteur déterministe',
  async generate(req: CopilotRequest) {
    const locale = parseLocale(req.locale)
    const answer = generateAnswer(req.context, locale)
    return { ...answer, meta: buildMetadata('deterministic', req.context, new Date().toISOString(), locale) }
  },
}

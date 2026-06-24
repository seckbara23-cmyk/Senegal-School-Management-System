// ─── Communication provider registry ─────────────────────────────────────────
//
// Channel → provider adapter. Adapters are added as each channel ships:
//   9D.2 email, 9D.3 sms, 9D.4 whatsapp. Until then a channel has no provider and
//   dispatch logs its messages as 'skipped' (channel_not_configured).

import type { CommunicationChannelProvider, ExternalChannel } from './types'
import { resendProvider } from './providers/resend'

const REGISTRY: Partial<Record<ExternalChannel, CommunicationChannelProvider>> = {
  email: resendProvider,           // 9D.2
  // sms: twilioSmsProvider,       // 9D.3
  // whatsapp: metaWhatsappProvider, // 9D.4
}

export function getCommProvider(channel: ExternalChannel): CommunicationChannelProvider | null {
  return REGISTRY[channel] ?? null
}

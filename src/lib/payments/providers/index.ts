// ─── Online provider registry ────────────────────────────────────────────────

import type { OnlinePaymentProvider } from './types'
import { waveProvider } from './wave'
import { orangeMoneyProvider } from './orange-money'

const REGISTRY: Record<string, OnlinePaymentProvider> = {
  wave: waveProvider,
  orange_money: orangeMoneyProvider,
}

export function getOnlineProvider(code: string): OnlinePaymentProvider | null {
  return REGISTRY[code] ?? null
}

export const ONLINE_PROVIDER_LABEL: Record<string, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
}

export type { OnlinePaymentProvider } from './types'

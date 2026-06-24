'use server'

import { requireParentCtx } from '../_auth'
import { loadParentSnapshot, type ParentSnapshot } from '@/lib/copilot/parent-snapshot'
import { generateParentNarrative, type ParentNarrative, type ParentSectionKey } from '@/lib/copilot/parent-narrative'
import { resolveLocale } from '@/lib/i18n/server'
import type { CopilotAnswer, CopilotIntent } from '@/lib/copilot/types'

type Focus = 'overview' | 'scolarite' | 'presences' | 'devoirs' | 'paiements' | 'transport' | 'messages' | 'help'

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function routeFocus(q: string): Focus {
  const n = norm(q)
  if (/\b(aide|help|que peux|capacites)\b/.test(n)) return 'help'
  if (/(devoir|homework|travail a la maison)/.test(n)) return 'devoirs'
  if (/(paiement|payer|facture|frais|retard|impaye|solde)/.test(n)) return 'paiements'
  if (/(transport|bus|ramassage|chauffeur)/.test(n)) return 'transport'
  if (/(message|lire|enseignant|prof)/.test(n)) return 'messages'
  if (/(presence|absence|assiduite|retard)/.test(n)) return 'presences'
  if (/(note|moyenne|bulletin|scolarite|resultat|niveau)/.test(n)) return 'scolarite'
  return 'overview'
}

// Match linked children by first name mentioned in the query.
function matchChildren(q: string, children: ParentSnapshot['children']): string[] {
  const n = norm(q)
  return children.filter((c) => { const fn = norm(c.firstName); return fn.length >= 3 && n.includes(fn) }).map((c) => c.studentId)
}

function sec(nar: ParentNarrative, keys: ParentSectionKey[]) {
  return keys.map((k) => nar.sections.find((s) => s.key === k)).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ heading: s.heading, lines: s.lines }))
}

// Read-only. requireParentCtx + parent RLS bound everything to linked children;
// the snapshot carries no other student/parent and no school-wide data. No
// writes, no audit mutation, no notifications.
export async function askParentCopilot(query: string): Promise<CopilotAnswer> {
  const { supabase, schoolId, parent } = await requireParentCtx()
  const locale = resolveLocale()
  const snapshot = await loadParentSnapshot(supabase, { schoolId, parentId: parent.id, parentName: `${parent.last_name} ${parent.first_name}`.trim(), locale })

  // Multi-child name disambiguation.
  const matched = matchChildren(query, snapshot.children)
  if (matched.length > 1) {
    const names = snapshot.children.filter((c) => matched.includes(c.studentId)).map((c) => c.firstName)
    return {
      intent: 'student_360', title: 'De quel enfant s’agit-il ?',
      summary: `Plusieurs enfants correspondent : ${names.join(', ')}. Précisez le prénom.`,
      sections: [], links: [], meta: generateParentNarrative(snapshot, locale).meta,
      suggestions: snapshot.children.map((c) => `Comment va ${c.firstName} ?`),
    }
  }
  const childId = matched.length === 1 ? matched[0] : undefined
  const nar = generateParentNarrative(snapshot, locale, childId ? { childId } : undefined)
  const focus = routeFocus(query)
  const meta = nar.meta
  const cq = childId ? `?child=${childId}` : ''

  const base = (intent: CopilotIntent, title: string, summary: string, sections: { heading: string; lines: string[] }[], links: { label: string; href: string }[] = [], extra?: Partial<CopilotAnswer>): CopilotAnswer =>
    ({ intent, title, summary, sections, links, meta, ...extra })

  if (!snapshot.hasChildren) {
    return base('student_360', 'Aucun enfant rattaché', nar.headline, sec(nar, ['enfants']), [])
  }

  switch (focus) {
    case 'devoirs':
      return base('homework', 'Devoirs', `${nar.sections.find((s) => s.key === 'devoirs')?.lines.length ?? 0} information(s).`, sec(nar, ['devoirs']), [{ label: 'Voir les devoirs', href: `/parent/homework${cq}` }])
    case 'paiements':
      return base('finance', 'Paiements', snapshot.totals.outstanding > 0 ? 'Des frais restent à régler.' : 'Vos paiements sont à jour.', sec(nar, ['paiements']), [{ label: 'Mes paiements', href: `/parent/finance${cq}` }])
    case 'transport':
      return base('transport', 'Transport', 'Situation du transport scolaire.', sec(nar, ['transport']), [{ label: 'Transport', href: '/parent/transport' }])
    case 'messages':
      return base('student_360', 'Messages', snapshot.messages.unread > 0 ? `${snapshot.messages.unread} message(s) non lu(s).` : 'Aucun message non lu.', sec(nar, ['messages']), [{ label: 'Mes messages', href: '/parent/messages' }])
    case 'presences':
      return base('attendance', 'Présences', 'Assiduité de vos enfants.', sec(nar, ['presences']), [{ label: 'Présences', href: `/parent/attendance${cq}` }])
    case 'scolarite':
      return base('academic', 'Scolarité', 'Résultats de vos enfants.', sec(nar, ['scolarite']), [{ label: 'Bulletins', href: `/parent/bulletins${cq}` }])
    case 'help':
      return base('help', 'Que puis-je faire ?', 'Je réponds à partir des données de vos enfants — en lecture seule.',
        [{ heading: '', lines: ['Comment va mon enfant ?', 'Quels devoirs restent à faire ?', 'Y a-t-il des paiements en retard ?', 'Quelle est la situation du transport ?', 'Quels messages dois-je lire ?'] }],
        [], { suggestions: ['Comment va mon enfant ?', 'Y a-t-il des paiements en retard ?', 'Quels messages dois-je lire ?'] })
    default: {
      const title = childId ? snapshot.children.find((c) => c.studentId === childId)?.firstName ?? 'Mon enfant' : 'Synthèse de mes enfants'
      const keys: ParentSectionKey[] = childId ? ['scolarite', 'presences', 'devoirs', 'paiements', 'transport'] : ['enfants', 'scolarite', 'presences', 'paiements']
      return base('student_360', title, nar.headline, [...sec(nar, keys), { heading: 'Priorités de la semaine', lines: nar.priorities }],
        [{ label: 'Tableau de bord', href: '/parent' }])
    }
  }
}

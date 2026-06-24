// ─── Copilot answer generator (deterministic, French) ────────────────────────
//
// Pure: turns a CopilotContext into a structured French narrative assembled from
// real numbers. No randomness, no model calls — same context ⇒ same answer.

import type { CopilotAnswer } from './types'
import type { CopilotContext } from './context-builder'
import { generateStudentNarrative } from './student-narrative'
import { generateExecutiveNarrative } from './executive-narrative'
import type { Locale } from '@/lib/i18n/locale'

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA'
const RISK_LABEL: Record<string, string> = { low: 'faible', medium: 'moyen', high: 'élevé' }
const ADMISSION_LABEL: Record<string, string> = {
  draft: 'Brouillons', submitted: 'Soumises', under_review: 'En revue', documents_requested: 'Pièces demandées',
  accepted: 'Acceptées', rejected: 'Refusées', waitlisted: 'Liste d’attente', withdrawn: 'Retirées',
}

export function generateAnswer(ctx: CopilotContext, locale: Locale = 'fr'): CopilotAnswer {
  switch (ctx.kind) {
    case 'school_overview': {
      // Phase 10C: the shared Executive Narrative Engine produces the synthesis.
      const n = generateExecutiveNarrative(ctx.data, locale)
      return {
        intent: 'school_overview', title: 'Synthèse exécutive',
        summary: n.headline,
        sections: [
          ...(n.attention.length ? [{ heading: 'Points d’attention', lines: n.attention }] : []),
          ...(n.positives.length ? [{ heading: 'Points positifs', lines: n.positives }] : []),
          { heading: 'Priorités de la semaine', lines: n.priorities },
          ...(n.recommendations.length ? [{ heading: 'Recommandations', lines: n.recommendations }] : []),
        ],
        links: [{ label: 'Tableau de bord analytique', href: '/school/analytics' }],
      }
    }

    case 'academic': {
      const d = ctx.data
      if (d.gradedStudents === 0) return info('academic', 'Analyse académique', 'Aucune note n’a encore été saisie pour la période active.', [{ label: 'Notes & bulletins', href: '/school/academics/bulletins' }])
      const best = d.byClass[0], worst = d.byClass[d.byClass.length - 1], topSubj = d.bySubject[0]
      return {
        intent: 'academic', title: 'Analyse académique',
        summary: `Moyenne générale ${d.schoolAverage}/20 · ${d.passRate}% de réussite sur ${d.gradedStudents} élèves notés.`,
        sections: [
          { heading: 'Par classe', lines: [best ? `Meilleure : ${best.className} (${best.average}/20)` : '—', worst && worst !== best ? `À soutenir : ${worst.className} (${worst.average}/20)` : ''].filter(Boolean) },
          { heading: 'Par matière', lines: [topSubj ? `Meilleure matière : ${topSubj.name} (${topSubj.average}/20)` : '—'] },
        ],
        links: [{ label: 'Analyse académique détaillée', href: '/school/analytics/academic' }],
      }
    }

    case 'finance': {
      const d = ctx.data
      const debtor = d.topDebtors[0]
      return {
        intent: 'finance', title: 'Situation financière',
        summary: `Facturé ${fmt(d.invoiced)} · encaissé ${fmt(d.collected)} · solde ${fmt(d.outstanding)} (recouvrement ${d.collectionRate}%).`,
        sections: [
          { heading: 'Impayés', lines: [`0–30 j : ${fmt(d.aging.b1)} · 31–60 j : ${fmt(d.aging.b2)} · 61 j+ : ${fmt(d.aging.b3)}`, debtor ? `Principal débiteur : ${debtor.name} (${fmt(debtor.balance)})` : 'Aucun débiteur.'] },
          { heading: 'Revenus', lines: [`Scolarité ${fmt(d.tuitionRevenue)} · transport ${fmt(d.transportRevenue)}`, `${d.activePlans} échéancier(s) actif(s)`] },
        ],
        links: [{ label: 'Analyse financière', href: '/school/analytics/finance' }, { label: 'Factures', href: '/school/finance/invoices' }],
      }
    }

    case 'attendance': {
      const d = ctx.data
      return {
        intent: 'attendance', title: 'Assiduité',
        summary: d.rate !== null ? `Taux d’assiduité de l’école : ${d.rate}%.` : 'Aucune présence enregistrée pour l’année active.',
        sections: d.worstClass ? [{ heading: 'À surveiller', lines: [`Classe la moins assidue : ${d.worstClass.name} (${d.worstClass.rate}%)`] }] : [],
        links: [{ label: 'Synthèse des présences', href: '/school/attendance/summary' }],
      }
    }

    case 'at_risk': {
      const d = ctx.data
      const top = d.watch.slice(0, 3).map((w) => `${w.lastName} ${w.firstName} (${RISK_LABEL[w.level]}${w.average !== null ? `, ${w.average}/20` : ''})`)
      return {
        intent: 'at_risk', title: 'Élèves à risque',
        summary: `${d.summary.total} élève(s) à surveiller : ${d.summary.high} à risque élevé, ${d.summary.medium} moyen.`,
        sections: [
          { heading: 'Signaux', lines: [`Académique : ${d.factors.academic} · Assiduité : ${d.factors.attendance} · Finance : ${d.factors.finance}`] },
          ...(top.length ? [{ heading: 'Priorités', lines: top }] : []),
        ],
        links: [{ label: 'Signaux & alertes', href: '/school/analytics/insights' }, { label: 'Cellule de soutien', href: '/school/academic-support' }],
      }
    }

    case 'admissions': {
      const d = ctx.data
      const lines = Object.entries(d.counts).map(([s, n]) => `${ADMISSION_LABEL[s] ?? s} : ${n}`)
      return {
        intent: 'admissions', title: 'Candidatures',
        summary: `${d.total} candidature(s) au total.`,
        sections: lines.length ? [{ heading: 'Par statut', lines }] : [{ lines: ['Aucune candidature pour le moment.'] }],
        links: [{ label: 'Admissions', href: '/school/admissions' }],
      }
    }

    case 'transport': {
      const d = ctx.data
      return {
        intent: 'transport', title: 'Transport scolaire',
        summary: `${d.subscribers} élève(s) abonné(s) · revenu mensuel attendu ${fmt(d.revenue)}.`,
        sections: [{ lines: [`${d.routes} itinéraire(s) actif(s) · ${d.vehicles} véhicule(s)`] }],
        links: [{ label: 'Module transport', href: '/school/transport' }, { label: 'Facturation transport', href: '/school/finance/transport' }],
      }
    }

    case 'timetable':
      return info('timetable', 'Emploi du temps', `${ctx.data.slots} créneau(x) planifié(s) sur ${ctx.data.classesWithTimetable} classe(s).`, [{ label: 'Emploi du temps', href: '/school/timetable' }])

    case 'homework':
      return info('homework', 'Devoirs', `${ctx.data.upcoming} devoir(s) à venir sur ${ctx.data.total} au total.`, [])

    case 'student': {
      // Phase 10B: the shared Student Narrative Engine produces the summary.
      const n = generateStudentNarrative(ctx.data, locale)
      return {
        intent: 'student_360', title: n.name,
        summary: n.headline,
        sections: [
          ...n.sections.map((s) => ({ heading: s.heading, lines: s.lines })),
          { heading: 'Actions recommandées', lines: n.recommendations },
        ],
        links: [{ label: 'Dossier élève', href: `/school/students/${n.studentId}` }, { label: 'Bulletin', href: `/school/academics/bulletins/${n.studentId}` }],
      }
    }

    case 'student_ambiguous':
      return {
        intent: 'student_360', title: 'Plusieurs élèves correspondent',
        summary: `Précisez de quel élève il s’agit pour « ${ctx.data.name} ».`,
        sections: [{ lines: ctx.data.matches.map((m) => m.name) }],
        links: ctx.data.matches.map((m) => ({ label: m.name, href: `/school/students/${m.id}` })),
        suggestions: ctx.data.matches.map((m) => `Résumé de ${m.name}`),
      }

    case 'student_not_found':
      return { intent: 'student_360', title: 'Élève introuvable', summary: `Aucun élève ne correspond à « ${ctx.data.name} ».`, sections: [], links: [{ label: 'Liste des élèves', href: '/school/students' }], notice: 'Vérifiez l’orthographe du nom.' }

    case 'help':
      return {
        intent: 'help', title: 'Que puis-je faire ?',
        summary: 'Je réponds à partir des données de votre école — en lecture seule.',
        sections: [{ lines: [
          'Vue d’ensemble de l’école', 'Résultats académiques', 'Situation financière', 'Assiduité',
          'Élèves à risque', 'Candidatures', 'Transport', 'Résumé d’un élève (ex. « Résumé de Awa Diop »)',
        ] }],
        links: [],
        suggestions: ['Vue d’ensemble de l’école', 'Quels élèves sont à risque ?', 'Résumé financier'],
      }

    default:
      return {
        intent: 'unknown', title: 'Je n’ai pas compris',
        summary: 'Reformulez votre question ou choisissez une suggestion.',
        sections: [], links: [],
        notice: 'Le copilote répond uniquement sur les données de votre école.',
        suggestions: ['Vue d’ensemble de l’école', 'Résultats académiques', 'Résumé financier', 'Quels élèves sont à risque ?'],
      }
  }
}

function info(intent: CopilotAnswer['intent'], title: string, summary: string, links: CopilotAnswer['links']): CopilotAnswer {
  return { intent, title, summary, sections: [], links }
}

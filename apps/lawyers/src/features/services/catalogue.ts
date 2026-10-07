import * as m from '@/paraglide/messages'

/**
 * What a client walks in for, and leaves with (docs/lawyers/SERVICES.md, from
 * sources). A service opens a matter of the right kind at the right stage,
 * drafts its papers from the client's details, and turns its steps into tasks
 * that say where each paper goes. Fees are a guide from secondary sources,
 * never a tariff.
 */
export type ServiceStep = { title: () => string; where: () => string; fee?: string }
export type Service = {
  id: string
  label: () => string
  about: () => string
  leaves: () => string
  matterType: string
  stage: string | null
  papers: readonly string[]
  steps: readonly ServiceStep[]
}

export const services: readonly Service[] = [
  {
    id: 'name_change',
    label: () => m["svc.name_change"](),
    about: () => m["svc.name_change_about"](),
    leaves: () => m["svc.name_change_leaves"](),
    matterType: 'advice',
    stage: 'drafted',
    papers: ['deed_poll', 'name_change_notice', 'engagement_letter'],
    steps: [
      { title: () => m["svc.step.sign_commission"](), where: () => m["svc.where.practice"]() },
      { title: () => m["svc.step.register_ursb"](), where: () => 'URSB', fee: 'UGX 55,000' },
      { title: () => m["svc.step.gazette"](), where: () => 'Uganda Gazette (UPPC)', fee: 'UGX 450,000' },
      { title: () => m["svc.step.nira"](), where: () => 'NIRA', fee: 'UGX 200,000' },
    ],
  },
  {
    id: 'police_bond',
    label: () => m["svc.police_bond"](),
    about: () => m["svc.police_bond_about"](),
    leaves: () => m["svc.police_bond_leaves"](),
    matterType: 'criminal_defence',
    stage: 'custody_bail',
    papers: ['police_bond_letter', 'engagement_letter'],
    steps: [
      { title: () => m["svc.step.find_held"](), where: () => m["svc.where.police"]() },
      { title: () => m["svc.step.deliver_bond_letter"](), where: () => m["svc.where.police"]() },
      { title: () => m["svc.step.if_48h"](), where: () => m["svc.where.court"]() },
    ],
  },
  {
    id: 'letters_of_administration',
    label: () => m["svc.loa"](),
    about: () => m["svc.loa_about"](),
    leaves: () => m["svc.loa_leaves"](),
    matterType: 'succession',
    stage: null,
    papers: ['family_meeting_minutes', 'administrator_general_letter', 'petition', 'engagement_letter'],
    steps: [
      { title: () => m["svc.step.family_meeting"](), where: () => m["svc.where.family"]() },
      { title: () => m["svc.step.administrator_general"](), where: () => m["svc.where.administrator_general"]() },
      { title: () => m["svc.step.petition"](), where: () => m["svc.where.high_court"]() },
      { title: () => m["svc.step.gazette_caveat"](), where: () => m["svc.where.high_court"]() },
    ],
  },
  {
    id: 'land_purchase',
    label: () => m["svc.land"](),
    about: () => m["svc.land_about"](),
    leaves: () => m["svc.land_leaves"](),
    matterType: 'land_transaction',
    stage: null,
    papers: ['sale_agreement', 'engagement_letter', 'letter'],
    steps: [
      { title: () => m["svc.step.search"](), where: () => m["svc.where.lands"]() },
      { title: () => m["svc.step.agreement"](), where: () => m["svc.where.practice"]() },
      { title: () => m["svc.step.transfer"](), where: () => m["svc.where.lands"]() },
    ],
  },
  {
    id: 'debt_recovery',
    label: () => m["svc.debt"](),
    about: () => m["svc.debt_about"](),
    leaves: () => m["svc.debt_leaves"](),
    matterType: 'civil_suit',
    stage: 'pre_action',
    papers: ['demand_letter', 'engagement_letter'],
    steps: [
      { title: () => m["svc.step.serve_demand"](), where: () => m["svc.where.debtor"]() },
      { title: () => m["svc.step.if_unpaid"](), where: () => m["svc.where.court"]() },
    ],
  },
]

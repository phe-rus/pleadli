import { daysInCustody, mandatoryBailThresholdDays, type Prisoner } from './schema'
import { m } from '@/paraglide/messages'

export type PrisonerFolderId = 'held' | 'remand' | 'bail_due' | 'convicted' | 'civil' | 'papers' | 'left'

export type PrisonerFolder = {
  id: PrisonerFolderId
  label: () => string
  note: () => string
  match: (prisoner: Prisoner) => boolean
  /** Counted in the sidebar. What has left is the archive, so it is not. */
  counted: boolean
  /** A count here is something owed, so it shows red. */
  urgent?: boolean
}

const held = (p: Prisoner) => p.currentStatus === 'in_custody'

/** Past the constitutional limit for remand without trial (Art. 23(6)). */
export function pastBailLimit(p: Prisoner) {
  return held(p) && p.status === 'unconvicted' && daysInCustody(p.admittedAt) >= mandatoryBailThresholdDays(p.highCourtOnlyOffence)
}

/** The prison's people, sorted the way a records office sorts them: who is
 * held, then by why they are held, then what needs doing about them. */
export const prisonerFolders: readonly PrisonerFolder[] = [
  { id: 'held', label: () => m.folder_held(), note: () => m.folder_held_note(), match: held, counted: true },
  { id: 'remand', label: () => m.folder_remand(), note: () => m.folder_remand_note(), match: (p) => held(p) && p.status === 'unconvicted', counted: true },
  { id: 'bail_due', label: () => m.folder_bail_due(), note: () => m.folder_bail_due_note(), match: pastBailLimit, counted: true, urgent: true },
  { id: 'convicted', label: () => m.folder_convicted(), note: () => m.folder_convicted_note(), match: (p) => held(p) && p.status === 'convicted', counted: true },
  { id: 'civil', label: () => m.folder_civil(), note: () => m.folder_civil_note(), match: (p) => held(p) && p.status === 'civil', counted: true },
  { id: 'papers', label: () => m.folder_papers(), note: () => m.folder_papers_note(), match: (p) => held(p) && p.documentsPending, counted: true },
  { id: 'left', label: () => m.folder_left(), note: () => m.folder_left_note(), match: (p) => !held(p), counted: false },
]

export function prisonerFolder(id: string | undefined): PrisonerFolder {
  return prisonerFolders.find((folder) => folder.id === id) ?? prisonerFolders[0]
}

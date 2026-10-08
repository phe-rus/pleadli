import * as m from '@/paraglide/messages'
import type { OrchestraStatus } from './data'

/** An Orchestra refusal in this app's words. Unknown codes fall back to the
 * general line, never to the English pleadli.com sent. */
export function errorText(code: string | null): string {
  switch (code) {
    case 'offline':
      return m["orchestra.error.offline"]()
    case 'unknown_key':
      return m["orchestra.error.unknown_key"]()
    case 'seats_full':
      return m["orchestra.error.seats_full"]()
    case 'revoked':
      return m["orchestra.error.revoked"]()
    case 'suspended':
      return m["orchestra.error.suspended"]()
    case 'expired':
      return m["orchestra.error.expired"]()
    case 'wrong_application':
      return m["orchestra.error.wrong_application"]()
    case 'invalid':
      return m["orchestra.error.invalid"]()
    case 'licence_needed':
    case 'not_activated':
      return m["orchestra.error.licence_needed"]()
    case 'no_recovery_phrase':
      return m["orchestra.error.no_recovery_phrase"]()
    case 'no_storage':
      return m["orchestra.error.no_storage"]()
    case 'storage_not_approved':
      return m["orchestra.error.storage_not_approved"]()
    case 'storage_host_key':
      return m["orchestra.error.storage_host_key"]()
    case 'storage_denied':
      return m["orchestra.error.storage_denied"]()
    case 'storage_unreachable':
      return m["orchestra.error.storage_unreachable"]()
    case 'backup_running':
      return m["orchestra.error.backup_running"]()
    case 'unknown_office':
      return m["orchestra.error.unknown_office"]()
    case 'restore_phrase':
      return m["orchestra.error.restore_phrase"]()
    case 'restore_unreadable':
      return m["orchestra.error.restore_unreadable"]()
    case 'restore_wrong_app':
      return m["orchestra.error.restore_wrong_app"]()
    case 'restore_newer':
      return m["orchestra.error.restore_newer"]()
    default:
      return m["orchestra.error.general"]()
  }
}

/** Why a licence ended, as pleadli.com named it. */
export function reasonText(reason: string | null): string {
  switch (reason) {
    case 'revoked':
      return m["orchestra.reason.revoked"]()
    case 'suspended':
      return m["orchestra.reason.suspended"]()
    case 'expired':
      return m["orchestra.reason.expired"]()
    case 'removed':
      return m["orchestra.reason.removed"]()
    default:
      return m["orchestra.reason.unknown"]()
  }
}

export function stateText(s: OrchestraStatus): string {
  switch (s.state) {
    case 'licensed':
      return m["orchestra.state.licensed"]({ institution: s.licence?.institution ?? '' })
    case 'trial':
      return m["orchestra.state.trial"]({ days: String(s.trialDaysLeft) })
    case 'trial_ended':
      return m["orchestra.state.trial_ended"]()
    default:
      return m["orchestra.state.licence_ended"]()
  }
}

export function kindText(kind: string): string {
  return kind === 's3' ? m["orchestra.kind.s3"]() : kind === 'sftp' ? m["orchestra.kind.sftp"]() : m["orchestra.kind.folder"]()
}

/** Bytes as people read them. */
export function sizeText(bytes: number | null): string {
  if (bytes === null) return '·'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

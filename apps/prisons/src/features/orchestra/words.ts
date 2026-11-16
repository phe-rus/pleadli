import { getLocale } from '@/paraglide/runtime'
import { m } from '@/paraglide/messages'
import type { OrchestraStatus } from './data'

/** An Orchestra refusal in this app's words. Unknown codes fall back to the
 * general line, never to the English pleadli.com sent. */
export function errorText(code: string | null): string {
  switch (code) {
    case 'offline':
      return m.orchestra_error_offline()
    case 'unknown_key':
      return m.orchestra_error_unknown_key()
    case 'seats_full':
      return m.orchestra_error_seats_full()
    case 'revoked':
      return m.orchestra_error_revoked()
    case 'suspended':
      return m.orchestra_error_suspended()
    case 'expired':
      return m.orchestra_error_expired()
    case 'wrong_application':
      return m.orchestra_error_wrong_application()
    case 'invalid':
      return m.orchestra_error_invalid()
    case 'licence_needed':
    case 'not_activated':
      return m.orchestra_error_licence_needed()
    case 'no_recovery_phrase':
      return m.orchestra_error_no_recovery_phrase()
    case 'no_storage':
      return m.orchestra_error_no_storage()
    case 'storage_not_approved':
      return m.orchestra_error_storage_not_approved()
    case 'storage_host_key':
      return m.orchestra_error_storage_host_key()
    case 'storage_denied':
      return m.orchestra_error_storage_denied()
    case 'storage_unreachable':
      return m.orchestra_error_storage_unreachable()
    case 'backup_running':
      return m.orchestra_error_backup_running()
    case 'unknown_office':
      return m.orchestra_error_unknown_office()
    case 'restore_phrase':
      return m.orchestra_error_restore_phrase()
    case 'restore_unreadable':
      return m.orchestra_error_restore_unreadable()
    case 'restore_wrong_app':
      return m.orchestra_error_restore_wrong_app()
    case 'restore_newer':
      return m.orchestra_error_restore_newer()
    default:
      return m.orchestra_error_general()
  }
}

/** Why a licence ended, as pleadli.com named it. */
export function reasonText(reason: string | null): string {
  switch (reason) {
    case 'revoked':
      return m.orchestra_reason_revoked()
    case 'suspended':
      return m.orchestra_reason_suspended()
    case 'expired':
      return m.orchestra_reason_expired()
    case 'removed':
      return m.orchestra_reason_removed()
    default:
      return m.orchestra_reason_unknown()
  }
}

export function stateText(s: OrchestraStatus): string {
  switch (s.state) {
    case 'licensed':
      return m.orchestra_state_licensed({ institution: s.licence?.institution ?? '' })
    case 'trial':
      return m.orchestra_state_trial({ days: String(s.trialDaysLeft) })
    case 'trial_ended':
      return m.orchestra_state_trial_ended()
    default:
      return m.orchestra_state_licence_ended()
  }
}

export function kindText(kind: string): string {
  return kind === 's3' ? m.orchestra_kind_s3() : kind === 'sftp' ? m.orchestra_kind_sftp() : m.orchestra_kind_folder()
}

/** Bytes as people read them. */
export function sizeText(bytes: number | null): string {
  if (bytes === null) return '·'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const formatDay = (ms: number) => new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(ms)

/** A moment as a day and a time. */
export const when = (ms: number) => new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms)

/** How many days ago, in the reader's language ("today", "3 days ago"). */
export const ago = (ms: number) => new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(Math.round((ms - Date.now()) / 86_400_000), 'day')

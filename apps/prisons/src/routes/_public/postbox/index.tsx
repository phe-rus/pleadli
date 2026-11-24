import { m } from '@/paraglide/messages'
import { getRelay, checkRelay, reopenReceived } from '@/features/relay/data'
import { RelayPostbox, type RelayLabels, type RelayStatus } from '@pleadli/shell'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/postbox/')({ component: RouteComponent })

/** This app's own words for the shared postbox. */
const useLabels = (): RelayLabels => ({
  postbox: {
    title: m.postbox_title(),
    intro: m.postbox_intro(),
    inbox: { label: m.postbox_inbox(), empty: m.postbox_empty_inbox() },
    outbox: { label: m.postbox_outbox(), empty: m.postbox_empty_outbox() },
    sent: { label: m.postbox_sent(), empty: m.postbox_empty_sent() },
    status: m.postbox_status(),
  },
  address: { title: m.postbox_address_title(), hint: m.postbox_address_hint(), copy: m.postbox_address_copy(), copied: m.postbox_address_copied(), unknown: m.postbox_address_unknown() },
  checkNow: m.postbox_check_now(),
  checking: m.postbox_checking(),
  connected: (address) => m.postbox_connected({ address }),
  stage: { queued: m.postbox_stage_queued(), sent: m.postbox_stage_sent(), delivered: m.postbox_stage_delivered(), refused: m.postbox_stage_refused(), attention: m.postbox_stage_attention(), expired: m.postbox_stage_expired() },
  turnedAway: (kind) => m.postbox_turned_away({ kind }),
  taken: m.postbox_taken(),
  tryAgain: m.postbox_try_again(),
  // A facility invites a registry; no one invites a facility, so nothing here waits to be answered.
  invitation: () => '',
  invitationBody: () => '',
  answer: '',
  decline: '',
  lastError: (reason) => reason,
})

const useKinds = (): Record<string, string> => ({
  custody_order: m.postbox_kind_custody_order(),
  custody_receipt: m.postbox_kind_custody_receipt(),
  custody_report: m.postbox_kind_custody_report(),
  pairing_invite: m.postbox_kind_pairing_invite(),
  pairing_response: m.postbox_kind_pairing_response(),
  pairing_confirmation: m.postbox_kind_pairing_confirmation(),
})

function RouteComponent() {
  const [relay, setRelay] = useState<RelayStatus | null>(null)
  const labels = useLabels()
  const kinds = useKinds()
  const refresh = useCallback(() => getRelay().then(setRelay).catch(() => setRelay({ ready: false, whyNot: null, address: null, site: '', last: { at: null, error: null }, sent: [], received: [] })), [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return <RelayPostbox labels={labels} relay={relay} kindLabels={kinds} onCheck={() => checkRelay().then(setRelay)} onReopen={(id) => reopenReceived(id).then(setRelay)} />
}

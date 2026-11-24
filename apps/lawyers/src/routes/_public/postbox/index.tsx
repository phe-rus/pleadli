import * as m from '@/paraglide/messages'
import { getRelay, checkRelay, reopenReceived } from '@/features/relay/data'
import { RelayPostbox, type RelayLabels, type RelayStatus } from '@pleadli/shell'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/_public/postbox/')({ component: RouteComponent })

/** This app's own words for the shared postbox. */
const useLabels = (): RelayLabels => ({
  postbox: {
    title: m['postbox.title'](),
    intro: m['postbox.intro'](),
    inbox: { label: m['postbox.inbox'](), empty: m['postbox.empty_inbox']() },
    outbox: { label: m['postbox.outbox'](), empty: m['postbox.empty_outbox']() },
    sent: { label: m['postbox.sent'](), empty: m['postbox.empty_sent']() },
    status: m['postbox.status'](),
  },
  address: { title: m['postbox.address_title'](), hint: m['postbox.address_hint'](), copy: m['postbox.address_copy'](), copied: m['postbox.address_copied'](), unknown: m['postbox.address_unknown']() },
  checkNow: m['postbox.check_now'](),
  checking: m['postbox.checking'](),
  connected: (address) => m['postbox.connected']({ address }),
  stage: { queued: m['postbox.stage_queued'](), sent: m['postbox.stage_sent'](), delivered: m['postbox.stage_delivered'](), refused: m['postbox.stage_refused'](), attention: m['postbox.stage_attention'](), expired: m['postbox.stage_expired']() },
  turnedAway: (kind) => m['postbox.turned_away']({ kind }),
  taken: m['postbox.taken'](),
  tryAgain: m['postbox.try_again'](),
  // A firm invites a registry; no one invites a firm, so nothing here waits to be answered.
  invitation: () => '',
  invitationBody: () => '',
  answer: '',
  decline: '',
  lastError: (reason) => reason,
})

const useKinds = (): Record<string, string> => ({
  court_notice: m['postbox.kind_court_notice'](),
  court_notice_receipt: m['postbox.kind_court_notice_receipt'](),
  firm_filing: m['postbox.kind_firm_filing'](),
  firm_filing_receipt: m['postbox.kind_firm_filing_receipt'](),
  pairing_invite: m['postbox.kind_pairing_invite'](),
  pairing_response: m['postbox.kind_pairing_response'](),
  pairing_confirmation: m['postbox.kind_pairing_confirmation'](),
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

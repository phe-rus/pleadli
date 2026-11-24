import { RelayPostbox, type RelayLabels, type RelayStatus } from '@pleadli/shell'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { answerInvitation, checkRelay, declineInvitation, getRelay, reopenReceived } from '@/features/relay/data'

export const Route = createFileRoute('/_public/postbox/')({ component: RouteComponent })

// Courts words, English until feature 15 moves them into messages.
const labels: RelayLabels = {
  postbox: {
    title: 'Postbox',
    intro: 'Filings, notices, orders and reports to and from other offices arrive here, so nothing has to be carried on a stick.',
    inbox: { label: 'Inbox', empty: 'Nothing has arrived yet.' },
    outbox: { label: 'Outbox', empty: 'Nothing is waiting to be sent.' },
    sent: { label: 'Sent', empty: 'Nothing has been sent yet.' },
    status: 'Not switched on yet. It will work once your office is connected to Pleadli.',
  },
  address: { title: 'Your receiving address', hint: 'Other offices must send to exactly this address.', copy: 'Copy', copied: 'Copied', unknown: 'Not known yet. Connect to Pleadli to see it.' },
  checkNow: 'Check now',
  checking: 'Checking the connection to Pleadli…',
  connected: (address) => `Connected to Pleadli as ${address}.`,
  stage: { queued: 'Waiting to send', sent: 'Sent', delivered: 'Delivered', refused: 'Turned away by the office', attention: 'Needs attention', expired: 'Not delivered' },
  turnedAway: (kind) => `Turned away: ${kind}`,
  taken: 'Received and taken in.',
  tryAgain: 'Try again',
  invitation: (name, kind) => `${name} (${kind}) asks to connect`,
  invitationBody: (fingerprint) => `Read this code to them and confirm it matches theirs before you trust them: ${fingerprint}`,
  answer: 'Answer the invitation',
  decline: 'Decline',
  lastError: (reason) => reason,
}

const kinds: Record<string, string> = {
  case_filing: 'Prosecution filing',
  case_withdrawal: 'Withdrawal of a case',
  filing_receipt: 'Receipt for a filing',
  firm_filing: 'Filing by counsel',
  firm_filing_receipt: 'Receipt for counsel’s filing',
  court_notice: 'Notice from the court',
  court_notice_receipt: 'Counsel’s answer to a notice',
  custody_order: 'Custody order',
  custody_receipt: 'Facility’s answer to an order',
  custody_report: 'Facility’s report',
  pairing_invite: 'Invitation to connect',
  pairing_response: 'Answer to an invitation',
  pairing_confirmation: 'Confirmation of a connection',
}

function RouteComponent() {
  const [relay, setRelay] = useState<RelayStatus | null>(null)
  const refresh = useCallback(() => getRelay().then(setRelay).catch(() => setRelay({ ready: false, whyNot: 'The postbox is not available on this computer.', address: null, site: '', last: { at: null, error: null }, sent: [], received: [] })), [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return (
    <RelayPostbox
      labels={labels}
      relay={relay}
      kindLabels={kinds}
      onCheck={() => checkRelay().then(setRelay)}
      onReopen={(id) => reopenReceived(id).then(setRelay)}
      onAnswer={(id) => answerInvitation(id).then(refresh)}
      onDecline={(id) => declineInvitation(id).then(setRelay)}
    />
  )
}

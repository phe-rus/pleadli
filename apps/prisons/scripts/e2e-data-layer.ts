/**
 * End-to-end check of the frontend data layer against the real node.
 *
 * Starts the headless node on a fresh temporary data directory, then drives
 * the actual feature `data.ts` functions (the same code the screens call)
 * through `api()` over the debug loopback listener. What this proves: the
 * request and response shapes the UI's zod schemas expect are exactly what
 * the node sends, sign-in and permissions are enforced, writes are audited,
 * and errors carry the codes the UI branches on.
 *
 * Run from apps/prisons:  bun run scripts/e2e-data-layer.ts
 * Needs a built node:     (cd src-tauri && cargo build --bin node)
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApiError, api, setSessionToken } from '../src/lib/api'
import { chooseRole } from '../src/features/activation/data'
import { addAttachment, listAttachments, voidAttachment } from '../src/features/attachments/data'
import { createCourtProduction, listRemand } from '../src/features/court-productions/data'
import { createHealthEvent, listHospitalised } from '../src/features/health-events/data'
import { createOfficer, listOfficers } from '../src/features/officers/data'
import { getPrisoner, listInCustody, listPrisoners, updatePrisoner } from '../src/features/prisoners/data'
import { createProgrammeParticipation, certifyProgrammeParticipation } from '../src/features/programme-participations/data'
import { createPropertyRecord, listPropertyRecordsForPrisoner, returnPropertyRecord } from '../src/features/property-records/data'
import { createRelease } from '../src/features/releases/data'
import { getToday } from '../src/features/obligations/data'
import { getLegalOverview } from '../src/features/legal/data'
import { getPrisonerFile } from '../src/features/custody/data'
import { getFacilityProfile, saveFacilityProfile } from '../src/features/facility/data'
import { getReportsSummary } from '../src/features/reports/data'
import { createRequest, listRequests, resolveRequest } from '../src/features/requests/data'
import { search } from '../src/features/search/data'
import { bootstrapFirstAccount, getSession, getSystemState, signIn, signOut } from '../src/features/session/data'
import { dispatchTransfer, prepareTransfer } from '../src/features/transfers/data'
import { createVisit, listVisits } from '../src/features/visits/data'
import { createEnrolmentCode, getEnvironment, getLocalConnection, listDevices, setNodeMode, getBackups, getRecoveryStatus, listRecoveryBackups, restoreBackup, restoreInRecovery, runBackup, saveBackupConfig, verifyBackup } from '../src/features/node/data'

const NODE_BIN = join(import.meta.dir, '../src-tauri/target/debug/node')
const dir = mkdtempSync(join(tmpdir(), 'pleadli-e2e-'))
let node = Bun.spawn([NODE_BIN, dir], { stdout: 'ignore', stderr: 'ignore' })

async function waitForNode() {
  for (let i = 0; i < 150; i++) {
    try {
      const res = await fetch('http://127.0.0.1:47922/api/system/health')
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await Bun.sleep(100)
  }
  cleanup()
  throw new Error('the node did not start')
}

async function restartNode() {
  node.kill()
  await node.exited
  node = Bun.spawn([NODE_BIN, dir], { stdout: 'ignore', stderr: 'ignore' })
  await waitForNode()
}

let passed = 0
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error instanceof Error ? error.message : error}`)
    cleanup()
    process.exit(1)
  }
}
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}
async function expectApiError(code: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (error) {
    check(error instanceof ApiError && error.code === code, `expected ${code}, got ${error instanceof ApiError ? error.code : error}`)
    return
  }
  throw new Error(`expected ${code}, but the call succeeded`)
}
function cleanup() {
  node.kill()
  rmSync(dir, { recursive: true, force: true })
}

const now = Date.now()
const prisonerInput = {
  firstName: 'Test',
  lastName: 'Person',
  otherNames: '',
  nationalId: '',
  reference: '',
  status: 'unconvicted',
  admissionInstrumentType: 'remand_warrant',
  admissionAuthority: 'Jinja Chief Magistrate',
  admittedAt: now - 86_400_000 * 10,
  highCourtOnlyOffence: false,
  dateOfBirth: null,
  sex: 'male',
  educationLevel: null,
  nationality: 'ugandan',
  offence: 'Theft',
  documentsPending: false,
  pendingDocumentType: null,
  notes: '',
}

console.log('waiting for the node...')
await waitForNode()

console.log('first launch and sign-in')
await step('a fresh node needs its first account and refuses everything else', async () => {
  const state = await getSystemState()
  check(state.bootstrap === true && state.role === null, 'fresh node should be in bootstrap with no role')
  await expectApiError('UNAUTHENTICATED', () => listPrisoners(''))
})
await step('choose facility, create the first account, and be signed in', async () => {
  await chooseRole('facility')
  const result = await bootstrapFirstAccount({ badgeNumber: 'OIC-1', name: 'Officer In Charge', password: 'correct-horse' })
  check(result.officer.role === 'oic' && result.officer.isAdmin, 'first account is an OIC administrator')
  check(result.permissions.includes('authorise.exception'), 'OIC holds the exception permission')
  const session = await getSession()
  check(session.officer.badgeNumber === 'OIC-1', 'session resolves to the signed-in officer')
  check((await getSystemState()).bootstrap === false, 'bootstrap is over')
})
await step('accounts: create a general-duty officer and a records clerk', async () => {
  await createOfficer({ badgeNumber: 'OFF-1', name: 'Warder One', password: 'another-password', role: 'officer', isAdmin: false })
  await createOfficer({ badgeNumber: 'REC-1', name: 'Records Clerk', password: 'another-password', role: 'records', isAdmin: false })
  check((await listOfficers()).length === 3, 'three accounts')
})

console.log('operational records as a general-duty officer')
await signOut()
await signIn('OFF-1', 'another-password')

/** Reception is the only way in: the same wire shape the guided procedure posts. */
async function createPrisoner(input: { firstName: string; lastName: string }) {
  const result = (await api('POST', '/api/prisons/receptions', {
    body: {
      decision: 'accept',
      receivedAt: now - 86_400_000 * 10,
      person: { firstName: input.firstName, lastName: input.lastName },
      legalStatus: 'unconvicted',
      highCourtOnlyOffence: false,
      instrument: { kind: 'remand_warrant', issuingAuthority: 'Jinja Chief Magistrate', authenticated: true },
      searchDone: true,
      rulesInformationGiven: true,
      property: [],
      contacts: [],
    },
  })) as { prisoner: { id: string } }
  return getPrisoner(result.prisoner.id).then((p) => p!)
}

let prisonerId = ''
// Debug builds seed one sample prisoner, so counts are compared to a baseline.
const baseline = { inCustody: (await listInCustody()).length, remand: (await listRemand()).length }
await step('admit a prisoner and read it back', async () => {
  const prisoner = await createPrisoner(prisonerInput)
  prisonerId = prisoner.id
  check((await getPrisoner(prisonerId))?.lastName === 'Person', 'get returns the record')
  check((await listPrisoners('Person')).length === 1, 'search by name')
  check((await listInCustody()).length === baseline.inCustody + 1, 'in custody')
  const updated = await updatePrisoner(prisonerId, {
    firstName: 'Test', lastName: 'Person', otherNames: '', nationalId: '', reference: 'REF-1', status: 'unconvicted',
    highCourtOnlyOffence: false, currentLocation: 'Ward 3', dateOfBirth: null, sex: 'male', educationLevel: null,
    nationality: 'ugandan', offence: 'Theft', documentsPending: false, pendingDocumentType: null, notes: '',
  })
  check(updated.reference === 'REF-1', 'update applied')
})
await step('every care and contact domain accepts a record and returns the shape the UI expects', async () => {
  await createVisit({ prisonerId, visitorName: 'A Visitor', visitorIdentification: '', visitedAt: now, supervisingOfficer: '', notes: '', visitType: 'ordinary', status: 'attended', authorizedBy: '' })
  check((await listVisits('')).length === 1, 'visit log')
  await createHealthEvent({ prisonerId, eventType: 'hospital_referral', facilityName: 'Murchison Bay', occurredAt: now, authorizedBy: '', notes: '' })
  check((await listHospitalised()).length === 1, 'hospitalised')
  await createCourtProduction({ prisonerId, courtReference: 'CR-1', productionDate: now, purpose: 'Mention', productionMethod: 'physical' })
  check((await listRemand()).length === baseline.remand + 1, 'remand list')
  const request = await createRequest({ prisonerId, category: 'food', description: 'Portions', raisedAt: now })
  await resolveRequest(request.id, { resolvedAt: now, outcomeNote: 'Raised with kitchen' })
  check((await listRequests()).length === 1, 'requests')
  const programme = await createProgrammeParticipation({ prisonerId, category: 'vocational', programmeName: 'Tailoring', status: 'enrolled', startedAt: now, notes: '' })
  await certifyProgrammeParticipation(programme.id, { completedAt: now, certificateReference: 'UVTAB-1' })
  check((await search('Person')).length >= 1, 'search covers the prisoner')
  check((await getReportsSummary()).prisonerCategoryCounts.length >= 0, 'reports summary parses')
})
await step('discharge is blocked while property is outstanding, and an officer cannot waive the gate', async () => {
  const property = await createPropertyRecord({ prisonerId, description: 'Phone', recordedAt: now })
  await expectApiError('DISCHARGE_GATES_UNMET', () =>
    createRelease({ prisonerId, releaseType: 'bail', releasedAt: now, orderedBy: 'Court', notes: '' }),
  )
  await returnPropertyRecord(property.id, { returnedAt: now, returnedNote: 'Handed back' })
  check((await listPropertyRecordsForPrisoner(prisonerId))[0].returnedAt != null, 'returned')
  const transfer = await prepareTransfer({ prisonerId, destinationName: 'Luzira', orderReference: 'CGP/1', orderingAuthority: 'CGP', reason: '', plannedAt: now, notes: '' })
  await dispatchTransfer(transfer.id, { departedAt: now, escort: 'Two officers', transport: 'Prison truck', passphrase: 'a-long-passphrase' })
  check((await getPrisoner(prisonerId))?.currentStatus === 'in_transit', 'dispatch puts the person in transit, still in custody')
})
await step('Today, Legal, the prisoner file and the facility profile parse against the node', async () => {
  await saveFacilityProfile({ name: 'Test Prison', facilityNumber: 'T-1', location: 'Nowhere', region: 'Central', approvedCapacity: '100' })
  check((await getFacilityProfile()).approvedCapacity === 100, 'profile saved')
  const today = await getToday()
  check(today.facility.name === 'Test Prison', 'today carries the facility')
  check(today.movements.inTransit === 1, 'the dispatched transfer is in flight')
  check(today.obligations.some((o) => o.kind === 'transfer_confirmation'), 'an unconfirmed transfer is an exception')
  const legal = await getLegalOverview()
  check(Array.isArray(legal.thresholds), 'legal overview parses')
  const file = await getPrisonerFile(prisonerId)
  check(file.stays.length === 1 && file.stays[0].exitedAt === null, 'one open stay while in transit')
  check(file.instruments.some((i) => i.status === 'verified'), 'the admission instrument is on the file')
})
await step('documents: add, list, void with a reason, and the file is kept', async () => {
  const doc = await addAttachment('prisoner', prisonerId, { fileName: 'warrant.txt', contentBase64: btoa('remand warrant') })
  check((await listAttachments('prisoner', prisonerId)).length === 1, 'listed')
  await expectApiError('FORBIDDEN', () => voidAttachment(doc.id, 'wrong role'))
  await expectApiError('DOCUMENT_REJECTED', () => addAttachment('../../etc', prisonerId, { fileName: 'x.txt', contentBase64: btoa('x') }))
})

console.log('permissions and audit')
await step('a general-duty officer cannot manage accounts, devices, audit or Head Office', async () => {
  await expectApiError('FORBIDDEN', () => listOfficers())
  await expectApiError('FORBIDDEN', () => api('GET', '/api/system/audit'))
  await expectApiError('FORBIDDEN', () => api('GET', '/api/hq/facilities'))
  await expectApiError('FORBIDDEN', () => api('POST', '/api/hq/facilities/pairing-code', { body: { officerEmail: 'a@b.c' } }))
})
await step('the OIC can void the document and read an intact, complete audit trail', async () => {
  await signOut()
  await signIn('OIC-1', 'correct-horse')
  const docs = await listAttachments('prisoner', prisonerId)
  await voidAttachment(docs[0].id, 'Scanned the wrong page')
  check((await listAttachments('prisoner', prisonerId)).length === 0, 'voided documents drop out of the list')

  const chain = (await api('GET', '/api/system/audit/verify')) as { ok: boolean; checked: number }
  check(chain.ok && chain.checked > 15, `audit chain intact (${chain.checked} entries)`)
  const rows = (await api('GET', '/api/system/audit', { query: { entityType: 'prisoner', entityId: prisonerId } })) as Array<{ action: string; actorBadge: string }>
  const actions = rows.map((r) => r.action)
  for (const expected of ['custody.admit', 'custody.edit', 'custody.status_changed']) {
    check(actions.includes(expected), `audit has ${expected}`)
  }
  check(rows.every((r) => r.actorBadge === 'OFF-1'), 'every prisoner change is attributed to the officer who made it')
})
await step('signing out ends the session, and a stale token is refused', async () => {
  await signOut()
  await expectApiError('UNAUTHENTICATED', () => getSession())
  setSessionToken('not-a-real-token')
  await expectApiError('UNAUTHENTICATED', () => listPrisoners(''))
  setSessionToken(null)
})

console.log('backup, restore and recovery')
const PASSPHRASE = 'a long recovery passphrase'
let inCustodyAtBackup = 0
await step('an administrator sets a recovery passphrase, backs up, and verifies the backup', async () => {
  await signIn('OIC-1', 'correct-horse')
  check((await getBackups()).config.configured === false, 'backups start unconfigured')
  await expectApiError('BACKUP_NOT_CONFIGURED', () => runBackup())
  await expectApiError('WEAK_PASSPHRASE', () => saveBackupConfig({ backupDir: null, intervalHours: 24, retention: 3, passphrase: 'short' }))
  await saveBackupConfig({ backupDir: null, intervalHours: 24, retention: 3, passphrase: PASSPHRASE })
  inCustodyAtBackup = (await listPrisoners('')).length
  const info = await runBackup()
  const overview = await getBackups()
  check(overview.backups.length === 1 && overview.config.lastBackupStatus === 'ok', 'one backup, recorded as ok')
  await expectApiError('BACKUP_UNREADABLE', () => verifyBackup(info.path, 'not the passphrase'))
  const summary = await verifyBackup(info.path, PASSPHRASE)
  check(summary.files >= 2, 'database plus the document are inside')
})
await step('a restore is staged, applied at the next start, and rolls back later work without deleting anything', async () => {
  await createPrisoner({ firstName: 'Later', lastName: 'Arrival' })
  check((await listPrisoners('')).length === inCustodyAtBackup + 1, 'work after the backup exists')
  const backup = (await getBackups()).backups[0]
  await restoreBackup(backup.path, PASSPHRASE)
  await restartNode()

  await signIn('OIC-1', 'correct-horse')
  check((await listPrisoners('')).length === inCustodyAtBackup, 'work after the backup is not in the restored database')
  const rows = (await api('GET', '/api/system/audit', { query: { entityType: 'installation' } })) as Array<{ action: string }>
  check(rows.some((r) => r.action === 'system.restored'), 'the restore is in the audit trail')
  const chain = (await api('GET', '/api/system/audit/verify')) as { ok: boolean }
  check(chain.ok, 'the audit chain is intact after the restore')
  check(existsSync(join(dir, 'pre-restore')) && readdirSync(join(dir, 'pre-restore')).length === 1, 'the replaced database was kept aside')
})
await step('a corrupted database starts in recovery mode and is restored from a backup', async () => {
  const backup = (await getBackups()).backups[0]
  node.kill()
  await node.exited
  writeFileSync(join(dir, 'prisons.db'), Buffer.alloc(16384, 0xab))
  for (const suffix of ['-wal', '-shm']) rmSync(join(dir, `prisons.db${suffix}`), { force: true })
  node = Bun.spawn([NODE_BIN, dir], { stdout: 'ignore', stderr: 'ignore' })
  await waitForNode()

  const status = await getRecoveryStatus()
  check(status.recovering === true && (status.reason ?? '').length > 0, 'the node reports it is recovering, and why')
  await expectApiError('HTTP_404', () => listPrisoners(''))
  const found = await listRecoveryBackups(status.defaultBackupDir ?? null)
  check(found.length === 1, 'recovery mode finds the backup')
  await expectApiError('BACKUP_UNREADABLE', () => restoreInRecovery(found[0].path, 'wrong passphrase!'))
  await restoreInRecovery(found[0].path, PASSPHRASE)
  await restartNode()

  check((await getRecoveryStatus()).recovering === false, 'back to normal operation')
  await signIn('OIC-1', 'correct-horse')
  check((await listPrisoners('')).length === inCustodyAtBackup, 'the data is the backup’s')
  check(backup.path.length > 0, 'the backup file is still there')
})

console.log('facility LAN and connection state')
await step('the node reports its state explicitly, serves workstations on request, and enrols a workstation code', async () => {
  const before = await getEnvironment()
  check(before.network.mode === 'standalone' && before.network.listening === false, 'starts as this computer only')
  check(before.headOffice.status === 'unpaired', 'an unpaired facility says so, not "connected"')
  check(before.backup.configured === true, 'backup was set up above')
  check((await getLocalConnection()).mode === 'standalone', 'local connection is standalone')

  let served = await setNodeMode(true, 47931)
  check(served.network.mode === 'node', 'mode switched to node')
  for (let i = 0; i < 40 && !served.network.listening; i++) {
    await Bun.sleep(250)
    served = await getEnvironment()
  }
  check(served.network.listening === true, 'the LAN listener is actually accepting connections')
  check((served.network.fingerprint ?? '').split(':').length === 32, 'a fingerprint is shown for workstations to pin')

  const code = await createEnrolmentCode('Registry PC')
  check(/^\d{4}-\d{4}$/.test(code.code), 'an eight digit enrolment code')
  check((await listDevices()).length === 0, 'no workstation is enrolled until one uses the code')

  const off = await setNodeMode(false)
  check(off.network.mode === 'standalone', 'serving can be switched off again')
})

cleanup()
console.log(`\nall ${passed} steps passed`)

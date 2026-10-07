/**
 * Seeds the two test installations started by start.sh with a real case and
 * connects them, all through the same API the window uses:
 *
 *   Albertine Region (HQ)  - a Command, registers Kagadi and issues it a code
 *   Kagadi Police Station  - a Station, connects to the Command with that code,
 *                            then holds the file KD CRB 021/2019
 *
 * The case is Uganda v Kibuuka [2025] UGHC 121 (docs/platform/real-cases/
 * uganda-v-kibuuka-2025.md): names, place, dates, offence, the post-mortem
 * finding and the arrest are as published in the judgment. The judgment gives
 * the gist of each statement, not its words, so statement texts here are test
 * wording and say so. The station's administrators are fictional.
 *
 * Usage: bun scripts/test-network/seed.ts   (from apps/police, after start.sh)
 * Test-only sign-ins (never real ones), for the sign-in screens:
 *   Kagadi:     badge KG-001, password kagadi-test-2019   (administrator)
 *               badge 31452 (D/Sgt Tena Malco), badge only
 *   Albertine:  badge AR-001, password albertine-test-2019 (administrator)
 */

const KAGADI = 'http://127.0.0.1:47841/api'
const HQ = 'http://127.0.0.1:47851/api'
const HQ_FOR_STATIONS = '127.0.0.1:47852'

type Json = Record<string, unknown>

async function call<T = Json>(base: string, path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(base + path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'POST'} ${base}${path}: ${response.status} ${text}`)
  return (text ? JSON.parse(text) : null) as T
}

async function waitFor(base: string, name: string) {
  for (let i = 0; i < 120; i++) {
    try {
      return await call<{ installed: boolean }>(base, '/system/state')
    } catch {
      await Bun.sleep(1000)
    }
  }
  throw new Error(`${name} did not answer at ${base}; is start.sh running?`)
}

/** A paragraph-per-line rich text document, as the statement editor saves it. */
const doc = (...paragraphs: string[]) =>
  JSON.stringify({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })

/** East Africa Time (UTC+3) to a timestamp. */
const eat = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 3, mi)

const TEST_WORDING = '[Test wording: the judgment records the gist of this statement, not its words.]'

async function signIn(base: string, badgeNumber: string, password?: string) {
  const signed = await call<{ token: string }>(base, '/auth/sign-in', { body: { badgeNumber, password: password ?? null } })
  return signed.token
}

async function seedCommand() {
  const state = await waitFor(HQ, 'Albertine Region HQ')
  if (!state.installed) {
    await call(HQ, '/system/onboarding/command', {
      body: {
        commandName: 'Albertine Region Police',
        level: 'region',
        administrator: { existingOfficerId: null, name: 'Regional Administrator (test)', rank: 'SSP', badgeNumber: 'AR-001', password: 'albertine-test-2019' },
      },
    })
    console.log('HQ: set up as Albertine Region Police')
  }
  const token = await signIn(HQ, 'AR-001', 'albertine-test-2019')
  const stations = await call<{ id: string; name: string; stationNumber: string }[]>(HQ, '/hq/stations', { token })
  let kagadi = stations.find((s) => s.name === 'Kagadi Police Station')
  if (!kagadi) {
    kagadi = await call(HQ, '/hq/stations', { token, body: { name: 'Kagadi Police Station', region: 'Albertine', district: 'Kagadi' } })
    console.log(`HQ: registered Kagadi Police Station as ${kagadi!.stationNumber}`)
  }
  const code = await call<{ code: string }>(HQ, `/hq/stations/${kagadi!.id}/activation-code`, { token, body: {} })
  return { stationNumber: kagadi!.stationNumber, code: code.code }
}

async function seedStation(link: { stationNumber: string; code: string }) {
  const state = await waitFor(KAGADI, 'Kagadi Police Station')
  if (!state.installed) {
    await call(KAGADI, '/system/onboarding/station', {
      body: {
        stationName: 'Kagadi Police Station',
        region: 'Albertine',
        district: 'Kagadi',
        division: null,
        administrator: { existingOfficerId: null, name: 'OC Station Kagadi (test)', rank: 'ASP', badgeNumber: 'KG-001', password: 'kagadi-test-2019' },
      },
    })
    console.log('Kagadi: set up')
  }
  const token = await signIn(KAGADI, 'KG-001', 'kagadi-test-2019')
  const t = { token }

  // Connect to the command with the code it issued. The command opens its
  // listener within a few seconds of being set up, so allow it that.
  for (let i = 0; i < 20; i++) {
    const open = await fetch(`http://${HQ_FOR_STATIONS}/api/hq/link/lookup?number=${link.stationNumber}`).then(() => true, () => false)
    if (open) break
    await Bun.sleep(1000)
  }
  const linked = await call<{ state: string }>(KAGADI, '/command-link', { ...t, body: { address: HQ_FOR_STATIONS, stationNumber: link.stationNumber, activationCode: link.code } })
  console.log(`Kagadi: command link ${linked.state}`)

  const cases = await call<{ reference: string }[]>(KAGADI, '/cases', t)
  if (cases.some((c) => c.reference === 'KD CRB 021/2019')) {
    console.log('Kagadi: KD CRB 021/2019 already entered')
    return
  }

  const officer = await call<{ id: string; name: string }>(KAGADI, '/officers', {
    ...t,
    body: { name: 'Tena Malco', rank: 'D/Sgt', post: 'Investigating officer', badgeNumber: '31452', role: 'officer', notes: null, personId: null, password: null },
  })
  await call(KAGADI, '/officers', { ...t, body: { name: 'Desk Officer Kagadi (test)', rank: 'PC', post: 'Counter', badgeNumber: '40877', role: 'officer', notes: null, personId: null, password: null } })

  const person = (firstName: string, lastName: string, address: string, otherNames: string | null = null) =>
    call<{ id: string }>(KAGADI, '/people', { ...t, body: { firstName, lastName, otherNames, phone: null, nationalId: null, address } })
  const accused = await person('Joseph', 'Kibuuka', 'Karambi Village, Kagadi District')
  const deceased = await person('Wilberforce', 'Kyarikora', 'Karambi Village, Kagadi District')
  const brother = await person('Josephat', 'Katungwensi', 'Karambi Village, Kagadi District')
  const eyewitness = await person('Hannah', 'Ngirengyezi', 'Kamusegu Trading Centre, Kagadi District', 'Barihira')

  await call(KAGADI, '/station-diary', {
    ...t,
    body: { category: 'incident_report', content: doc('Report of a sudden death at Kamusegu Trading Centre, Karambi Village: Kyarikora Wilberforce collapsed after drinking waragi and died. Reported by his brother Katungwensi Josephat. Scene visited; body taken for post-mortem.'), personId: brother.id },
  })
  await call(KAGADI, '/station-diary', {
    ...t,
    body: { category: 'incident_report', content: doc('Kibuuka Joseph arrested at Karambi Village as he prepared to leave the area, in connection with the death of Kyarikora Wilberforce. Placed in the cells.'), personId: accused.id },
  })

  const theCase = await call<{ id: string }>(KAGADI, '/cases', {
    ...t,
    body: {
      reference: 'KD CRB 021/2019',
      summary:
        'Murder of Kyarikora Wilberforce on 5 January 2019 at Kamusegu Trading Centre, Karambi Village, Kagadi District. The suspect shared a glass of waragi with the deceased and a witness; the deceased collapsed and died. Post-mortem: organophosphate poisoning. Motive alleged: the suspect had eloped with the deceased’s wife. Suspect arrested the same day as he prepared to flee.',
      status: 'open',
      incidentId: null,
      people: [
        { personId: accused.id, role: 'suspect' },
        { personId: deceased.id, role: 'victim' },
        { personId: brother.id, role: 'complainant' },
        { personId: eyewitness.id, role: 'witness' },
      ],
    },
  })

  const statement = (personId: string, givenAt: number, ...text: string[]) =>
    call(KAGADI, '/statements', { ...t, body: { content: doc(...text, TEST_WORDING), personId, caseId: theCase.id, officerId: officer.id, officerName: null, givenAt } })
  await statement(
    brother.id,
    eat(2019, 1, 5, 21, 0),
    'I am the brother of the late Kyarikora Wilberforce. On 5 January 2019 I was called to Kamusegu Trading Centre where I found my brother had collapsed after drinking waragi. He died before he could be helped.',
    'My brother’s wife had left him for Kibuuka Joseph. There was bad blood between the two men because of it.',
  )
  await statement(
    eyewitness.id,
    eat(2019, 1, 6, 10, 0),
    'On 5 January 2019 I was at Kamusegu Trading Centre with Kyarikora Wilberforce and Kibuuka Joseph. Kibuuka Joseph shared a glass of waragi with us. After Kyarikora drank, he collapsed and died.',
  )
  await statement(
    accused.id,
    eat(2019, 1, 6, 15, 0),
    'Charge and caution statement of the suspect, recorded by D/Sgt Tena Malco. The suspect was told the allegation of the murder of Kyarikora Wilberforce and cautioned.',
    '[Test wording: in the judgment the investigating officer gave evidence as PW3; this record stands for the caution taken at the station.]',
  )

  await call(KAGADI, '/exhibits', {
    ...t,
    body: {
      caseId: theCase.id,
      incidentId: null,
      personId: deceased.id,
      description: 'Post-mortem report on Kyarikora Wilberforce: cause of death organophosphate poisoning',
      identificationMark: 'P. Exh. 1',
      recoveredAt: eat(2019, 1, 7, 12, 0),
      recoveredFromLocation: 'Medical officer, by request of Kagadi Police Station',
      handedOverBy: 'Medical officer',
      witnesses: null,
      receivingOfficerName: 'D/Sgt Tena Malco',
      storageLocation: 'Case file',
      status: 'in_storage',
      notes: 'Admitted at trial under s.66 Trial on Indictments Act; not disputed, doctor not called.',
    },
  })

  await call(KAGADI, '/custody', {
    ...t,
    body: { personId: accused.id, incidentId: null, caseId: theCase.id, arrestedAt: eat(2019, 1, 5, 20, 0), location: 'Karambi Village, Kagadi District', crossJurisdictionTransfer: false, transferredAt: null, status: 'produced_in_court', releasedAt: eat(2019, 1, 7, 9, 0), notes: 'Produced before the Chief Magistrate, Kagadi (Criminal Case No. 69/2019).' },
  })

  await call(KAGADI, '/charge-sheets', {
    ...t,
    body: {
      caseId: theCase.id,
      accusedPersonId: accused.id,
      offence: 'Murder',
      statutorySection: 'Sections 188 and 189 of the Penal Code Act, Cap. 120',
      particulars: 'Kibuuka Joseph, on 5 January 2019 at Kamusegu Trading Centre, Karambi Village, in Kagadi District, with malice aforethought unlawfully caused the death of Kyarikora Wilberforce.',
      chargedAt: eat(2019, 1, 7, 8, 0),
      officerId: officer.id,
      officerName: null,
      stationName: 'Kagadi Police Station',
    },
  })

  console.log('Kagadi: entered KD CRB 021/2019 (4 people, 3 statements, post-mortem exhibit, custody, charge sheet, 2 diary entries)')
}

const link = await seedCommand()
await seedStation(link)
console.log('Done. Sign-ins are listed at the top of this file.')

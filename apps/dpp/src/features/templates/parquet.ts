import { CUSTODY_KINDS } from '@pleadli/setup'
import type { Block } from '@/features/documents/schema'
import type { Template, TemplateContext } from './types'

/**
 * Parquet countries (français): RD Congo and Burundi share the procedure
 * inherited from Belgian law (registre RMP, fixation d'audience, classement
 * sans suite, amende transactionnelle, MAP puis détention préventive). What
 * differs, the courts, the currency, the detention term and the prison, is
 * in each country's `Parquet` below. Sources are the packs' (secondary for
 * both); these are drafts for the magistrate to read, not official forms.
 */

const DOTS = '....................'
const jour = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const heure = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const rmp = (ctx: TemplateContext) => ctx.file.odppRegistrationNumber ?? `RMP ${DOTS}`
const lieu = (ctx: TemplateContext) => ctx.office.region ?? ctx.office.name
const prevenus = (ctx: TemplateContext) => (ctx.accused.length ? ctx.accused.join(', ') : DOTS)
const preventions = (ctx: TemplateContext) =>
  ctx.charges.length ? ctx.charges.map((c) => `${c.offence}${c.section ? ` (${c.section})` : ''}`).join(' ; ') : DOTS

function refs(ctx: TemplateContext): Block {
  return {
    type: 'fields',
    rows: [
      { label: 'N° RMP', value: rmp(ctx) },
      { label: 'PV (OPJ)', value: ctx.file.policeReference ?? DOTS },
      { label: 'Commissariat', value: ctx.file.policeStation ?? DOTS },
    ],
  }
}

function signe(ctx: TemplateContext, qualite: string): Block[] {
  return [
    { type: 'paragraph', text: `Fait à ${lieu(ctx)}, le ${jour(ctx.today)}.` },
    { type: 'signature', label: qualite, name: `${ctx.signer.name}${ctx.signer.rank ? `, ${ctx.signer.rank}` : ''}`, caption: null },
  ]
}

const last = (ctx: TemplateContext, kind: string) => [...ctx.custody].reverse().find((e) => e.kind === kind)
// Mid-sentence, so in lower case: « placé sous mandat d'arrêt provisoire ».
const custodyLabel = (kind: string) => (CUSTODY_KINDS.find((k) => k.id === kind)?.label.fr ?? kind).replace(/^./, (c) => c.toLowerCase())

type Parquet = {
  /** Who rules on detention, with the place. */
  detentionJudge: (lieu: string) => string
  /** The term the first detention order is asked for. */
  detentionTerm: string
  currency: string
  /** Where a detainee is held, for a release order. */
  prison: string
}

const CONGO: Parquet = {
  detentionJudge: () => `Monsieur le Président du Tribunal de paix de ${DOTS}, siégeant en chambre du conseil`,
  detentionTerm: 'quinze jours',
  currency: 'francs congolais',
  prison: `Directeur du Centre pénitentiaire de ${DOTS}`,
}

const BURUNDI: Parquet = {
  detentionJudge: (lieu) => `Monsieur le Président du Tribunal de grande instance de ${lieu}, siégeant en chambre du conseil`,
  detentionTerm: 'trente jours',
  currency: 'francs burundais',
  prison: `Directeur de la Prison de ${DOTS}`,
}

const parquetTemplates = (p: Parquet): Template[] => [
  {
    id: 'requete_fixation',
    title: "Requête aux fins de fixation d'audience",
    about: "Saisit le tribunal de l'affaire pour qu'une date d'audience soit fixée.",
    lang: 'fr',
    forDecisions: ['sanction'],
    build: (ctx) => [
      { type: 'paragraph', text: `À Monsieur le Président du Tribunal de grande instance de ${lieu(ctx)}` },
      refs(ctx),
      { type: 'paragraph', text: `Le Procureur de la République près le Tribunal de grande instance de ${lieu(ctx)} a l'honneur de vous prier de bien vouloir fixer à l'une des plus prochaines audiences publiques la cause inscrite sous le ${rmp(ctx)} à charge de : ${prevenus(ctx)}.` },
      { type: 'heading', text: 'Préventions' },
      ...(ctx.charges.length ? ctx.charges : [{ offence: DOTS, section: null, particulars: DOTS, accused: null }]).flatMap((c): Block[] => [
        { type: 'paragraph', text: `${c.offence}${c.section ? `, prévu et puni par ${c.section}` : ''}.` },
        { type: 'paragraph', text: `Pour avoir : ${c.particulars ?? DOTS}` },
      ]),
      { type: 'heading', text: 'Faits' },
      { type: 'paragraph', text: ctx.decision?.reasons ?? DOTS },
      { type: 'paragraph', text: `Le dossier ${rmp(ctx)} est joint à la présente.` },
      ...signe(ctx, 'Le Procureur de la République'),
    ],
  },
  {
    id: 'classement_sans_suite',
    title: 'Décision de classement sans suite',
    about: "Motive la décision de ne pas poursuivre et clôture le dossier au parquet.",
    lang: 'fr',
    forDecisions: ['decline'],
    build: (ctx) => [
      refs(ctx),
      { type: 'paragraph', text: `Vu le dossier ${rmp(ctx)} ouvert à charge de ${prevenus(ctx)} ;` },
      { type: 'paragraph', text: `Attendu que : ${ctx.decision?.reasons ?? DOTS}` },
      { type: 'heading', text: 'Par ces motifs' },
      { type: 'paragraph', text: `Décidons que le dossier ${rmp(ctx)} est classé sans suite. Il pourra être rouvert en cas d'éléments nouveaux.` },
      ...signe(ctx, 'Le Magistrat du parquet'),
    ],
  },
  {
    id: 'requisition_opj',
    title: "Réquisition à officier de police judiciaire",
    about: "Renvoie le dossier à l'OPJ avec les devoirs complémentaires à accomplir.",
    lang: 'fr',
    forDecisions: ['return_for_investigation'],
    build: (ctx) => [
      { type: 'paragraph', text: `À l'Officier de police judiciaire, ${ctx.file.policeStation ?? `Commissariat de ${DOTS}`}` },
      refs(ctx),
      { type: 'paragraph', text: `Dans le dossier ${rmp(ctx)} à charge de ${prevenus(ctx)}, nous vous requérons d'accomplir les devoirs suivants :` },
      { type: 'list', ordered: true, items: (ctx.directions.length ? ctx.directions : [{ kind: '', instruction: DOTS }]).map((d) => ({ title: null, text: d.instruction })) },
      { type: 'paragraph', text: `Et de nous faire retour du dossier, avec les procès-verbaux dressés, dans un délai de ${DOTS} jours.` },
      ...signe(ctx, 'Le Magistrat du parquet'),
    ],
  },
  {
    id: 'amende_transactionnelle',
    title: "Proposition d'amende transactionnelle",
    about: "Propose au prévenu d'éteindre l'action publique par le paiement d'une amende.",
    lang: 'fr',
    forDecisions: ['divert'],
    build: (ctx) => [
      refs(ctx),
      { type: 'paragraph', text: `À ${prevenus(ctx)}` },
      { type: 'paragraph', text: `Vous êtes poursuivi(e) dans le dossier ${rmp(ctx)} du chef de : ${preventions(ctx)}.` },
      { type: 'paragraph', text: `Le parquet vous propose d'éteindre l'action publique moyennant le paiement d'une amende transactionnelle de ${DOTS} ${p.currency}, à verser au Trésor public dans un délai de ${DOTS} jours à compter de la réception de la présente.` },
      { type: 'paragraph', text: "À défaut de paiement dans ce délai, les poursuites seront reprises." },
      ...signe(ctx, 'Le Magistrat du parquet'),
      { type: 'signature', label: 'Lu et accepté par le prévenu', name: '', caption: null },
    ],
  },
  {
    id: 'requete_detention',
    title: 'Requête aux fins de détention préventive',
    about: "Demande au juge une ordonnance de détention préventive (ODP) avant l'expiration du MAP.",
    lang: 'fr',
    forDecisions: [],
    build: (ctx) => {
      const map = last(ctx, 'map')
      return [
        { type: 'paragraph', text: `À ${p.detentionJudge(lieu(ctx))}` },
        refs(ctx),
        { type: 'paragraph', text: `Le Magistrat du parquet a l'honneur de vous exposer que le nommé ${prevenus(ctx)}, prévenu de ${preventions(ctx)}, a été placé sous ${custodyLabel('map')}${map ? ` le ${heure(map.at)}` : ` le ${DOTS}`}.` },
        { type: 'paragraph', text: `Attendu qu'il existe à sa charge des indices sérieux de culpabilité, que les faits sont punissables d'une servitude pénale de plus de six mois, et que sa détention est nécessaire pour ${DOTS} ;` },
        { type: 'paragraph', text: `Plaise au Tribunal d'autoriser la détention préventive du prévenu pour une durée de ${p.detentionTerm}.` },
        ...signe(ctx, 'Le Magistrat du parquet'),
      ]
    },
  },
  {
    id: 'ordre_liberation',
    title: 'Ordre de mise en liberté',
    about: "Ordonne la libération immédiate d'une personne dont la détention n'est plus couverte.",
    lang: 'fr',
    forDecisions: [],
    build: (ctx) => [
      refs(ctx),
      { type: 'paragraph', text: `Mandons et ordonnons au ${p.prison} de mettre immédiatement en liberté, s'il n'est retenu pour autre cause, le nommé ${prevenus(ctx)}, détenu dans le cadre du dossier ${rmp(ctx)}.` },
      { type: 'paragraph', text: `Motif : ${DOTS}` },
      ...signe(ctx, 'Le Magistrat du parquet'),
    ],
  },
]

export const congoTemplates = parquetTemplates(CONGO)
export const burundiTemplates = parquetTemplates(BURUNDI)

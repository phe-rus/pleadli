import { ReportEditor } from './report-editor'
import { ReportPage } from './report-page'
import { isDraftId } from './schema'

/** `/reports/$report` is either a draft being composed or a report that has
 * been issued; the node names drafts so the address says which. */
export function ReportRoutePage({ id }: { id: string }) {
  return isDraftId(id) ? <ReportEditor id={id} /> : <ReportPage id={id} />
}

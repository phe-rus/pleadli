import { transferErrorText, useImportDossier } from '@/features/transfers'
import { openExchangeFile, type ExchangeFile } from '@/lib/exchange-files'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

/**
 * Receive a transfer (docs/prisons/product-map/02 W5, receiver side): open the
 * sealed dossier that arrived with the person, unlock it with the passphrase
 * the sending Officer in Charge gave, and go on to the arrival.
 */
export function ReceivePage() {
  const navigate = useNavigate()
  const importDossier = useImportDossier()
  const [file, setFile] = useState<ExchangeFile | null>(null)
  const [passphrase, setPassphrase] = useState('')

  const choose = async () => {
    try {
      const picked = await openExchangeFile('pleadli-dossier')
      if (picked) setFile(picked)
    } catch (error) {
      t.error(m.route_procedures_could_not_open_the_file(), { description: transferErrorText(error, m.route_procedures_please_try_again()) })
    }
  }

  const submit = async () => {
    if (!file) return
    try {
      const transfer = await importDossier.mutateAsync({ contentBase64: file.contentBase64, passphrase })
      t.success(m.route_procedures_dossier_opened(), { description: m.route_procedures_now_verify_the_person_against_it() })
      await navigate({ to: '/procedures/arrival/$transferId', params: { transferId: transfer.id } })
    } catch (error) {
      t.error(m.route_procedures_could_not_open_the_dossier(), { description: transferErrorText(error, m.route_procedures_check_the_file_and_the_passphrase()) })
    }
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <Link to="/movements" className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
            {m.route_procedures_back_to_movements()}
          </Link>
          <h1>{m.route_procedures_receive_a_transfer()}</h1>
          <p className="md:max-w-xl">{m.route_procedures_open_the_sealed_dossier_that_came()}</p>
        </div>
      </header>
      <Card className="md:max-w-xl">
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{m.route_procedures_1_the_dossier_file()}</p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={choose}>
                {file ? m.route_procedures_choose_a_different_file() : m.route_procedures_choose_the_dossier_file()}
              </Button>
              <span className="truncate text-xs text-muted-foreground">{file ? file.fileName : m.route_procedures_a_file_ending_in_pleadli_dossier()}</span>
            </div>
          </div>
          <Field>
            <FieldLabel>{m.route_procedures_2_passphrase()}</FieldLabel>
            <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
          </Field>
          <div>
            <Button onClick={submit} disabled={!file || passphrase.length === 0 || importDossier.isPending}>
              {m.route_procedures_open_the_dossier()}
            </Button>
          </div>
        </CardContent>
      </Card>
    </article>
  )
}

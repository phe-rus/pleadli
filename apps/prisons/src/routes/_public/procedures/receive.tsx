import { transferErrorText, useImportDossier } from '@/features/transfers'
import { openExchangeFile, type ExchangeFile } from '@/lib/exchange-files'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/procedures/receive')({
  component: RouteComponent,
})

/**
 * Receive a transfer (docs/prisons/product-map/02 W5, receiver side): open the
 * sealed dossier that arrived with the person, unlock it with the passphrase
 * the sending Officer in Charge gave, and go on to the arrival.
 */
function RouteComponent() {
  const navigate = useNavigate()
  const importDossier = useImportDossier()
  const [file, setFile] = useState<ExchangeFile | null>(null)
  const [passphrase, setPassphrase] = useState('')

  const choose = async () => {
    try {
      const picked = await openExchangeFile('pleadli-dossier')
      if (picked) setFile(picked)
    } catch (error) {
      t.error('Could not open the file', { description: transferErrorText(error, 'Please try again.') })
    }
  }

  const submit = async () => {
    if (!file) return
    try {
      const transfer = await importDossier.mutateAsync({ contentBase64: file.contentBase64, passphrase })
      t.success('Dossier opened', { description: 'Now verify the person against it.' })
      await navigate({ to: '/procedures/arrival/$transferId', params: { transferId: transfer.id } })
    } catch (error) {
      t.error('Could not open the dossier', { description: transferErrorText(error, 'Check the file and the passphrase.') })
    }
  }

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <Link to="/movements" className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
          Back to Movements
        </Link>
        <h1>Receive a transfer</h1>
        <p className="md:max-w-xl">Open the sealed dossier that came with the person. It stays sealed until you enter the passphrase the sending Officer in Charge gave you.</p>
      </section>
      <Card className="md:max-w-xl">
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">1. The dossier file</p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={choose}>
                {file ? 'Choose a different file' : 'Choose the dossier file'}
              </Button>
              <span className="truncate text-xs text-muted-foreground">{file ? file.fileName : 'A file ending in .pleadli-dossier'}</span>
            </div>
          </div>
          <Field>
            <FieldLabel>2. Passphrase</FieldLabel>
            <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
          </Field>
          <div>
            <Button onClick={submit} disabled={!file || passphrase.length === 0 || importDossier.isPending}>
              Open the dossier
            </Button>
          </div>
        </CardContent>
      </Card>
    </article>
  )
}

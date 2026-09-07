export type InstitutionType = 'police' | 'dpp' | 'courts' | 'prisons' | 'lawyers'

export const INSTITUTION_TYPES: readonly InstitutionType[] = [
  'police',
  'dpp',
  'courts',
  'prisons',
  'lawyers',
] as const

export type TemplateUnit = {
  name: string
  children?: TemplateUnit[]
}

export type TemplateField = {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'date'
  required?: boolean
  options?: string[]
}

export type TemplateEntitlement = {
  application: string
  enabled: boolean
}

export type InstitutionTemplate = {
  id: string
  institutionType: InstitutionType
  name: string
  description: string | null
  defaultUnits: TemplateUnit[]
  defaultEntitlements: TemplateEntitlement[]
  formSchema: TemplateField[]
  createdAt: Date
  updatedAt: Date
}
export type Organization = {
  id: string
  name: string
  slug: string
  logo?: string | null
  institutionType: string
  createdAt?: Date
}

export type OrganizationUnit = {
  id: string
  organizationId: string
  parentId: string | null
  name: string
  createdAt: Date
}

export type Membership = {
  id: string
  userId: string
  organizationUnitId: string
  title: string
  createdAt: Date
}

export type Entitlement = {
  id: string
  organizationId: string
  application: string
  enabled: boolean
  createdAt: Date
}
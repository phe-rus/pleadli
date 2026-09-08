import {
  banUser,
  impersonateUser,
  removeUser,
  revokeUserSessions,
  setUserRole,
  unbanUser,
} from '@/functions/admin.func'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@pleadli/ui/drawer'
import { FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Separator } from '@pleadli/ui/separator'
import { useRouter } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import * as z from 'zod'

type UserRow = {
  id: string
  name: string
  email: string
  image?: string | null
  emailVerified: boolean
  role?: string
  banned?: boolean | null
  createdAt: Date
  updatedAt: Date
}

const roleSchema = z.object({
  role: z.enum(['admin', 'user']),
})

export function UserManagementDrawer({
  user,
  onClose,
}: {
  user: UserRow
  onClose: () => void
}) {
  const router = useRouter()

  const roleForm = useAppForm({
    defaultValues: { role: user.role === 'admin' ? ('admin' as const) : ('user' as const) },
    validators: { onChange: roleSchema },
    onSubmit: async ({ value }) => {
      try {
        await setUserRole({ data: { userId: user.id, role: value.role } })
        t.success('Role updated', {
          description: `${user.name} is now ${value.role}`
        })
        router.invalidate()
      } catch {
        t.error('Could not update role', {
          description: 'Please try again.'
        })
      }
    },
  })

  async function handleImpersonate() {
    try {
      await impersonateUser({ data: { userId: user.id } })
      t.success('Now impersonating', {
        description: user.name
      })
      router.invalidate()
    } catch {
      t.error('Could not impersonate user', {
        description: 'Please try again.'
      })
    }
  }

  async function handleBan() {
    try {
      await banUser({ data: { userId: user.id } })
      t.success('User banned', {
        description: user.name
      })
      router.invalidate()
    } catch {
      t.error('Could not ban user', {
        description: 'Please try again.'
      })
    }
  }

  async function handleUnban() {
    try {
      await unbanUser({ data: { userId: user.id } })
      t.success('User unbanned', {
        description: user.name
      })
      router.invalidate()
    } catch {
      t.error('Could not unban user', {
        description: 'Please try again.'
      })
    }
  }

  async function handleRevokeSessions() {
    try {
      await revokeUserSessions({ data: { userId: user.id } })
      t.success('Sessions revoked', {
        description: user.name
      })
      router.invalidate()
    } catch {
      t.error('Could not revoke sessions', {
        description: 'Please try again.'
      })
    }
  }

  async function handleDelete() {
    try {
      await removeUser({ data: { userId: user.id } })
      t.success('User removed', {
        description: user.name
      })
      onClose()
      router.invalidate()
    } catch {
      t.error('Could not remove user', {
        description: 'Please try again.'
      })
    }
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{user.name}</DrawerTitle>
          <DrawerDescription>
            {user.email} · {format(user.createdAt, 'PPP')}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
              {user.role ?? 'user'}
            </Badge>
            <Badge variant={user.banned ? 'destructive' : 'outline'}>
              {user.banned ? 'Banned' : 'Active'}
            </Badge>
            <Badge variant="outline">{user.emailVerified ? 'Verified' : 'Not verified'}</Badge>
          </div>

          <Separator />

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              roleForm.handleSubmit()
            }}
          >
            <FieldGroup>
              <roleForm.AppField
                name="role"
                children={(field) => (
                  <field.select
                    label="Role"
                    options={[
                      { label: 'Admin', value: 'admin' },
                      { label: 'User', value: 'user' },
                    ]}
                  />
                )}
              />
            </FieldGroup>
            <roleForm.AppForm>
              <roleForm.submit label="Update role" />
            </roleForm.AppForm>
          </form>

          <Separator />

          <DrawerFooter>
            <Button type="button" onClick={handleImpersonate}>
              Impersonate
            </Button>
            {user.banned ? (
              <Button type="button" variant="secondary" onClick={handleUnban}>
                Unban user
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={handleBan}>
                Ban user
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleRevokeSessions}>
              Revoke sessions
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete user
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
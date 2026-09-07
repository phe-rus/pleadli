import { Link } from '@tanstack/react-router'

export function AuthBanner({ user }: { user: { name: string; role?: string | null } }) {
  const isAdmin = user.role === 'admin'

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-muted px-4 py-2 text-sm">
      <span className="text-muted-foreground">Signed in as {user.name}</span>
      {isAdmin && (
        <Link to="/admin" className="font-medium text-foreground">
          Dashboard
        </Link>
      )}
    </div>
  )
}

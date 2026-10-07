import handler from '@tanstack/react-start/server-entry'
import { paraglideMiddleware } from './paraglide/server.js'

/** The Worker's entry (wrangler.jsonc `main`): every request is rendered in
 * its visitor's language (cookie, then the browser's Accept-Language, then
 * English), then handed to TanStack Start's own handler. */
export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}

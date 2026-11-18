import handler from "@tanstack/react-start/server-entry";
import { sweepRelay } from "./api/relay-v1";
import { paraglideMiddleware } from "./paraglide/server.js";

/** The Worker's entry (wrangler.jsonc `main`): every request is rendered in
 * its visitor's language (cookie, then the browser's Accept-Language, then
 * English), then handed to TanStack Start's own handler. The daily cron runs
 * the relay sweeper (docs/platform/RELAY-DESIGN.md). */
export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req));
  },
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      sweepRelay().then((result) =>
        console.log("relay sweep", JSON.stringify(result)),
      ),
    );
  },
};

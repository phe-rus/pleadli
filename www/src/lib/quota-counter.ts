import { DurableObject } from 'cloudflare:workers'
import { hitWindow, type Verdict, type WindowState } from './quota-window'

/** The authoritative counter. One object per bucket name (`anon:<hash>`, `cred:<id>`, ...), so every
 * Worker isolate in the world that asks about the same bucket reaches the same single thread. The count
 * is kept in memory for the object's life and written to storage so a restart does not forgive a client.
 * Rate limiting needs no history, so an idle bucket deletes itself (alarm) and costs nothing. */
export class QuotaCounter extends DurableObject {
  private state: WindowState | undefined
  private loaded = false

  async hit(limit: number, windowMs: number): Promise<Verdict> {
    if (!this.loaded) {
      this.state = await this.ctx.storage.get<WindowState>('w')
      this.loaded = true
    }
    // No await between reading and writing the count: nothing can interleave.
    const { state, verdict } = hitWindow(this.state, limit, windowMs, Date.now())
    this.state = state
    void this.ctx.storage.put('w', state)
    void this.ctx.storage.setAlarm(state.start + windowMs + 60_000)
    return verdict
  }

  async alarm() {
    await this.ctx.storage.deleteAll()
    this.state = undefined
  }
}

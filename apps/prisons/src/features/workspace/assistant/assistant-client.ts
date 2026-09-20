/** What the assistant is allowed to see for one question: the view the
 * officer has open, and the record in it. Each is sent only if the officer
 * left its chip switched on. */
export type AssistantContext = {
  view?: { title: string; path: string }
  record?: { kind: 'prisoner'; id: string; name: string }
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  at: number
  /** A user message the assistant never received. */
  failed?: boolean
  /** A question the officer stopped before it was answered. */
  stopped?: boolean
}

/** Thrown while no assistant is connected to this installation. */
export class AssistantUnavailableError extends Error {
  constructor() {
    super('No assistant is connected to this installation.')
    this.name = 'AssistantUnavailableError'
  }
}

/** The one place a real assistant plugs in: history in, the reply text out.
 * Until then it refuses, and the panel says so instead of inventing an answer
 * about a prisoner's file. `signal` aborts the request when the officer stops it. */
export async function askAssistant(_history: readonly ChatMessage[], _context: AssistantContext, _signal?: AbortSignal): Promise<string> {
  throw new AssistantUnavailableError()
}

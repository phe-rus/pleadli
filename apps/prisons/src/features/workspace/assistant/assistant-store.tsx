import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type PropsWithChildren } from 'react'
import { askAssistant, type AssistantContext, type ChatMessage } from './assistant-client'

type AssistantValue = {
  messages: readonly ChatMessage[]
  pending: boolean
  /** The composer's text, kept here so it survives the panel switching to the record and back. */
  draft: string
  setDraft: (text: string) => void
  send: (text: string, context: AssistantContext) => void
  retry: (id: string, context: AssistantContext) => void
  /** Stops the question being answered. */
  stop: () => void
  clear: () => void
}

const AssistantContextValue = createContext<AssistantValue | null>(null)

let counter = 0
const nextId = () => `msg-${Date.now().toString(36)}-${(counter++).toString(36)}`

/** The conversation, kept in memory only: it outlives the panel being folded
 * away and reopened, but never reaches disk, so what an officer asked about a
 * prisoner is gone when the window closes. */
export const AssistantProvider: FC<PropsWithChildren> = ({ children }) => {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState('')
  const request = useRef<AbortController | null>(null)
  // The conversation lives in a ref too, so a question is started from an
  // event handler, never from inside a state updater (which React may run twice).
  const conversation = useRef<readonly ChatMessage[]>([])
  // A reply that arrives after "New chat" belongs to a conversation that no
  // longer exists.
  const epoch = useRef(0)

  const commit = useCallback((next: readonly ChatMessage[]) => {
    conversation.current = next
    setMessages(next)
  }, [])

  const ask = useCallback(
    async (userId: string, context: AssistantContext) => {
      const started = epoch.current
      const history = conversation.current
      const controller = new AbortController()
      request.current = controller
      setPending(true)
      try {
        const reply = await askAssistant(history, context, controller.signal)
        if (epoch.current !== started) return
        commit([
          ...conversation.current.map((message) => (message.id === userId ? { ...message, failed: false } : message)),
          { id: nextId(), role: 'assistant', text: reply, at: Date.now() },
        ])
      } catch {
        if (epoch.current !== started) return
        commit(conversation.current.map((message) => (message.id === userId ? { ...message, failed: true } : message)))
      } finally {
        if (epoch.current === started) setPending(false)
      }
    },
    [commit],
  )

  const send = useCallback(
    (text: string, context: AssistantContext) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const message: ChatMessage = { id: nextId(), role: 'user', text: trimmed, at: Date.now() }
      commit([...conversation.current, message])
      void ask(message.id, context)
    },
    [ask, commit],
  )

  const retry = useCallback(
    (id: string, context: AssistantContext) => {
      const index = conversation.current.findIndex((message) => message.id === id)
      if (index === -1) return
      // The assistant sees the conversation up to the message being retried.
      commit(conversation.current.slice(0, index + 1).map((message) => (message.id === id ? { ...message, failed: false } : message)))
      void ask(id, context)
    },
    [ask, commit],
  )

  const stop = useCallback(() => {
    // Anything the request still delivers belongs to a question given up on.
    epoch.current += 1
    request.current?.abort()
    commit(conversation.current.map((message, index, all) => (index === all.length - 1 && message.role === 'user' ? { ...message, stopped: true } : message)))
    setPending(false)
  }, [commit])

  const clear = useCallback(() => {
    epoch.current += 1
    request.current?.abort()
    commit([])
    setPending(false)
    setDraft('')
  }, [commit])

  const value = useMemo(() => ({ messages, pending, draft, setDraft, send, retry, stop, clear }), [messages, pending, draft, send, retry, stop, clear])
  return <AssistantContextValue.Provider value={value}>{children}</AssistantContextValue.Provider>
}

export function useAssistant(): AssistantValue {
  const value = useContext(AssistantContextValue)
  if (!value) throw new Error('useAssistant must be used within AssistantProvider')
  return value
}

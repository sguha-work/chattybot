import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { streamChat } from './api/ollama'
import { AVAILABLE_MODELS, DEFAULT_SYSTEM, DEFAULT_TEMPERATURE } from './models'
import type { ChatMessage } from './types'

function createId() {
  return crypto.randomUUID()
}

export default function App() {
  const [model, setModel] = useState(AVAILABLE_MODELS[0].id)
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE)
  const [system, setSystem] = useState(DEFAULT_SYSTEM)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy])

  useEffect(() => {
    const node = transcriptRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, busy])

  async function sendMessage() {
    const text = input.trim()
    if (!text || busy) return

    const userMessage: ChatMessage = { id: createId(), role: 'user', content: text }
    const assistantMessage: ChatMessage = { id: createId(), role: 'assistant', content: '' }
    const history = [...messages, userMessage]

    setInput('')
    setError(null)
    setBusy(true)
    setStreamingId(assistantMessage.id)
    setMessages([...history, assistantMessage])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat({
        model,
        messages: history,
        system,
        temperature,
        signal: controller.signal,
        onDelta: (delta) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + delta }
                : message,
            ),
          )
        },
      })
    } catch (caught) {
      if (controller.signal.aborted) return

      const message =
        caught instanceof Error
          ? caught.message
          : 'Something went wrong while talking to the model.'
      setError(
        /failed to fetch|networkerror/i.test(message)
          ? 'Cannot reach the local model. Confirm Ollama is running in Docker on port 11434.'
          : message,
      )
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessage.id && item.content.length === 0
            ? { ...item, content: 'The model did not return a reply.' }
            : item,
        ),
      )
    } finally {
      abortRef.current = null
      setBusy(false)
      setStreamingId(null)
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Chattybot</h1>
          <span>Local studio</span>
        </div>
        <div className="controls">
          <div className="field">
            <label htmlFor="model">Model</label>
            <select
              id="model"
              className="model-select"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={busy}
            >
              {AVAILABLE_MODELS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field temp-field">
            <label htmlFor="temperature">
              Temperature <span>{temperature.toFixed(1)}</span>
            </label>
            <input
              id="temperature"
              className="temp-slider"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
              disabled={busy}
            />
          </div>
        </div>
      </header>

      <section className="system-panel">
        <label htmlFor="system">System</label>
        <textarea
          id="system"
          className="system-input"
          rows={3}
          value={system}
          onChange={(event) => setSystem(event.target.value)}
          disabled={busy}
        />
      </section>

      <main className="transcript" ref={transcriptRef}>
        {messages.length === 0 ? (
          <div className="empty">
            <h2>Start a conversation</h2>
            <p>
              Select a local model, then send a message. Replies stream from the LLM running in
              Docker.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={`row ${message.role}`}>
              <div className="who">{message.role === 'user' ? 'You' : 'Chattybot'}</div>
              <p className="bubble">
                {message.content || (streamingId === message.id ? '' : '…')}
                {streamingId === message.id ? <span className="cursor" /> : null}
              </p>
            </article>
          ))
        )}
      </main>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          void sendMessage()
        }}
      >
        <textarea
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Ask Chattybot…"
          disabled={busy}
        />
        <button className="send" type="submit" disabled={!canSend}>
          {busy ? '…' : 'Send'}
        </button>
        {error ? <p className="status error">{error}</p> : null}
        {busy && !error ? <p className="status">Waiting on {model}</p> : null}
      </form>
    </div>
  )
}

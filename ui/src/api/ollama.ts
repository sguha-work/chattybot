import type { ChatMessage } from '../types'

type OllamaChatChunk = {
  message?: { role?: string; content?: string }
  done?: boolean
  error?: string
}

export class ChatRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatRequestError'
  }
}

export async function streamChat(options: {
  model: string
  messages: ChatMessage[]
  system?: string
  temperature: number
  signal?: AbortSignal
  onDelta: (text: string) => void
}): Promise<void> {
  const system = options.system?.trim()
  const payload = [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...options.messages.map(({ role, content }) => ({ role, content })),
  ]

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      stream: true,
      options: { temperature: options.temperature },
      messages: payload,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new ChatRequestError(
      detail.trim() || `The model could not be reached (${response.status}).`,
    )
  }

  if (!response.body) {
    throw new ChatRequestError('The model returned an empty response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let chunk: OllamaChatChunk
      try {
        chunk = JSON.parse(trimmed) as OllamaChatChunk
      } catch {
        continue
      }

      if (chunk.error) {
        throw new ChatRequestError(chunk.error)
      }

      if (chunk.message?.content) {
        options.onDelta(chunk.message.content)
      }
    }
  }

  if (buffer.trim()) {
    try {
      const chunk = JSON.parse(buffer.trim()) as OllamaChatChunk
      if (chunk.error) throw new ChatRequestError(chunk.error)
      if (chunk.message?.content) options.onDelta(chunk.message.content)
    } catch (error) {
      if (error instanceof ChatRequestError) throw error
    }
  }
}

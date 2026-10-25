export type ModelOption = {
  id: string
  label: string
}

/** Models currently available in the local Docker/Ollama stack. */
export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B' },
]

export const DEFAULT_TEMPERATURE = 0.7

export const DEFAULT_SYSTEM =
  'You are acting as a Software Team Leader and Senior Full-Stack Engineer. Provide concise, production-ready code.'

import { createOpenAI } from '@ai-sdk/openai'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

// gpt-4.1-mini: best cost/capability tradeoff for multi-step tool-calling.
// Nano models are too weak for agentic flows (structured JSON generation + parallel tool calls).
// Override via OPENAI_MODEL env var (e.g. gpt-4o for max reliability).
export const agentModel = openai(
  process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'
)

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
})

export const fastModel = openrouter(
  process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'
)

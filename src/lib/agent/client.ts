import { createOpenAI } from '@ai-sdk/openai'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

export const agentModel = openai(
  process.env.OPENAI_MODEL ?? 'gpt-4o'
)

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
})

export const fastModel = openrouter(
  process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'
)

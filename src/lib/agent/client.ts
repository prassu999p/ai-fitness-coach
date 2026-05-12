import { anthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

export const agentModel = anthropic('claude-sonnet-4-5')

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
})

export const fastModel = openrouter(
  process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'
)

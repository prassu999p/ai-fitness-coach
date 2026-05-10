interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  model?: string
): Promise<string> {
  const selectedModel = model ?? process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gym-trainer.vercel.app',
      'X-Title': 'AI Gym Trainer',
    },
    body: JSON.stringify({ model: selectedModel, messages }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status} ${await response.text()}`)
  }

  const data: OpenRouterResponse = await response.json()
  return data.choices[0].message.content
}

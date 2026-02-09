export type JudgePromptResult = Record<string, string> & { default: string }
export type JudgePromptFunction = (
  question: string,
  groundTruth: string,
  context: string,
  currentDate?: string
) => JudgePromptResult

export interface ProviderPrompts {
  judgePrompt?: JudgePromptFunction
}

export function buildContextString(context: unknown[]): string {
  // If the context has the Nebula MemoryResponse format (wrapped in an array)
  if (context.length === 1 && typeof context[0] === 'object' && context[0] !== null) {
    const result = context[0] as any
    if (result.sources || result.entities || result.knowledge || result.episodes) {
      let output = ""

      if (result.sources && result.sources.length > 0) {
        output += "Sources:\n"
        output += result.sources.map((s: any) => `- ${s.text} (Time: ${s.timestamp})`).join("\n")
        output += "\n\n"
      }

      if (result.entities && result.entities.length > 0) {
        output += "Entities:\n"
        output += result.entities.map((e: any) => {
          let desc = `- ${e.name} (${e.category})`
          if (e.description) desc += `: ${e.description}`
          return desc
        }).join("\n")
        output += "\n\n"
      }

      if (result.knowledge && result.knowledge.length > 0) {
        output += "Knowledge:\n"
        output += result.knowledge.map((k: any) => `- ${k.subject} ${k.predicate} ${k.value}`).join("\n")
        output += "\n\n"
      }

      if (result.episodes && result.episodes.length > 0) {
        output += "Episodes:\n"
        output += result.episodes.map((ep: any) => {
          let desc = `- ${ep.name}`
          if (ep.status) desc += ` (${ep.status})`
          return desc
        }).join("\n")
        output += "\n\n"
      }

      return output.trim() || JSON.stringify(context, null, 2)
    }
  }

  return JSON.stringify(context, null, 2)
}

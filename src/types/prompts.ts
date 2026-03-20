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

export function buildContextString(context: unknown[] | unknown): string {
  // Normalize: if a single item is passed, check it directly; if an array, unwrap single-element arrays
  const item = Array.isArray(context) && context.length === 1 ? context[0] : !Array.isArray(context) ? context : null

  // Check for Nebula MemoryResponse format
  if (item && typeof item === 'object' && item !== null) {
    const result = item as any
    if (result.sources || result.entities || result.semantics || result.episodes || result.procedures) {
      let output = ""

      if (result.semantics && result.semantics.length > 0) {
        output += "Semantics:\n"
        output += result.semantics.map((s: any) =>
          `- ${s.description || `${s.subject || ''} ${s.predicate || ''} ${s.value || ''}`.trim()}${s.category ? ` [${s.category}]` : ''}`
        ).join("\n")
        output += "\n\n"
      }

      if (result.episodes && result.episodes.length > 0) {
        output += "Episodes:\n"
        output += result.episodes.map((ep: any) => `- ${ep.description || ep.name}`).join("\n")
        output += "\n\n"
      }

      if (result.procedures && result.procedures.length > 0) {
        output += "Procedures:\n"
        output += result.procedures.map((p: any) => `- ${p.statement}`).join("\n")
        output += "\n\n"
      }

      if (result.sources && result.sources.length > 0) {
        output += "Sources:\n"
        output += result.sources.map((s: any) => `- ${s.text}${s.timestamp ? ` (Time: ${s.timestamp})` : ''}`).join("\n")
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

      return output.trim() || JSON.stringify(item, null, 2)
    }
  }

  return JSON.stringify(context, null, 2)
}

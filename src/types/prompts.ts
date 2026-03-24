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

  // Check for Nebula MemoryResponse format (semantic, episodic, procedural)
  if (item && typeof item === 'object' && item !== null) {
    const result = item as any
    const semantics = result.semantics || []
    const episodes = result.episodes || []
    const procedures = result.procedures || []
    const sources = result.sources || []

    if (semantics.length || episodes.length || procedures.length || sources.length) {
      let output = ""

      if (semantics.length > 0) {
        output += "Semantic Memory:\n"
        output += semantics.map((k: any) =>
          `- ${k.description || `${k.subject || ''} ${k.predicate || ''} ${k.value || ''}`.trim()}`
        ).join("\n")
        output += "\n\n"
      }

      if (episodes.length > 0) {
        output += "Episodic Memory:\n"
        output += episodes.map((ep: any) => `- ${ep.description || ep.name}`).join("\n")
        output += "\n\n"
      }

      if (procedures.length > 0) {
        output += "Procedural Memory:\n"
        output += procedures.map((p: any) => `- ${p.statement || p.description}`).join("\n")
        output += "\n\n"
      }

      if (sources.length > 0) {
        output += "Sources:\n"
        output += sources.map((s: any) => `- ${s.text} (Time: ${s.timestamp})`).join("\n")
        output += "\n\n"
      }

      return output.trim() || JSON.stringify(item, null, 2)
    }
  }

  return JSON.stringify(context, null, 2)
}

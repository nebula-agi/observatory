import type { RetrievalMetrics } from "../../types/unified"
import type { LanguageModel } from "ai"
import { generateText } from "ai"
import { buildContextString } from "../../types/prompts"

interface RelevanceResult {
  id: string
  relevant: 0 | 1
}

async function evaluateAllChunks(
  model: LanguageModel,
  question: string,
  groundTruth: string,
  searchResults: unknown[]
): Promise<RelevanceResult[]> {
  if (searchResults.length === 0) return []

  const formattedResults = searchResults
    .map((result, index) => {
      const id = `result_${index + 1}`
      const content = buildContextString(result)
      return `=== ${id} ===\n${content}`
    })
    .join("\n\n")

  const prompt = `You are evaluating search results for relevance to a question.

QUESTION:
${question}

EXPECTED ANSWER:
${groundTruth}

SEARCH RESULTS:
${formattedResults}

TASK:
For each search result, determine if it contains information relevant to answering the question.
A result is relevant if it contains content that helps answer the question or supports the expected answer.

Return a JSON array with your evaluation for each result:
[
  {"id": "result_1", "relevant": 1},
  {"id": "result_2", "relevant": 0},
  ...
]

Where:
- "id" is the result identifier (result_1, result_2, etc.)
- "relevant" is 1 if relevant, 0 if not relevant

Return ONLY the JSON array, no other text.`

  try {
    const response = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
    })

    const jsonMatch = response.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return searchResults.map((_, i) => ({ id: `result_${i + 1}`, relevant: 0 as const }))
    }

    const parsed = JSON.parse(jsonMatch[0]) as RelevanceResult[]
    return parsed
  } catch {
    return searchResults.map((_, i) => ({ id: `result_${i + 1}`, relevant: 0 as const }))
  }
}

export async function calculateRetrievalMetrics(
  model: LanguageModel,
  question: string,
  groundTruth: string,
  searchResults: unknown[],
  k: number = 10
): Promise<RetrievalMetrics> {
  const resultsToEval = searchResults.slice(0, k)

  if (resultsToEval.length === 0) {
    return {
      memoryPrecision: 0,
      relevantChars: 0,
      totalChars: 0,
    }
  }

  const relevanceResults = await evaluateAllChunks(model, question, groundTruth, resultsToEval)

  const relevanceScores = resultsToEval.map((_, i) => {
    const id = `result_${i + 1}`
    const result = relevanceResults.find((r) => r.id === id)
    return result?.relevant === 1 ? 1 : 0
  })

  // Memory precision: relevant_chars / total_chars (character-weighted, model-agnostic)
  // Uses buildContextString to measure context as the judge sees it
  const resultSizes = resultsToEval.map((r) => buildContextString(r).length)
  const totalChars = resultSizes.reduce((sum, s) => sum + s, 0)
  const relevantChars = resultSizes.reduce(
    (sum, size, i) => sum + (relevanceScores[i] === 1 ? size : 0),
    0
  )
  const memoryPrecision = totalChars > 0 ? relevantChars / totalChars : 0

  return {
    memoryPrecision,
    relevantChars,
    totalChars,
  }
}

import type { JudgeInput, JudgeResult } from "../types/judge"
import { getJudgePromptForType } from "../prompts/defaults"

export function getJudgePrompt(questionType: string): string {
  return getJudgePromptForType(questionType)
}

export function buildJudgePrompt(input: JudgeInput): string {
  if (input.providerPrompts?.judgePrompt) {
    const prompts = input.providerPrompts.judgePrompt(
      input.question,
      input.groundTruth,
      input.context,
      input.currentDate
    )
    return prompts[input.questionType] ?? prompts.default
  }

  const systemPrompt = getJudgePromptForType(input.questionType)
  const isPreference = input.questionType.toLowerCase().includes("preference")
  const groundTruthLabel = isPreference ? "Rubric" : "Expected Answer"
  const dateLine = input.currentDate ? `\nCurrent Date: ${input.currentDate}` : ""

  return `${systemPrompt}${dateLine}
Question: ${input.question}
${groundTruthLabel}: ${input.groundTruth}

Retrieved Context:
${input.context}`
}

export function parseJudgeResponse(response: string): JudgeResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("No JSON found in response")
    }
    const parsed = JSON.parse(jsonMatch[0])
    return {
      score: parsed.score === 1 ? 1 : 0,
      label: parsed.label === "correct" ? "correct" : "incorrect",
      explanation: parsed.explanation || "",
    }
  } catch {
    const isCorrect =
      response.toLowerCase().includes('"correct"') &&
      !response.toLowerCase().includes('"incorrect"')
    return {
      score: isCorrect ? 1 : 0,
      label: isCorrect ? "correct" : "incorrect",
      explanation: "Failed to parse judge response",
    }
  }
}

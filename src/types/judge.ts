import type { ProviderPrompts } from "./prompts"
import type { LanguageModel } from "ai"

export interface JudgeConfig {
  apiKey: string
  model?: string
}

export interface JudgeInput {
  question: string
  /** Raw question type from benchmark (e.g., "1", "single-session-user", "user_evidence") */
  questionType: string
  groundTruth: string
  /** Formatted context string from search results */
  context: string
  /** Optional provider-specific judge prompts */
  providerPrompts?: ProviderPrompts
  /** Current date for temporal projection (ISO string, e.g. "2026-03-04") */
  currentDate?: string
}

export interface JudgeResult {
  score: number
  label: "correct" | "incorrect"
  explanation: string
}

export interface Judge {
  name: string
  initialize(config: JudgeConfig): Promise<void>
  evaluate(input: JudgeInput): Promise<JudgeResult>
  getPromptForQuestionType(questionType: string, providerPrompts?: ProviderPrompts): string
  getModel(): LanguageModel
}

export type JudgeName = "openai" | "anthropic" | "google"

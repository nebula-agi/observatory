import type { ProviderPrompts } from "../../types/prompts"

export function buildZepJudgePrompt(question: string, groundTruth: string, context: string) {
  const prompt = `You are evaluating whether retrieved context from a memory system contains sufficient information to answer a question.

The context contains facts and entities extracted from conversations. Your task is to determine if this context contains the information needed to correctly answer the question.

Be generous with your grading — as long as the context contains the key facts or details referenced in the expected answer, it should be counted as CORRECT. The context does not need to state the answer verbatim.

For time-related questions, the expected answer will be a specific date, month, year, etc. The context should contain the relevant temporal information (timestamps, dates, event references) that would allow deriving the expected answer. Even if the format differs (e.g., "May 7th" vs "7 May"), consider it CORRECT if it refers to the same date.

Important: Timestamps in the context represent the actual time the event occurred, not the time the event was mentioned in a message.

Question: ${question}
Expected Answer: ${groundTruth}

Retrieved Context:
${context}

First, provide a short (one sentence) explanation of your reasoning, then respond with ONLY a JSON object:
{"score": 1, "label": "correct", "explanation": "..."} if the context contains sufficient information
{"score": 0, "label": "incorrect", "explanation": "..."} if the context does not contain sufficient information

Do NOT include both labels in your response.`

  return { default: prompt }
}

export const ZEP_PROMPTS: ProviderPrompts = {
  judgePrompt: buildZepJudgePrompt,
}

export default ZEP_PROMPTS

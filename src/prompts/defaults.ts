export const DEFAULT_JUDGE_PROMPT = `You are evaluating whether retrieved context from a memory system contains sufficient information to answer a question.

You will be given a question, the expected answer (ground truth), and the retrieved context. Determine if the context contains the information needed to correctly answer the question.

The context is SUFFICIENT if it contains the key facts, details, or evidence needed to derive the expected answer. It does NOT need to state the answer verbatim — as long as the answer can be reasonably inferred from the context, score it as correct. If the context only contains partial or tangentially related information that would not lead to the expected answer, score it as incorrect.

Respond with ONLY a JSON object:
{"score": 1, "label": "correct", "explanation": "..."} if the context contains sufficient information
{"score": 0, "label": "incorrect", "explanation": "..."} if the context does not contain sufficient information`

export const ABSTENTION_JUDGE_PROMPT = `You are evaluating an abstention question. The correct answer is that the information was NOT discussed in the conversation, so the context should NOT contain relevant information for this question.

The context is SUFFICIENT (correct) if it does NOT contain information that would answer this question — meaning the memory system correctly has no relevant data to return. It is INCORRECT if the context contains fabricated or irrelevant information that could lead to a hallucinated answer.

Respond with ONLY a JSON object:
{"score": 1, "label": "correct", "explanation": "..."} if the context correctly lacks the information (or is empty)
{"score": 0, "label": "incorrect", "explanation": "..."} if the context contains misleading information`

export const TEMPORAL_JUDGE_PROMPT = `You are evaluating whether retrieved context from a memory system contains sufficient information to answer a time-related question.

You will be given a question, the expected answer (ground truth), the retrieved context, and the current date. Determine if the context contains the temporal information needed to correctly answer the question. Do not penalize off-by-one errors for the number of days/weeks/months — if the context contains the relevant temporal data that would lead to an answer within one unit of the expected answer, consider it sufficient.

IMPORTANT — Temporal projection: If the context contains a time-relative fact with a timestamp (e.g., "owned for 6 months" recorded in Sep 2025), you should compute the elapsed time from that timestamp to the current date and determine whether the projected value matches the expected answer. The context is sufficient if it contains the base fact and timestamp needed to derive the expected answer through temporal projection.

Respond with ONLY a JSON object:
{"score": 1, "label": "correct", "explanation": "..."} if the context contains sufficient temporal information
{"score": 0, "label": "incorrect", "explanation": "..."} if the context does not contain sufficient temporal information`

export const KNOWLEDGE_UPDATE_JUDGE_PROMPT = `You are evaluating whether retrieved context from a memory system contains sufficient information to answer a question about updated knowledge.

You will be given a question, the expected answer (ground truth), the retrieved context, and the current date. Determine if the context contains the information needed to answer the question. If the context contains both previous and updated information, it is sufficient as long as the updated/current answer can be derived from it.

IMPORTANT — Temporal projection: If the context contains a time-relative fact with a timestamp (e.g., "owned for 6 months" recorded in Sep 2025), you should compute the elapsed time from that timestamp to the current date and determine whether the projected value matches the expected answer. The context is sufficient if it contains the base fact and timestamp needed to derive the expected answer through temporal projection.

Respond with ONLY a JSON object:
{"score": 1, "label": "correct", "explanation": "..."} if the context contains sufficient information (including updates)
{"score": 0, "label": "incorrect", "explanation": "..."} if the context does not contain sufficient information`

export const PREFERENCE_JUDGE_PROMPT = `You are evaluating whether retrieved context from a memory system contains sufficient personal information to satisfy a preference-based question.

You will be given a question, a rubric describing the desired personalized response, and the retrieved context. Determine if the context contains the user's personal information referenced in the rubric. The context does not need to contain all rubric points — it is sufficient as long as it contains the key personal details needed.

Respond with ONLY a JSON object:
{"score": 1, "label": "correct", "explanation": "..."} if the context contains the relevant personal information
{"score": 0, "label": "incorrect", "explanation": "..."} if the context does not contain the relevant personal information`

export function getJudgePromptForType(questionType: string): string {
  const type = questionType.toLowerCase()

  if (type.includes("abstention") || type.includes("adversarial")) {
    return ABSTENTION_JUDGE_PROMPT
  }

  if (type.includes("temporal")) {
    return TEMPORAL_JUDGE_PROMPT
  }

  if (type.includes("update") || type.includes("changing")) {
    return KNOWLEDGE_UPDATE_JUDGE_PROMPT
  }

  if (type.includes("preference")) {
    return PREFERENCE_JUDGE_PROMPT
  }

  return DEFAULT_JUDGE_PROMPT
}

export interface BeamChatMessage {
  content: string
  id: number
  index: string
  question_type: string
  role: "user" | "assistant"
  time_anchor: string
}

export interface BeamProbingQuestion {
  question: string
  /** Answer field varies by question type */
  ideal_response?: string
  ideal_answer?: string
  answer?: string
  expected_compliance?: string
  ideal_summary?: string
  difficulty?: string
  [key: string]: unknown
}

export interface BeamConversationSeed {
  category: string
  id: number
  subtopics: string[]
  theme: string
  title: string
}

export interface BeamUserProfile {
  user_info: string
  user_relationships: string
}

export interface BeamConversation {
  conversation_id: string
  conversation_seed: BeamConversationSeed
  narratives: string
  user_profile: BeamUserProfile
  conversation_plan: string
  chat: BeamChatMessage[][]
  probing_questions: string | Record<string, BeamProbingQuestion[]>
}

export interface AtlasTurn {
  speaker: "user" | "assistant"
  text: string
}

export interface AtlasSession {
  id: string
  timestamp: number
  turns: AtlasTurn[]
}

export interface AtlasGoldAnswer {
  text: string
  supporting_items: string[]
}

export interface AtlasProbe {
  id: string
  pillar: string
  subpillar: string
  question: string
  answer_type: "short_answer" | "boolean" | "abstain" | "verbatim" | "generation"
  gold_answer: AtlasGoldAnswer
}

export interface AtlasWorldSummary {
  entities: string[]
  facts_count: number
  events_count: number
  preferences_count: number
}

export interface AtlasBenchmarkFile {
  seed: number
  world_summary: AtlasWorldSummary
  num_sessions: number
  num_probes: number
  sessions: AtlasSession[]
  probes: AtlasProbe[]
}

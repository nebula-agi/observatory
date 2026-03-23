# Benchmarks

```typescript
interface Benchmark {
    name: string
    load(config?: BenchmarkConfig): Promise<void>
    getQuestions(filter?: QuestionFilter): UnifiedQuestion[]
    getHaystackSessions(questionId: string): UnifiedSession[]
    getGroundTruth(questionId: string): string
    getQuestionTypes(): QuestionTypeRegistry
}
```

## Adding a Benchmark

1. Create `src/benchmarks/mybenchmark/index.ts`
2. Implement `Benchmark` interface
3. Register in `src/benchmarks/index.ts`
4. Add to `BenchmarkName` in `src/types/benchmark.ts`

`load()` should download data if absent and populate internal maps. `getQuestionTypes()` returns `{ [id]: { id, alias, description } }` — aliases are used for CLI filtering and display.

## Existing Benchmarks

| Benchmark | Source | Description |
|-----------|--------|-------------|
| `atlas` | [nebula-agi/atlas](https://github.com/nebula-agi/atlas) | Cognitive memory evaluation across 6 pillars |
| `beam` | [Mohammadta/BEAM](https://huggingface.co/datasets/Mohammadta/BEAM) | Long-term memory benchmark across 10 abilities |
| `locomo` | [snap-research/locomo](https://github.com/snap-research/locomo) | Long-context memory benchmark |
| `longmemeval` | [xiaowu0162/longmemeval](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned) | Long-term memory evaluation |

## Question Types

### Atlas
| Type | Alias | Description |
|------|-------|-------------|
| `world_modeling` | world | Entity resolution and relationship mapping |
| `declarative_reasoning` | declarative | Fact composition, belief revision, constraint propagation |
| `temporal_episodic` | temporal | Temporal sequencing, episode reconstruction, causal explanation |
| `preference_learning` | preference | Preference induction, drift, and scope tracking |
| `knowledge_boundaries` | boundaries | Negative knowledge and confidence calibration |
| `procedural_knowledge` | procedural | Procedure storage, lesson extraction, tool memory |

### BEAM
| Type | Alias | Description |
|------|-------|-------------|
| `abstention` | abstain | Withhold answers when evidence is missing |
| `contradiction_resolution` | contradict | Detect and resolve inconsistencies across turns |
| `event_ordering` | event-order | Reconstruct sequence of events from conversation |
| `information_extraction` | extract | Recall entities and facts from conversation |
| `instruction_following` | instruct | Sustained adherence to user constraints |
| `knowledge_update` | update | Revise facts as new information appears |
| `multi_session_reasoning` | multi | Integrate evidence across conversation segments |
| `preference_following` | pref | Personalized, adaptive responses based on preferences |
| `summarization` | summary | Abstract and compress dialogue content |
| `temporal_reasoning` | temporal | Reason about time relations across conversations |

### LoCoMo
| Type | Alias | Description |
|------|-------|-------------|
| `single-hop` | single | Single-hop fact recall |
| `multi-hop` | multi | Multi-hop reasoning |
| `temporal` | temporal | Temporal reasoning |
| `world-knowledge` | world | Commonsense knowledge |
| `adversarial` | adversarial | Unanswerable questions |

### LongMemEval
| Type | Alias | Description |
|------|-------|-------------|
| `single-session-user` | ss-user | Single-session user facts |
| `single-session-assistant` | ss-asst | Single-session assistant facts |
| `single-session-preference` | ss-pref | Single-session preferences |
| `multi-session` | multi | Multi-session reasoning |
| `temporal-reasoning` | temporal | Temporal reasoning |
| `knowledge-update` | update | Knowledge update tracking |

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
| `convomem` | [Salesforce/ConvoMem](https://huggingface.co/datasets/Salesforce/ConvoMem) | Conversational memory benchmark |
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

### ConvoMem
| Type | Alias | Description |
|------|-------|-------------|
| `user_evidence` | user | User-stated facts |
| `assistant_facts_evidence` | asst | Assistant-stated facts |
| `preference_evidence` | pref | User preferences |
| `changing_evidence` | change | Information updates |
| `implicit_connection_evidence` | implicit | Implicit reasoning |
| `abstention_evidence` | abstain | Unanswerable questions |

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

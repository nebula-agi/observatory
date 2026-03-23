# Observatory Framework

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            OBSERVATORY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   BENCHMARKS    │    │    PROVIDERS    │    │   EVALUATORS    │        │
│  │   (Pluggable)   │    │   (Pluggable)   │    │   (Pluggable)   │        │
│  ├─────────────────┤    ├─────────────────┤    ├─────────────────┤        │
│  │ • LoCoMo        │    │ • Mem0          │    │ • LLM-Judge     │        │
│  │ • LongMemEval   │    │ • Nebula        │    │   (GPT-4o)      │        │
│  │ • BEAM          │    │ • Supermemory   │    │ • F1 / ROUGE    │        │
│  │ • Atlas         │    │ • Zep           │    │ • Recall@K      │        │
│  │                 │    │                 │    │ • Recall@K      │        │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│           │                      │                      │                  │
│           ▼                      ▼                      ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      UNIFIED INTERFACE LAYER                         │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │  BenchmarkInterface          ProviderInterface        EvaluatorInterface│
│  │  ├─ getQuestions()           ├─ initialize()          ├─ evaluate()    │
│  │  ├─ getHaystackData()        ├─ ingest()              └─ aggregate()   │
│  │  ├─ getGroundTruth()         ├─ search()                              │
│  │  └─ mapToUnifiedType()       └─ clear()                               │
│  │                                                                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                          ORCHESTRATOR                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXECUTION PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────┐│
│   │  PHASE 1 │    │  PHASE 2 │    │  PHASE 3 │    │  PHASE 4 │    │PHASE5││
│   │  INGEST  │───▶│  SEARCH  │───▶│  ANSWER  │───▶│ EVALUATE │───▶│REPORT││
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────┘│
│        │               │               │               │              │    │
│        ▼               ▼               ▼               ▼              ▼    │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│   │Checkpoint│    │Checkpoint│    │ Results │    │ Scores  │    │Aggregate│ │
│   │  Save   │    │  Save   │    │  Store  │    │  Store  │    │ Metrics │ │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                            PHASE DETAILS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: INGEST                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  for each question:                                                 │    │
│  │    ├─ Load haystack sessions from benchmark                         │    │
│  │    ├─ Format sessions for provider                                  │    │
│  │    ├─ Call provider.ingest(sessions, containerTag)                  │    │
│  │    ├─ Save checkpoint after each session                            │    │
│  │    └─ Rate limit between API calls                                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  PHASE 2: SEARCH                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  for each question:                                                 │    │
│  │    ├─ Get question query                                            │    │
│  │    ├─ Call provider.search(query, containerTag)                     │    │
│  │    ├─ Normalize search results                                      │    │
│  │    └─ Store results with metadata                                   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  PHASE 3: ANSWER                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  for each question:                                                 │    │
│  │    ├─ Assemble context from search results                          │    │
│  │    ├─ Build prompt with question + context                          │    │
│  │    ├─ Call LLM (GPT-4o/GPT-5/Gemini) to generate answer             │    │
│  │    └─ Store hypothesis                                              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  PHASE 4: EVALUATE                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  for each question:                                                 │    │
│  │    ├─ Get ground truth from benchmark                               │    │
│  │    ├─ Select judge prompt based on question type                    │    │
│  │    ├─ Call evaluator.evaluate(question, groundTruth, hypothesis)    │    │
│  │    └─ Store score (0 or 1) + explanation                            │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  PHASE 5: REPORT                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │    ├─ Aggregate scores by question type                             │    │
│  │    ├─ Calculate overall accuracy                                    │    │
│  │    ├─ Compute latency stats (p50, p95)                              │    │
│  │    └─ Generate final report                                         │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHECKPOINTING FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     WHY CHECKPOINTING?                               │   │
│  │                                                                      │   │
│  │  • Ingestion can take HOURS (100s of questions × 10s of sessions)   │   │
│  │  • API calls can fail (network, rate limits, timeouts)              │   │
│  │  • Need to RESUME from where we left off, not restart               │   │
│  │  • Track progress visibility                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     CHECKPOINT LEVELS                                │   │
│  │                                                                      │   │
│  │  BATCH LEVEL          QUESTION LEVEL        SESSION LEVEL           │   │
│  │  ┌──────────┐         ┌──────────┐          ┌──────────┐            │   │
│  │  │ Question │         │ Session  │          │ API Call │            │   │
│  │  │   1-50   │────────▶│  1-20    │─────────▶│  Status  │            │   │
│  │  │ Progress │         │ Progress │          │ ingested │            │   │
│  │  └──────────┘         └──────────┘          └──────────┘            │   │
│  │                                                                      │   │
│  │  Tracks which         Tracks which          Tracks each             │   │
│  │  questions done       sessions done         session's state         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     RESUME FLOW                                      │   │
│  │                                                                      │   │
│  │  Start ──▶ Load Checkpoint ──▶ Skip Completed ──▶ Resume From Fail  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                        QUESTION TYPE MAPPING                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  UNIFIED TYPES              BENCHMARK MAPPINGS                              │
│  ┌────────────────┐                                                        │
│  │ FACT_RECALL    │◀──── LoCoMo: Cat 1 | LongMemEval: single-session-*    │
│  │                │       BEAM: Information Extraction                     │
│  ├────────────────┤                                                        │
│  │ MULTI_HOP      │◀──── LoCoMo: Cat 3 | LongMemEval: multi-session       │
│  │                │       BEAM: Multi-Session Reasoning                    │
│  ├────────────────┤                                                        │
│  │ TEMPORAL       │◀──── LoCoMo: Cat 2 | LongMemEval: temporal-reasoning  │
│  │                │       BEAM: Temporal Reasoning, Event Ordering         │
│  ├────────────────┤                                                        │
│  │ INFERENCE      │◀──── LoCoMo: Cat 4 | BEAM: Contradiction Resolution   │
│  │                │                                                        │
│  ├────────────────┤                                                        │
│  │ PREFERENCE     │◀──── LongMemEval: single-session-preference           │
│  │                │       BEAM: Preference Following                       │
│  ├────────────────┤                                                        │
│  │ KNOWLEDGE_     │◀──── LongMemEval: knowledge-update                    │
│  │ UPDATE         │       BEAM: Knowledge Update                           │
│  ├────────────────┤                                                        │
│  │ ABSTENTION     │◀──── LoCoMo: Cat 5 | LongMemEval: abstention          │
│  │                │       BEAM: Abstention                                 │
│  └────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

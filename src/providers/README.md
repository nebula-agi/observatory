# Providers

```typescript
interface Provider {
    name: string
    prompts?: ProviderPrompts       // optional: override judge prompts per question type
    concurrency?: ConcurrencyConfig // optional: default concurrency per pipeline phase
    initialize(config: ProviderConfig): Promise<void>
    ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult>
    awaitIndexing(result: IngestResult, containerTag: string, onProgress?: IndexingProgressCallback): Promise<void>
    search(query: string, options: SearchOptions): Promise<unknown[]>
    clear(containerTag: string): Promise<void>
}
```

## Adding a Provider

1. Create `src/providers/myprovider/index.ts`
2. Implement `Provider` interface
3. Register in `src/providers/index.ts`
4. Add to `ProviderName` in `src/types/provider.ts`
5. Add API key config in `src/utils/config.ts`

`ingest()` must return `{ documentIds: string[], taskIds?: string[] }`. `awaitIndexing()` should poll until indexing completes, calling `onProgress` with each update. `search()` returns provider-specific results — the orchestrator normalizes them downstream.

## Custom Prompts

Override judge prompts per question type by implementing `prompts.judgePrompt`. Must return an object with a `default` key. See `src/providers/zep/prompts.ts` for an example.

## Existing Providers

| Provider | SDK | Notes |
|----------|-----|-------|
| `mem0` | `mem0ai` | v2 API with graph |
| `nebula` | `@nebula-ai/sdk` | Hybrid retrieval, collection caching |
| `supermemory` | `supermemory` | Raw JSON sessions |
| `zep` | `@getzep/zep-cloud` | Graph-based, custom prompts |

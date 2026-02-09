# Judges

```typescript
interface Judge {
    name: string
    initialize(config: JudgeConfig): Promise<void>
    evaluate(input: JudgeInput): Promise<JudgeResult>
    getPromptForQuestionType(questionType: string, providerPrompts?: ProviderPrompts): string
    getModel(): LanguageModel
}
```

`evaluate()` must return `{ score: 0|1, label: "correct"|"incorrect", explanation: string }`. Use `buildJudgePrompt(input)` and `parseJudgeResponse(text)` from `./base.ts` — they handle prompt assembly and response parsing consistently across judges.

## Adding a Judge

1. Create `src/judges/myjudge.ts`
2. Implement `Judge` interface
3. Register in `src/judges/index.ts`
4. Add to `JudgeName` in `src/types/judge.ts`
5. Add default model to `DEFAULT_JUDGE_MODELS` in `src/utils/models.ts`

Register the model in `src/utils/models.ts`:

```typescript
interface ModelConfig {
    id: string
    provider: "openai" | "anthropic" | "google"
    displayName: string
    supportsTemperature: boolean
    defaultTemperature: number
    maxTokensParam: "maxTokens" | "max_completion_tokens"
    defaultMaxTokens: number
}
```

## Existing Judges

| Judge | SDK | Default Model |
|-------|-----|---------------|
| `anthropic` | `@ai-sdk/anthropic` | sonnet-4 |
| `google` | `@ai-sdk/google` | gemini-3-flash-preview |
| `openai` | `@ai-sdk/openai` | gpt-4o |

import { mkdir, writeFile } from "fs/promises"
import { dirname, resolve } from "path"
import { getAvailableBenchmarks, createBenchmark } from "./benchmarks"
import { getAvailableProviders } from "./providers"
import { Orchestrator } from "./orchestrator"
import { FileCheckpointManager } from "./orchestrator/fileCheckpoint"
import { generateReport } from "./orchestrator/phases/report"
import { logger } from "./utils/logger"
import type { BenchmarkName } from "./types/benchmark"
import type { ProviderName } from "./types/provider"
import type { ConcurrencyConfig } from "./types/concurrency"

type SearchEffort = "auto" | "low" | "medium" | "high"
type LogLevel = "debug" | "info" | "warn" | "error"

interface RunArgs {
  benchmark: BenchmarkName
  provider: ProviderName
  judgeModel: string
  out: string
  checkpointDir: string
  runId: string
  limit?: number
  dataPath?: string
  questionTypes: string[]
  searchEffort?: SearchEffort
  force: boolean
  logLevel: LogLevel
  concurrency?: ConcurrencyConfig
}

const SEARCH_EFFORTS: SearchEffort[] = ["auto", "low", "medium", "high"]
const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"]

function printHelp(): void {
  const benchmarks = getAvailableBenchmarks().join(", ")
  const providers = getAvailableProviders().join(", ")

  console.log(`Observatory CLI

Usage:
  bun run src/cli.ts run <benchmark> <provider> --judge-model <model> [options]

Commands:
  run                       Run an Observatory benchmark locally

Benchmarks:
  ${benchmarks}

Providers:
  ${providers}

Options:
  --judge-model <model>     Judge model alias or provider-native model ID (required)
  --out <path>              Output JSON report path
  --run-id <id>             Reuse a specific run ID
  --data-path <path>        Override the benchmark data path
  --question-type <type>    Filter question types by raw ID or alias (repeatable)
  --limit <n>               Limit the number of benchmark questions
  --search-effort <level>   Search effort: auto, low, medium, high
  --concurrency <n>         Default concurrency for all phases
  --ingest-concurrency <n>  Override ingest concurrency
  --indexing-concurrency <n> Override indexing concurrency
  --search-concurrency <n>  Override search concurrency
  --evaluate-concurrency <n> Override evaluate concurrency
  --checkpoint-dir <path>   Directory for local checkpoint files
  --log-level <level>       Log level: debug, info, warn, error
  --force                   Delete any existing local checkpoint for this run ID
  --help                    Show this help`)
}

function fail(message: string): never {
  throw new Error(message)
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${flag}`)
  }
  return value
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${flag} must be a positive integer`)
  }
  return value
}

function defaultRunId(benchmark: string, provider: string): string {
  const now = new Date()
  const parts = [
    now.getUTCFullYear().toString(),
    (now.getUTCMonth() + 1).toString().padStart(2, "0"),
    now.getUTCDate().toString().padStart(2, "0"),
    now.getUTCHours().toString().padStart(2, "0"),
    now.getUTCMinutes().toString().padStart(2, "0"),
    now.getUTCSeconds().toString().padStart(2, "0"),
  ]
  return `observatory-${benchmark}-${provider}-${parts.join("")}`
}

function parseRunArgs(args: string[]): RunArgs {
  if (args.length < 2) {
    fail("run requires <benchmark> and <provider>")
  }

  const benchmark = args[0] as BenchmarkName
  const provider = args[1] as ProviderName

  if (!getAvailableBenchmarks().includes(benchmark)) {
    fail(`Unknown benchmark "${benchmark}". Available: ${getAvailableBenchmarks().join(", ")}`)
  }

  if (!getAvailableProviders().includes(provider)) {
    fail(`Unknown provider "${provider}". Available: ${getAvailableProviders().join(", ")}`)
  }

  let judgeModel = ""
  let out = ""
  let runId = ""
  let checkpointDir = resolve(process.cwd(), ".observatory/checkpoints")
  let limit: number | undefined
  let dataPath: string | undefined
  let searchEffort: SearchEffort | undefined
  let force = false
  let logLevel: LogLevel = "info"
  const questionTypes: string[] = []
  const concurrency: ConcurrencyConfig = { default: 1 }
  let concurrencyConfigured = false

  for (let i = 2; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case "--judge-model":
        judgeModel = nextValue(args, i, arg)
        i++
        break
      case "--out":
        out = resolve(process.cwd(), nextValue(args, i, arg))
        i++
        break
      case "--run-id":
        runId = nextValue(args, i, arg)
        i++
        break
      case "--data-path":
        dataPath = resolve(process.cwd(), nextValue(args, i, arg))
        i++
        break
      case "--question-type":
        questionTypes.push(nextValue(args, i, arg))
        i++
        break
      case "--limit":
        limit = parsePositiveInt(nextValue(args, i, arg), arg)
        i++
        break
      case "--search-effort": {
        const value = nextValue(args, i, arg) as SearchEffort
        if (!SEARCH_EFFORTS.includes(value)) {
          fail(`--search-effort must be one of: ${SEARCH_EFFORTS.join(", ")}`)
        }
        searchEffort = value
        i++
        break
      }
      case "--checkpoint-dir":
        checkpointDir = resolve(process.cwd(), nextValue(args, i, arg))
        i++
        break
      case "--log-level": {
        const value = nextValue(args, i, arg) as LogLevel
        if (!LOG_LEVELS.includes(value)) {
          fail(`--log-level must be one of: ${LOG_LEVELS.join(", ")}`)
        }
        logLevel = value
        i++
        break
      }
      case "--concurrency":
        concurrency.default = parsePositiveInt(nextValue(args, i, arg), arg)
        concurrencyConfigured = true
        i++
        break
      case "--ingest-concurrency":
        concurrency.ingest = parsePositiveInt(nextValue(args, i, arg), arg)
        concurrencyConfigured = true
        i++
        break
      case "--indexing-concurrency":
        concurrency.indexing = parsePositiveInt(nextValue(args, i, arg), arg)
        concurrencyConfigured = true
        i++
        break
      case "--search-concurrency":
        concurrency.search = parsePositiveInt(nextValue(args, i, arg), arg)
        concurrencyConfigured = true
        i++
        break
      case "--evaluate-concurrency":
        concurrency.evaluate = parsePositiveInt(nextValue(args, i, arg), arg)
        concurrencyConfigured = true
        i++
        break
      case "--force":
        force = true
        break
      case "--help":
        printHelp()
        process.exit(0)
      default:
        fail(`Unknown option: ${arg}`)
    }
  }

  if (!judgeModel) {
    fail("--judge-model is required")
  }

  const resolvedRunId = runId || defaultRunId(benchmark, provider)

  return {
    benchmark,
    provider,
    judgeModel,
    out: out || resolve(process.cwd(), `.observatory/reports/${resolvedRunId}.json`),
    checkpointDir,
    runId: resolvedRunId,
    limit,
    dataPath,
    questionTypes,
    searchEffort,
    force,
    logLevel,
    concurrency: concurrencyConfigured ? concurrency : undefined,
  }
}

async function resolveQuestionTypes(
  benchmarkName: BenchmarkName,
  requested: string[],
  dataPath?: string
): Promise<string[]> {
  if (requested.length === 0) {
    return []
  }

  const benchmark = createBenchmark(benchmarkName)
  await benchmark.load(dataPath ? { dataPath } : undefined)

  const registry = benchmark.getQuestionTypes()
  const byId = new Map(Object.values(registry).map((info) => [info.id.toLowerCase(), info.id]))
  const byAlias = new Map(
    Object.values(registry).map((info) => [info.alias.toLowerCase(), info.id])
  )

  return requested.map((value) => {
    const normalized = value.toLowerCase()
    const resolved = byId.get(normalized) || byAlias.get(normalized)
    if (!resolved) {
      const available = Object.values(registry)
        .map((info) => `${info.id} (${info.alias})`)
        .join(", ")
      fail(`Unknown question type "${value}". Available: ${available}`)
    }
    return resolved
  })
}

async function writeReport(outPath: string, report: unknown): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(report, null, 2))
}

async function runCommand(args: RunArgs): Promise<void> {
  logger.setLevel(args.logLevel)

  const resolvedQuestionTypes = await resolveQuestionTypes(
    args.benchmark,
    args.questionTypes,
    args.dataPath
  )

  const checkpointManager = new FileCheckpointManager(args.checkpointDir)
  const orchestrator = new Orchestrator(checkpointManager)

  await orchestrator.run({
    provider: args.provider,
    benchmark: args.benchmark,
    judgeModel: args.judgeModel,
    runId: args.runId,
    limit: args.limit,
    searchEffort: args.searchEffort,
    benchmarkConfig: args.dataPath ? { dataPath: args.dataPath } : undefined,
    questionTypes: resolvedQuestionTypes.length > 0 ? resolvedQuestionTypes : undefined,
    concurrency: args.concurrency,
    force: args.force,
  })

  await checkpointManager.flush(args.runId)
  const checkpoint = await checkpointManager.load(args.runId)
  if (!checkpoint) {
    fail(`Run finished but checkpoint ${args.runId} was not found`)
  }

  const benchmark = createBenchmark(args.benchmark)
  await benchmark.load(args.dataPath ? { dataPath: args.dataPath } : undefined)

  const report = generateReport(benchmark, checkpoint)
  await writeReport(args.out, report)
  logger.success(`Saved report to ${args.out}`)

  if (checkpoint.status !== "completed") {
    fail(`Run ${args.runId} finished with status ${checkpoint.status}`)
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv.length === 0 || argv.includes("--help")) {
    printHelp()
    return
  }

  const command = argv[0]

  if (command !== "run") {
    fail(`Unknown command: ${command}`)
  }

  const parsed = parseRunArgs(argv.slice(1))
  await runCommand(parsed)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Observatory CLI failed: ${message}`)
  process.exit(1)
})

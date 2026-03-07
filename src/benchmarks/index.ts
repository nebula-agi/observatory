import type { Benchmark, BenchmarkName } from "../types/benchmark"
import { LoCoMoBenchmark } from "./locomo"
import { LongMemEvalBenchmark } from "./longmemeval"
import { ConvoMemBenchmark } from "./convomem"
import { AtlasBenchmark } from "./atlas"

const benchmarks: Record<BenchmarkName, new () => Benchmark> = {
  locomo: LoCoMoBenchmark,
  longmemeval: LongMemEvalBenchmark,
  convomem: ConvoMemBenchmark,
  atlas: AtlasBenchmark,
}

const instanceCache = new Map<BenchmarkName, { benchmark: Benchmark; loadPromise: Promise<void> | null }>()

export function createBenchmark(name: BenchmarkName): Benchmark {
  const cached = instanceCache.get(name)
  if (cached) return cached.benchmark

  const BenchmarkClass = benchmarks[name]
  if (!BenchmarkClass) {
    throw new Error(`Unknown benchmark: ${name}. Available: ${Object.keys(benchmarks).join(", ")}`)
  }
  const instance = new BenchmarkClass()
  const originalLoad = instance.load.bind(instance)
  instance.load = (config?: any) => {
    const entry = instanceCache.get(name)!
    if (!entry.loadPromise) {
      entry.loadPromise = originalLoad(config)
    }
    return entry.loadPromise
  }
  instanceCache.set(name, { benchmark: instance, loadPromise: null })
  return instance
}

export function getAvailableBenchmarks(): BenchmarkName[] {
  return Object.keys(benchmarks) as BenchmarkName[]
}

export { LoCoMoBenchmark, LongMemEvalBenchmark, ConvoMemBenchmark, AtlasBenchmark }

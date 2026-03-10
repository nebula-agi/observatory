import { Supermemory } from "supermemory"
import type {
  Provider,
  ProviderConfig,
  IngestOptions,
  IngestResult,
  SearchOptions,
  IndexingProgressCallback,
  IndexingStatusResult,
} from "../../types/provider"
import type { UnifiedSession } from "../../types/unified"
import { logger } from "../../utils/logger"
import { SUPERMEMORY_PROMPTS } from "./prompts"

export class SupermemoryProvider implements Provider {
  name = "supermemory"
  prompts = SUPERMEMORY_PROMPTS
  concurrency = {
    default: 50,
    ingest: 100,
  }
  private client: Supermemory | null = null

  async initialize(config: ProviderConfig): Promise<void> {
    this.client = new Supermemory({
      apiKey: config.apiKey,
    })
    logger.info(`Initialized Supermemory provider`)
  }

  async ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult> {
    if (!this.client) throw new Error("Provider not initialized")

    // Process all sessions in parallel
    const ingestPromises = sessions.map(async (session) => {
      const sessionStr = JSON.stringify(session.messages)
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")

      const formattedDate = session.metadata?.formattedDate as string
      const isoDate = session.metadata?.date as string
      const content = formattedDate
        ? `Here is the date the following session took place: ${formattedDate}\n\nHere is the session as a stringified JSON:\n${sessionStr}`
        : `Here is the session as a stringified JSON:\n${sessionStr}`

      const response = await this.client!.add({
        content,
        containerTag: options.containerTag,
        metadata: {
          sessionId: session.sessionId,
          ...(isoDate ? { date: isoDate } : {}),
        },
      })
      logger.debug(`Ingested session ${session.sessionId}`)
      return response.id
    })

    const documentIds = await Promise.all(ingestPromises)
    return { documentIds }
  }

  async checkIndexingStatus(ids: string[]): Promise<IndexingStatusResult[]> {
    if (!this.client) throw new Error("Provider not initialized")

    // Process in sub-batches to avoid bursty 100+ concurrent requests
    const SUB_BATCH_SIZE = 20
    const allResults: IndexingStatusResult[] = []

    for (let i = 0; i < ids.length; i += SUB_BATCH_SIZE) {
      const subBatch = ids.slice(i, i + SUB_BATCH_SIZE)
      const results = await Promise.allSettled(
        subBatch.map(async (docId) => {
          const doc = await this.client!.documents.get(docId, { timeout: 15_000 })
          if (doc.status === "failed") return { id: docId, status: "failed" as const }
          if (doc.status === "done") {
            const memory = await this.client!.memories.get(docId, { timeout: 15_000 })
            if (memory.status === "failed") return { id: docId, status: "failed" as const }
            if (memory.status === "done") return { id: docId, status: "completed" as const }
          }
          return { id: docId, status: "pending" as const }
        })
      )

      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status === "fulfilled") {
          allResults.push(r.value)
        } else {
          logger.warn(`checkIndexingStatus failed for ${subBatch[j]}: ${r.reason}`)
          allResults.push({ id: subBatch[j], status: "pending" as const })
        }
      }
    }

    return allResults
  }

  async awaitIndexing(
    result: IngestResult,
    _containerTag: string,
    onProgress?: IndexingProgressCallback
  ): Promise<void> {
    if (!this.client) throw new Error("Provider not initialized")
    if (result.documentIds.length === 0) {
      onProgress?.({ completedIds: [], failedIds: [], total: 0 })
      return
    }

    const total = result.documentIds.length
    const pending = new Set(result.documentIds)
    const completedIds: string[] = []
    const failedIds: string[] = []
    let backoffMs = 1000

    onProgress?.({ completedIds: [], failedIds: [], total })

    while (pending.size > 0) {
      const pendingArray = Array.from(pending)
      const results = await Promise.allSettled(
        pendingArray.map(async (docId) => {
          const doc = await this.client!.documents.get(docId)
          if (doc.status === "done" || doc.status === "failed") {
            const memory = await this.client!.memories.get(docId)
            return { docId, docStatus: doc.status, memStatus: memory.status }
          }
          return { docId, docStatus: doc.status, memStatus: "pending" }
        })
      )

      for (const res of results) {
        if (res.status === "fulfilled") {
          const { docId, docStatus, memStatus } = res.value
          if (docStatus === "failed" || memStatus === "failed") {
            pending.delete(docId)
            failedIds.push(docId)
          } else if (docStatus === "done" && memStatus === "done") {
            pending.delete(docId)
            completedIds.push(docId)
          }
        }
      }

      onProgress?.({ completedIds: [...completedIds], failedIds: [...failedIds], total })

      if (pending.size > 0) {
        await new Promise((r) => setTimeout(r, backoffMs))
        backoffMs = Math.min(backoffMs * 1.2, 5000)
      }
    }

    if (failedIds.length > 0) {
      logger.warn(`${failedIds.length} documents failed indexing`)
    }
  }

  async search(query: string, options: SearchOptions): Promise<unknown[]> {
    if (!this.client) throw new Error("Provider not initialized")

    const response = await this.client.search.memories({
      q: query,
      containerTag: options.containerTag,
      limit: options.limit || 10,
      threshold: options.threshold || 0.3,
      searchMode: "hybrid",
    })

    return response.results || []
  }

  async clear(containerTag: string): Promise<void> {
    if (!this.client) throw new Error("Provider not initialized")
    throw new Error(`Clear not supported by Supermemory provider (containerTag: ${containerTag}). Cannot retry questions without clearing existing data.`)
  }
}

export default SupermemoryProvider

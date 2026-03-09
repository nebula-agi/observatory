
import { Nebula } from "@nebula-ai/sdk"
import type {
    Provider,
    ProviderConfig,
    IngestOptions,
    IngestResult,
    SearchOptions,
    IndexingProgressCallback,
} from "../../types/provider"
import type { UnifiedSession } from "../../types/unified"
import { logger } from "../../utils/logger"
import { NEBULA_PROMPTS } from "./prompts"

const INITIAL_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 10000
const BATCH_DELAY_MS = 500

export class NebulaProvider implements Provider {
    name = "nebula"
    prompts = NEBULA_PROMPTS
    private client: Nebula | null = null
    private collectionCache: Map<string, string> = new Map() // Check if we can cache IDs
    private pendingCollections: Map<string, Promise<string>> = new Map() // Lock for concurrent creation

    async initialize(config: ProviderConfig): Promise<void> {
        if (!config.apiKey) {
            throw new Error("Nebula provider requires apiKey")
        }
        this.client = new Nebula({
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            timeout: 300000, // 5 minutes - Nebula ingestion is async, but large batches take time to queue
        })
        logger.info("Initialized Nebula provider")
    }

    private async getCollectionId(name: string, create: boolean = false): Promise<string | null> {
        if (!this.client) throw new Error("Provider not initialized")

        // Fast path: check cache first
        if (this.collectionCache.has(name)) {
            return this.collectionCache.get(name)!
        }

        // Check if another task is already creating/fetching this collection
        const pending = this.pendingCollections.get(name)
        if (pending) {
            return pending
        }

        // If we don't want to create, just try to fetch
        if (!create) {
            try {
                const collection = await this.client.getCollectionByName(name)
                if (collection && collection.id) {
                    this.collectionCache.set(name, collection.id)
                    return collection.id
                }
                return null
            } catch (e) {
                return null
            }
        }

        // Create a promise that will be shared by all concurrent callers
        const creationPromise = this.getOrCreateCollection(name)
        this.pendingCollections.set(name, creationPromise)

        try {
            const collectionId = await creationPromise
            return collectionId
        } finally {
            // Clean up the pending promise after completion
            this.pendingCollections.delete(name)
        }
    }

    private async getOrCreateCollection(name: string): Promise<string> {
        if (!this.client) throw new Error("Provider not initialized")

        try {
            // Try to get by name
            const collection = await this.client.getCollectionByName(name)
            if (collection && collection.id) {
                this.collectionCache.set(name, collection.id)
                return collection.id
            }
        } catch (e) {
            // Log for debugging but proceed to create as it might just be 404
            logger.debug(`Collection ${name} not found by name: ${e}`)
        }

        logger.info(`Collection ${name} not found, creating...`)
        try {
            const newCollection = await this.client.createCollection({
                name,
                description: "Created by marina",
            })

            logger.info(`Successfully created collection ${name} with ID ${newCollection.id}`)
            this.collectionCache.set(name, newCollection.id)
            return newCollection.id
        } catch (e: any) {
            const errorStr = String(e.message || e)
            // Handle race condition: another process (not in this Node instance) may have created it
            // Also handle cases where the server might return 500 for a duplicate
            if (errorStr.includes("already exists") || errorStr.includes("500")) {
                logger.info(`Collection ${name} might have been created concurrently, retrying fetch...`)
                // Wait a bit for eventual consistency
                await new Promise(r => setTimeout(r, INITIAL_RETRY_DELAY_MS))
                try {
                    const collection = await this.client.getCollectionByName(name)
                    if (collection && collection.id) {
                        this.collectionCache.set(name, collection.id)
                        return collection.id
                    }
                } catch (fetchError) {
                    logger.warn(`Failed to fetch collection ${name} after retry: ${fetchError}`)
                }
            }
            // Re-throw if it's a different error or retry failed
            throw e
        }
    }

    private async storeMemoriesWithRetry(memories: any[], maxRetries = 3): Promise<string[]> {
        let lastError: any
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.client!.storeMemories(memories)
            } catch (e: any) {
                lastError = e
                const errorStr = String(e.message || e)

                // Only retry on 500 (Internal Server Error), 504 (timeout) or 503 (service unavailable) errors
                if (errorStr.includes("500") || errorStr.includes("504") || errorStr.includes("503")) {
                    const backoffMs = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS)
                    logger.warn(`Nebula storeMemories attempt ${attempt + 1}/${maxRetries} failed with ${errorStr.includes("500") ? "500" : "timeout"}, retrying in ${backoffMs}ms...`)
                    await new Promise(r => setTimeout(r, backoffMs))
                    continue
                }

                // Don't retry other errors
                throw e
            }
        }

        // All retries exhausted
        throw lastError
    }

    async ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult> {
        if (!this.client) throw new Error("Provider not initialized")

        const collectionId = await this.getCollectionId(options.containerTag, true)
        if (!collectionId) throw new Error(`Failed to get or create collection ${options.containerTag}`)

        // Filter out empty sessions
        const validSessions = sessions.filter(s => s.messages && s.messages.length > 0)

        if (validSessions.length === 0) {
            return { documentIds: [] }
        }

        try {
            // Process sessions in smaller batches to avoid overwhelming the API
            const BATCH_SIZE = 3 // Process 3 sessions concurrently at a time
            const allDocumentIds: string[] = []

            for (let i = 0; i < validSessions.length; i += BATCH_SIZE) {
                const batch = validSessions.slice(i, i + BATCH_SIZE)

                const batchResults = await Promise.all(batch.map(async (session) => {
                    const formattedDate = session.metadata?.formattedDate as string
                    const isoDate = session.metadata?.date as string

                    // Each message is a flat Memory with top-level role.
                    // storeMemories groups all messages with the same collection_id
                    // into a single conversation. Since each session gets its own
                    // storeMemories call, each session becomes a separate conversation.
                    const memories = session.messages.map(m => ({
                        collection_id: collectionId,
                        role: m.role,
                        content: m.content,
                        metadata: {
                            conversation_name: `Session ${session.sessionId}`,
                            sessionId: session.sessionId,
                            ...(isoDate ? { date: isoDate } : {}),
                            ...(formattedDate ? { formattedDate } : {}),
                            ...options.metadata,
                            containerTag: options.containerTag
                        }
                    }))

                    return this.storeMemoriesWithRetry(memories)
                }))

                // Flatten and accumulate results
                allDocumentIds.push(...batchResults.flat())

                // Small delay between batches to give server breathing room
                if (i + BATCH_SIZE < validSessions.length) {
                    await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
                }
            }

            return { documentIds: allDocumentIds }
        } catch (e) {
            logger.error(`Nebula storeMemories failed: ${e}`)
            throw e
        }
    }

    async awaitIndexing(
        result: IngestResult,
        containerTag: string,
        onProgress?: IndexingProgressCallback
    ): Promise<void> {
        if (!this.client) throw new Error("Provider not initialized")

        const memoryIds = result.documentIds
        if (memoryIds.length === 0) {
            onProgress?.({ completedIds: [], failedIds: [], total: 0 })
            return
        }

        const total = memoryIds.length
        const pending = new Set(memoryIds)
        const completedIds: string[] = []
        const failedIds: string[] = []
        let backoffMs = 2000
        const maxAttempts = 60
        let attempts = 0

        onProgress?.({ completedIds: [], failedIds: [], total })

        while (pending.size > 0 && attempts < maxAttempts) {
            const pendingArray = Array.from(pending)
            const results = await Promise.allSettled(
                pendingArray.map(async (memoryId) => {
                    const memory = await this.client!.getMemory(memoryId)
                    return { memoryId, hasChunks: !!(memory.chunks && memory.chunks.length > 0) }
                })
            )

            for (const res of results) {
                if (res.status === "fulfilled") {
                    const { memoryId, hasChunks } = res.value
                    if (hasChunks) {
                        pending.delete(memoryId)
                        completedIds.push(memoryId)
                    }
                } else {
                    // If getMemory fails (e.g. 404), the memory might not exist yet
                    logger.debug(`Error checking memory status: ${res.reason}`)
                }
            }

            onProgress?.({ completedIds: [...completedIds], failedIds: [...failedIds], total })

            if (pending.size > 0) {
                attempts++
                await new Promise(r => setTimeout(r, backoffMs))
                backoffMs = Math.min(backoffMs * 1.5, MAX_RETRY_DELAY_MS)
            }
        }

        if (pending.size > 0) {
            // Mark remaining as failed after timeout
            for (const id of pending) {
                failedIds.push(id)
            }
            onProgress?.({ completedIds: [...completedIds], failedIds: [...failedIds], total })
            logger.warn(`Nebula indexing timed out for ${containerTag}. ${failedIds.length}/${total} memories not indexed.`)
        } else {
            logger.info(`Nebula indexing complete for ${containerTag} (${completedIds.length}/${total})`)
        }
    }

    async search(query: string, options: SearchOptions): Promise<unknown[]> {
        if (!this.client) throw new Error("Provider not initialized")

        const collectionId = await this.getCollectionId(options.containerTag, false)
        if (!collectionId) {
            logger.warn(`Nebula collection ${options.containerTag} not found during search.`)
            return []
        }

        // Fix: search might return an object wrapper or array.
        const results = await this.client.search({
            query,
            collection_ids: [collectionId],
            effort: options.effort || "medium",
            searchSettings: { limit: options.limit || 10 },
        })

        if (Array.isArray(results)) {
            return results
        }

        // Check for SDK format (MemoryResponse) containing sources, entities, or knowledge
        if ((results as any).sources || (results as any).entities || (results as any).knowledge || (results as any).episodes) {
            return [results]
        }

        // Handle case where results are wrapped (legacy)
        return (results as any).results || (results as any).memories || []
    }

    async clear(containerTag: string): Promise<void> {
        if (!this.client) throw new Error("Provider not initialized")
        const collectionId = await this.getCollectionId(containerTag, false)
        if (collectionId) {
            await this.client.deleteCollection(collectionId)
            this.collectionCache.delete(containerTag)
        }
    }
}

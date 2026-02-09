/**
 * Simple counting semaphore for limiting concurrent access to a resource.
 * Used by the pipeline to enforce per-phase concurrency limits.
 */
export class Semaphore {
  private current = 0
  private queue: (() => void)[] = []

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.current++
        resolve()
      })
    })
  }

  private release(): void {
    this.current--
    if (this.queue.length > 0) {
      this.queue.shift()!()
    }
  }
}

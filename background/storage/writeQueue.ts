export class WriteQueue {
  private queue: Array<() => Promise<void>> = []

  private running = false

  enqueue(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await task()
          resolve()
        } catch (error) {
          reject(error)
        }
      })

      if (!this.running) {
        void this.drain()
      }
    })
  }

  private async drain(): Promise<void> {
    this.running = true

    while (this.queue.length > 0) {
      const task = this.queue.shift()
      if (!task) {
        continue
      }
      await task()
    }

    this.running = false
  }
}

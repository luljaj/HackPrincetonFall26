/** Only one speculative voice request at a time; completed lines survive language switches. */
export class PreparedLines<T> {
  private ready = new Map<string, T>();
  private pending = new Map<string, { text: string; language: string; abort: AbortController }>();
  private preparing = false;
  private load: (text: string, language: string, signal: AbortSignal) => Promise<T>;

  constructor(load: (text: string, language: string, signal: AbortSignal) => Promise<T>) {
    this.load = load;
  }

  get(text: string, language: string): T | undefined {
    return this.ready.get(`${language}|${text}`);
  }

  prepare(text: string, language: string): void {
    const id = `${language}|${text}`;
    if (this.ready.has(id) || this.pending.has(id)) return;
    this.pending.set(id, { text, language, abort: new AbortController() });
    void this.drain();
  }

  cancel(): void {
    for (const job of this.pending.values()) job.abort.abort();
    this.pending.clear();
  }

  private async drain(): Promise<void> {
    if (this.preparing) return;
    this.preparing = true;
    try {
      while (this.pending.size) {
        const next = this.pending.entries().next().value;
        if (!next) break;
        const [id, job] = next;
        try {
          const value = await this.load(job.text, job.language, job.abort.signal);
          if (!job.abort.signal.aborted) {
            if (this.ready.size >= 64) {
              const oldest = this.ready.keys().next().value;
              if (oldest !== undefined) this.ready.delete(oldest);
            }
            this.ready.set(id, value);
          }
        } catch {
          // Live speech retries a line that preparation could not finish.
        } finally {
          if (this.pending.get(id) === job) this.pending.delete(id);
        }
      }
    } finally {
      this.preparing = false;
    }
  }
}

import NetInfo from '@react-native-community/netinfo';
import { InfluxClient } from './client';
import { InfluxPoint } from './types';

interface BufferOptions {
  flushIntervalMs?: number; // default: 5000
  maxBufferSize?: number; // default: 500
  maxRetries?: number; // default: 3
}

export class BufferedInfluxWriter {
  private buffer: InfluxPoint[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly opts: Required<BufferOptions>;

  constructor(private client: InfluxClient, opts: BufferOptions = {}) {
    this.opts = {
      flushIntervalMs: opts.flushIntervalMs ?? 5_000,
      maxBufferSize: opts.maxBufferSize ?? 500,
      maxRetries: opts.maxRetries ?? 3,
    };
  }

  enqueue(point: InfluxPoint): void {
    if (this.buffer.length >= this.opts.maxBufferSize) {
      console.warn('[InfluxBuffer] Buffer full, dropping oldest point');
      this.buffer.shift();
    }
    this.buffer.push(point);
  }

  start(): void {
    this.timer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    const { isConnected } = await NetInfo.fetch();
    if (!isConnected || this.buffer.length === 0) {
      return;
    }

    const batch = this.buffer.splice(0, this.buffer.length);

    for (let attempt = 1; attempt <= this.opts.maxRetries; attempt++) {
      try {
        await this.client.writePoints(batch);
        return;
      } catch (err) {
        const isLastAttempt = attempt === this.opts.maxRetries;
        if (isLastAttempt) {
          console.error(
            '[InfluxBuffer] Failed after retries, re-queuing:',
            err,
          );
          this.buffer.unshift(...batch); // put back at front
        } else {
          await delay(200 * 2 ** attempt); // exponential backoff
        }
      }
    }
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

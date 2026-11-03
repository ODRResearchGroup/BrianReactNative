import { InfluxConfig, InfluxPoint } from './types';
import { toLineProtocol } from './utils';
import { backendFetch } from '../backendClient';

export class InfluxWriteError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(
      `InfluxDB write failed with HTTP ${status}: ${
        responseBody || 'no response body'
      }`,
    );
    this.name = 'InfluxWriteError';
  }
}

export class InfluxClient {
  constructor(_config?: InfluxConfig) {}

  async writeTimeseriesPoint(point: InfluxPoint): Promise<void> {
    await this.writePoints([point]);
  }

  async writeTimeseriesPoints(points: InfluxPoint[]): Promise<void> {
    await this.writePoints(points);
  }

  async writeFingerprintsPoint(point: InfluxPoint): Promise<void> {
    await this.writePoints([point]);
  }

  async writeFingerprintsPoints(points: InfluxPoint[]): Promise<void> {
    await this.writePoints(points);
  }

  private async writePoints(points: InfluxPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }

    const response = await backendFetch('/api/mobile/influx/timeseries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        point: { lineProtocol: points.map(toLineProtocol).join('\n') },
      }),
    });

    if (!response.ok) {
      throw new InfluxWriteError(response.status, await response.text());
    }
  }
}

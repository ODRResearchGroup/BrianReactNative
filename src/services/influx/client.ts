import { InfluxConfig, InfluxPoint } from './types';
import { toLineProtocol } from './utils';

export class InfluxClient {
  private readonly writeUrl: string;
  private readonly timeseriesBucket: string;
  private readonly fingerprintsBucket: string;

  private readonly headers: HeadersInit_;

  constructor(private config: InfluxConfig) {
    this.writeUrl = `${config.url}/api/v2/write?org=${encodeURIComponent(
      config.org,
    )}&precision=ns`;

    this.timeseriesBucket = config.timeseriesBucket;
    this.fingerprintsBucket = config.fingerprintsBucket;

    this.headers = {
      Authorization: `Token ${config.token}`,
      'Content-Type': 'text/plain; charset=utf-8',
      Accept: 'application/json',
    };
  }

  async writeTimeseriesPoint(point: InfluxPoint): Promise<void> {
    return this.writeTimeseriesPoints([point]);
  }

  async writeTimeseriesPoints(points: InfluxPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }

    const body = points.map(toLineProtocol).join('\n');

    const response = await fetch(
      `${this.writeUrl}&bucket=${encodeURIComponent(this.timeseriesBucket)}`,
      {
        method: 'POST',
        headers: this.headers,
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new InfluxWriteError(response.status, text);
    }
  }

  async writeFingerprintsPoint(point: InfluxPoint): Promise<void> {
    return this.writeFingerprintsPoints([point]);
  }

  async writeFingerprintsPoints(points: InfluxPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }

    const body = points.map(toLineProtocol).join('\n');

    const response = await fetch(
      `${this.writeUrl}&bucket=${encodeURIComponent(this.fingerprintsBucket)}`,
      {
        method: 'POST',
        headers: this.headers,
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new InfluxWriteError(response.status, text);
    }
  }
}

export class InfluxWriteError extends Error {
  constructor(public statusCode: number, message: string) {
    super(`InfluxDB write failed [${statusCode}]: ${message}`);
    this.name = 'InfluxWriteError';
  }
}

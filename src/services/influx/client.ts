import { InfluxConfig, InfluxPoint } from './types';
import { toLineProtocol } from './utils';

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

function validateConfig(config: InfluxConfig): void {
  const missing: string[] = [];

  if (!config.url) {
    missing.push('INFLUX_URL');
  }

  if (!config.token) {
    missing.push('INFLUX_TOKEN');
  }

  if (!config.org) {
    missing.push('INFLUX_ORG');
  }

  if (!config.timeseriesBucket) {
    missing.push('INFLUX_TIMESERIES_BUCKET');
  }

  if (!config.fingerprintsBucket) {
    missing.push('INFLUX_FINGERPRINTS_BUCKET');
  }

  if (missing.length > 0) {
    throw new Error(`Missing Influx configuration: ${missing.join(', ')}`);
  }
}

export class InfluxClient {
  private readonly writeUrl: string;
  private readonly timeseriesBucket: string;
  private readonly fingerprintsBucket: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: InfluxConfig) {
    validateConfig(config);

    const baseUrl = config.url.replace(/\/+$/, '');

    this.writeUrl =
      `${baseUrl}/api/v2/write` +
      `?org=${encodeURIComponent(config.org)}` +
      '&precision=ns';

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
      const responseBody = await response.text();

      throw new InfluxWriteError(response.status, responseBody);
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
      const responseBody = await response.text();

      throw new InfluxWriteError(response.status, responseBody);
    }
  }
}

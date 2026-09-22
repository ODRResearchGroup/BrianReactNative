export type FieldValue = string | number | boolean;
export type TagValue = string | number | boolean;

function escapeTagOrKey(value: string): string {
  return value.replace(/([,= ])/g, '\\$1');
}

function escapeMeasurement(value: string): string {
  return value.replace(/([, ])/g, '\\$1');
}

function escapeFieldStringValue(value: string): string {
  return value.replace(/(["\\])/g, '\\$1');
}

function formatFieldValue(value: FieldValue): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`InfluxDB field value is not finite: ${value}`);
    }
    return String(value);
  }
  return `"${escapeFieldStringValue(value)}"`;
}

function buildLineProtocol(
  measurement: string,
  tags: Record<string, TagValue>,
  fields: Record<string, FieldValue>,
  timestamp: Date,
): string {
  const tagSet = Object.entries(tags)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(
      ([key, value]) =>
        `${escapeTagOrKey(key)}=${escapeTagOrKey(String(value))}`,
    )
    .join(',');
  const fieldEntries = Object.entries(fields).filter(
    ([, value]) => value !== undefined && value !== null,
  );

  if (fieldEntries.length === 0) {
    throw new Error('InfluxDB line protocol requires at least one field');
  }

  const fieldSet = fieldEntries
    .map(([key, value]) => `${escapeTagOrKey(key)}=${formatFieldValue(value)}`)
    .join(',');

  return `${escapeMeasurement(measurement)}${
    tagSet ? `,${tagSet}` : ''
  } ${fieldSet} ${timestamp.getTime()}`;
}

export class InfluxDBClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly database: string;

  constructor(baseUrl: string, token: string, database: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.database = database;
  }

  async writeData(
    measurement: string,
    tags: Record<string, TagValue>,
    fields: Record<string, FieldValue>,
    timestamp: Date = new Date(),
  ): Promise<void> {
    const line = buildLineProtocol(measurement, tags, fields, timestamp);
    const url = `${this.baseUrl}/api/v3/write_lp?db=${encodeURIComponent(
      this.database,
    )}&precision=millisecond`;

    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: line,
    }).then(async response => {
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(
          `InfluxDB write failed (${response.status}): ${message}`,
        );
      }
    });
  }
}

export default InfluxDBClient;

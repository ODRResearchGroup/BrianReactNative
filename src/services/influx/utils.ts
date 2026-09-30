import { FieldSet, InfluxPoint, TagSet } from './types';

const escapeTag = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/ /g, '\\ ')
    .replace(/[=]/g, '\\=');

const escapeMeasurement = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/ /g, '\\ ');

const escapeFieldKey = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/ /g, '\\ ')
    .replace(/[=]/g, '\\=');

const formatField = (value: string | number | boolean): string => {
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Influx field value: ${value}`);
  }

  return Number.isInteger(value) ? `${value}i` : `${value}`;
};

const buildTagString = (tags: TagSet): string =>
  Object.entries(tags)
    .map(([key, value]) => `${escapeTag(key)}=${escapeTag(value)}`)
    .join(',');

const buildFieldString = (fields: FieldSet): string =>
  Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${escapeFieldKey(key)}=${formatField(value)}`)
    .join(',');

export const toLineProtocol = (point: InfluxPoint): string => {
  const measurement = escapeMeasurement(point.measurement);

  const tagString =
    point.tags && Object.keys(point.tags).length > 0
      ? `,${buildTagString(point.tags)}`
      : '';

  const fieldString = buildFieldString(point.fields);

  if (!fieldString) {
    throw new Error('Influx point contains no fields');
  }

  const timestamp = point.timestamp ?? Date.now() * 1_000_000;

  return `${measurement}${tagString} ${fieldString} ${timestamp}`;
};

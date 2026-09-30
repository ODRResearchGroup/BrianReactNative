import { TagSet, FieldSet, InfluxPoint } from './types';

const escapeTag = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/ /g, '\\ ')
    .replace(/[=]/g, '\\=');

const escapeMeasurement = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/ /g, '\\ ');

const formatField = (value: string | number | boolean): string => {
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return `${value}`;
};

const buildTagStr = (tags: TagSet): string =>
  Object.entries(tags)
    .map(([key, value]) => `${escapeTag(key)}=${escapeTag(value)}`)
    .join(',');

const buildFieldStr = (fields: FieldSet): string =>
  Object.entries(fields)
    .map(([key, value]) => `${escapeTag(key)}=${formatField(value)}`)
    .join(',');

export const toLineProtocol = (point: InfluxPoint): string => {
  const measurement = escapeMeasurement(point.measurement);
  const tagStr = point.tags ? `,${buildTagStr(point.tags)}` : '';
  const fieldStr = buildFieldStr(point.fields);
  const timestamp = point.timestamp ?? Date.now() * 1_000_000;

  return `${measurement}${tagStr} ${fieldStr} ${timestamp}`;
};

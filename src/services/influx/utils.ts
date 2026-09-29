import { TagSet, FieldSet, InfluxPoint } from './types';

const escapeTag = (v: string) =>
  v.replace(/,/g, '\\,').replace(/ /g, '\\ ').replace(/[=]/g, '\\=');

const formatField = (v: string | number | boolean): string => {
  if (typeof v === 'string') {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  if (typeof v === 'boolean') {
    return v ? 'true' : 'false';
  }
  return Number.isInteger(v) ? `${v}i` : `${v}`;
};

const buildTagStr = (tags: TagSet): string =>
  Object.entries(tags)
    .map(([k, v]) => `${escapeTag(k)}=${escapeTag(v)}`)
    .join(',');

const buildFieldStr = (fields: FieldSet): string =>
  Object.entries(fields)
    .map(([k, v]) => `${escapeTag(k)}=${formatField(v)}`)
    .join(',');

export const toLineProtocol = (point: InfluxPoint): string => {
  const tagStr = point.tags ? `,${buildTagStr(point.tags)}` : '';
  const fieldStr = buildFieldStr(point.fields);
  const ts = point.timestamp ?? Date.now() * 1_000_000;
  return `${point.measurement}${tagStr} ${fieldStr} ${ts}`;
};

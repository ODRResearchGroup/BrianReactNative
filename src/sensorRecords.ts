import type { SensorRecord } from './services/database/db';
import type {
  SavedFingerprintData,
  SensorReadings,
} from './types/fingerprintTypes';
import {
  GasSensorKey,
  SENSOR_DEFINITIONS,
  SENSOR_UNITS,
  SensorKey,
} from './sensors';

export const RECORD_FIELD = {
  CH4: 'ch4',
  NO2: 'no2',
  VOC: 'voc',
  NH3: 'nh3',
  HCHO: 'hcho',
  Odour: 'odour',
  Etoh: 'etoh',
  H2S: 'h2s',
  CO: 'co',
  Smoke: 'smoke',
  H2: 'h2',
  TempC: 'temperature',
  PressureHPa: 'pressure',
  HumidityPct: 'humidity',
  AltitudeM: 'altitude',
  GasResOhm: 'bme680GasResistance',
} as const satisfies Record<SensorKey, keyof SensorRecord>;

export const DELTA_FIELD = {
  CH4: 'deltaCh4',
  NH3: 'deltaNh3',
  HCHO: 'deltaHcho',
  VOC: 'deltaVoc',
  Odour: 'deltaOdour',
  H2S: 'deltaH2s',
  Etoh: 'deltaEtoh',
  NO2: 'deltaNo2',
} as const satisfies Partial<Record<GasSensorKey, keyof SensorRecord>>;

export function readingsToRecordFields(
  readings: Partial<Record<SensorKey, number>>,
) {
  const out: Record<string, number | null> = {};
  SENSOR_DEFINITIONS.forEach(s => {
    out[RECORD_FIELD[s.key]] = readings[s.key] ?? null;
  });
  return out as Pick<SensorRecord, (typeof RECORD_FIELD)[SensorKey]>;
}

export const EMPTY_DELTA_FIELDS = Object.fromEntries(
  Object.values(DELTA_FIELD).map(f => [f, null]),
) as Pick<SensorRecord, (typeof DELTA_FIELD)[keyof typeof DELTA_FIELD]>;

export function recordToValues(record: SensorRecord) {
  return Object.fromEntries(
    SENSOR_DEFINITIONS.map(s => [
      s.key,
      Number(record[RECORD_FIELD[s.key]]) || 0,
    ]),
  ) as Record<SensorKey, number>;
}

export function recordToSaved(record: SensorRecord): SavedFingerprintData {
  const deltas = Object.entries(DELTA_FIELD) as [
    GasSensorKey,
    keyof SensorRecord,
  ][];
  const hasDelta = deltas.some(([, f]) => record[f] != null);

  return {
    fingerprint: {
      type: 'sensor_reading',
      timestamp: new Date(record.recordedAt),
      source: 'BLE Device',
      olfactoryData: {
        readings: recordToValues(record) as SensorReadings,
        units: SENSOR_UNITS,
      },
    },
    location:
      record.latitude !== null && record.longitude !== null
        ? { latitude: record.latitude, longitude: record.longitude }
        : null,
    fingerprintTitle: { title: record.title },
    humanDescription: { description: record.description },
    photoPath: record.photoPath ?? undefined,
    timestamp: new Date(record.recordedAt).toISOString(),
    deltaReadings: hasDelta
      ? Object.fromEntries(deltas.map(([k, f]) => [k, Number(record[f]) || 0]))
      : undefined,
  } as SavedFingerprintData;
}

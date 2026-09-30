import { SensorEvent } from './events';

// Shared sensor readings shape used across components
export type SensorReadings = {
  CH4?: number | null;
  NH3?: number | null;
  HCHO?: number | null;
  VOC?: number | null;
  Odour?: number | null;
  H2S?: number | null;
  Etoh?: number | null;
  NO2?: number | null;
  CO?: number | null;
  Smoke?: number | null;
  H2?: number | null;
  TempC?: number | null;
  PressureHPa?: number | null;
  HumidityPct?: number | null;
  AltitudeM?: number | null;
  GasResOhm?: number | null;
};

// Saved fingerprint data persisted to AsyncStorage
export type SavedFingerprintData = {
  fingerprint: SensorEvent;
  location: { latitude: number; longitude: number } | null;
  humanDescription: { description: string };
  fingerprintTitle: { title: string };
  deltaReadings?: SensorReadings;
  timestamp: string;
  photoPath?: string;
};

export type StoredItem = { key: string; data: SavedFingerprintData };

export default {} as unknown;

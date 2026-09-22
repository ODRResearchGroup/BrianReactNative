import { SensorEvent } from './events';

// Shared sensor readings shape used across components
export type SensorReadings = {
  CH4: number;
  NH3: number;
  HCHO: number;
  VOC: number;
  Odour: number;
  H2S: number;
  Etoh: number;
  NO2: number;
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

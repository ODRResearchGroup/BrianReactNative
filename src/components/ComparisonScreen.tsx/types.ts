import { SavedFingerprintData } from '../../types/fingerprintTypes';

export type Tone = 'low' | 'medium' | 'high';
export type StoredItem = { key: string; data: SavedFingerprintData };

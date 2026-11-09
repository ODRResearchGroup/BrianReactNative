import { Tone } from './types';

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }

  return null;
}

export function fmt(v: number | null) {
  if (v === null) {
    return '';
  }

  if (Math.abs(v) >= 100) {
    return v.toFixed(0);
  }

  return v.toFixed(4);
}

export function verdict(score: number): {
  tone: Tone;
  word: string;
  hint: string;
} {
  if (score >= 0.85) {
    return {
      tone: 'low',
      word: 'Very similar',
      hint: 'These two samples smell almost the same to the sensors.',
    };
  }
  if (score >= 0.6) {
    return {
      tone: 'medium',
      word: 'Somewhat similar',
      hint: 'Some channels match, others clearly differ. See below.',
    };
  }
  return {
    tone: 'high',
    word: 'Quite different',
    hint: 'The sensors picked up clearly different smells.',
  };
}

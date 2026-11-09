import { StyleSheet } from 'react-native';
import { Level, Trend } from './types';
import { CHANNEL_COLORS, COLORS } from '../../../consts';

export const channelColor = (index: number) =>
  CHANNEL_COLORS[index % CHANNEL_COLORS.length];

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const details = error as Record<string, unknown>;
    const message = details.message ?? details.localizedDescription;
    const code = details.code;

    if (message || code) {
      return [code, message].filter(Boolean).join(': ');
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }

  return String(error);
}

export function levelWord(l: number): Level {
  if (l < 0.34) {
    return 'Low';
  } else if (l < 0.67) {
    return 'Medium';
  }
  return 'High';
}

export function normalise(values: (number | null)[]): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) {
    return values.map(() => null);
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(max - min, 0.1 * Math.max(Math.abs(max), 0.1));
  return values.map(v =>
    v === null ? null : Math.min(1, Math.max(0, (v - min) / span)),
  );
}

export function trendOf(series: (number | null)[]): Trend {
  const nums = series.filter((v): v is number => v !== null);
  if (nums.length < 8) {
    return 'steady';
  }
  const last = nums[nums.length - 1];
  const earlier = nums.slice(-8, -3);
  const avg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const diff = last - avg;
  return diff > 0.15 ? 'rising' : diff < -0.15 ? 'falling' : 'steady';
}

export function trendArrow(t: Trend) {
  if (t === 'rising') {
    return '↑';
  } else if (t === 'falling') {
    return '↓';
  }
  return '→';
}

export function fmtWithUnit(v: number | null, unit: string, digits = 2) {
  if (v === null) {
    return '—';
  }
  return `${v.toFixed(digits)} ${unit}`;
}

export function agoLabel(seconds: number) {
  if (seconds < 90) {
    return `${Math.max(1, Math.round(seconds))} s ago`;
  }
  return `${Math.round(seconds / 60)} min ago`;
}

export function levelStyles(word: Level | null) {
  if (word === 'High') {
    return {
      pill: styles.toneHighBg,
      text: styles.toneHighText,
      bar: styles.toneHighBar,
    };
  }
  if (word === 'Medium') {
    return {
      pill: styles.toneMediumBg,
      text: styles.toneMediumText,
      bar: styles.toneMediumBar,
    };
  }
  return {
    pill: styles.toneLowBg,
    text: styles.toneLowText,
    bar: styles.toneLowBar,
  };
}

const styles = StyleSheet.create({
  toneLowBg: { backgroundColor: COLORS.greenTint },
  toneMediumBg: { backgroundColor: COLORS.amberTint },
  toneHighBg: { backgroundColor: COLORS.redTint },
  toneLowText: { color: COLORS.green },
  toneMediumText: { color: COLORS.amber },
  toneHighText: { color: COLORS.red },
  toneLowBar: { backgroundColor: COLORS.green },
  toneMediumBar: { backgroundColor: COLORS.amber },
  toneHighBar: { backgroundColor: COLORS.red },
});

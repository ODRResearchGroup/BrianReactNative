import React, { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import type { SensorRecord } from '../../services/database/db';

const RADAR_FIELDS = [
  'ch4',
  'nh3',
  'hcho',
  'voc',
  'odour',
  'h2s',
  'etoh',
  'no2',
  'co',
  'smoke',
  'h2',
] as const;

const BORDER = '#e4e4df';
const FOCUS_BORDER = '#0b66c3';

function toImageUri(path: string): string {
  return /^(file|content|https?):\/\//.test(path) ? path : `file://${path}`;
}

function MiniRadar({ record, size }: { record: SensorRecord; size: number }) {
  const values = RADAR_FIELDS.map(field => Number(record[field]) || 0);
  const c = size / 2;
  const R = size * 0.44;
  const max = Math.max(1, ...values);
  const n = values.length;

  const pt = (i: number, f: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(c + R * f * Math.cos(a)).toFixed(1)},${(
      c +
      R * f * Math.sin(a)
    ).toFixed(1)}`;
  };
  const ring = (f: number) =>
    Array.from({ length: n }, (_, i) => pt(i, f)).join(' ');

  return (
    <Svg width={size} height={size}>
      <Polygon points={ring(1)} fill="none" stroke="#d3d6d0" strokeWidth={1} />
      <Polygon
        points={ring(0.5)}
        fill="none"
        stroke="#e1e3de"
        strokeWidth={1}
      />
      {values.map((_, i) => {
        const [x, y] = pt(i, 1).split(',');
        return (
          <Line
            key={i}
            x1={c}
            y1={c}
            x2={x}
            y2={y}
            stroke="#e1e3de"
            strokeWidth={0.8}
          />
        );
      })}
      <Polygon
        points={values.map((v, i) => pt(i, Math.min(1, v / max))).join(' ')}
        fill="#a9d0ff"
        fillOpacity={0.75}
        stroke="#0b66c3"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type Props = {
  record: SensorRecord;
  onPress: (record: SensorRecord) => void;
  focused?: boolean;
  dimmed?: boolean;
};

function FingerprintMapCard({
  record,
  onPress,
  focused = false,
  dimmed = false,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!record.photoPath && !imageFailed;
  const title = record.title?.trim() || 'Fingerprint';

  const radarSize = focused ? (showImage ? 88 : 104) : showImage ? 56 : 64;

  return (
    <Pressable
      onPress={() => onPress(record)}
      accessibilityRole="button"
      accessibilityLabel={
        focused ? `Open fingerprint ${title}` : `Select fingerprint ${title}`
      }
      style={[styles.wrapper, dimmed && styles.dimmed]}>
      <View style={[styles.card, focused && styles.cardFocused]}>
        <Text
          style={[styles.title, focused && styles.titleFocused]}
          numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.row}>
          <MiniRadar record={record} size={radarSize} />
          {showImage ? (
            <Image
              source={{ uri: toImageUri(record.photoPath as string) }}
              style={[styles.photo, focused && styles.photoFocused]}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : null}
        </View>
        {focused ? <Text style={styles.hint}>Tap again to open</Text> : null}
      </View>
      <View style={styles.pointer} />
    </Pressable>
  );
}

export default memo(FingerprintMapCard);

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  dimmed: { opacity: 0.45 },
  card: {
    minWidth: 96,
    maxWidth: 150,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  cardFocused: {
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: FOCUS_BORDER,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1b1c1a',
    marginBottom: 4,
    textAlign: 'center',
  },
  titleFocused: {
    fontSize: 15,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photo: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#eceee8',
  },
  photoFocused: {
    width: 88,
    height: 88,
    borderRadius: 12,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: FOCUS_BORDER,
    textAlign: 'center',
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    marginTop: -1,
  },
});

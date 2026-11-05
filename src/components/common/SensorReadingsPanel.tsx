import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import CustomRadarChart, { gasSeries, radarMax } from './CustomRadarChart';
import {
  GAS_SENSOR_DEFINITIONS,
  SensorValues,
  readSensor,
  sensorTitle,
} from '../../sensors';

const { width: screenWidth } = Dimensions.get('window');

const COLORS = {
  bg: '#f6f6f3',
  surface: '#ffffff',
  border: '#e4e4df',
  ink: '#1b1c1a',
  muted: '#666963',
};

type Props = {
  readings: SensorValues;
  title?: string;
  emptyText?: string;
};

export default function SensorReadingsPanel({
  readings,
  title = 'Fingerprint',
  emptyText = 'No sensor readings were recorded for this fingerprint.',
}: Props) {
  const rows = useMemo(
    () =>
      GAS_SENSOR_DEFINITIONS.map(s => ({
        ...s,
        value: readSensor(readings, s) ?? 0,
      })).sort((a, b) => b.value - a.value),
    [readings],
  );
  const series = useMemo(
    () => gasSeries('fingerprint-readings', title, readings),
    [readings, title],
  );

  if (!rows.some(r => r.value !== 0)) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No readings</Text>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.bodyMuted}>
        Each axis shows the raw reading from one gas sensor channel. The shape
        changes as the sensor array responds to different substances in the air.
      </Text>

      <View style={styles.radarCard}>
        <CustomRadarChart
          data={series}
          size={Math.min(screenWidth - 64, 320)}
          maxValue={radarMax(series)}
          gridLevels={5}
        />
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>All gas channels</Text>
        <Text style={styles.bodyMuted}>
          Raw signal from each gas channel, strongest first.
        </Text>
      </View>

      <View style={styles.listCard}>
        {rows.map((s, i) => (
          <View
            key={s.key}
            accessible
            accessibilityLabel={`${sensorTitle(s)}: ${s.value.toFixed(2)} ${
              s.unit
            }`}
            style={[styles.listRow, i > 0 && styles.listRowBorder]}>
            <View style={styles.listText}>
              <Text style={styles.listName}>{sensorTitle(s)}</Text>
            </View>
            <View style={styles.listRight}>
              <Text style={styles.caption}>
                {s.value.toFixed(2)} {s.unit}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: 20 },

  bodyMuted: { fontSize: 15, lineHeight: 22, color: COLORS.muted },

  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },

  radarCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    alignItems: 'center',
  },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 40 },

  emptyTitle: { fontSize: 16, fontWeight: '500', color: COLORS.ink },

  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  sectionHead: { gap: 4 },

  listCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 60,
    paddingVertical: 12,
  },

  listRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },

  listText: { flex: 1 },

  listName: { fontSize: 15, fontWeight: '500', color: COLORS.ink },

  listRight: { alignItems: 'flex-end', gap: 4 },
});

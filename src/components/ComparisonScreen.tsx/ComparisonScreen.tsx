import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Eye, EyeOff, Share2 } from 'lucide-react-native';

import { GAS_SENSOR_DEFINITIONS } from '../../sensors';
import { COLORS } from '../SmellWalk/consts';
import { exportFingerprintsJson } from '../../services/sync/exportService';
import CustomRadarChart, {
  seriesColor,
  gasSeries,
  radarMax,
} from '../common/CustomRadarChart';
import { StoredItem, Tone } from './types';
import { fmt, num, verdict } from './utils';

interface ComparisonViewProps {
  selectedItems: StoredItem[];
  onBack: () => void;
}

const toneStyles = {
  low: { bg: COLORS.greenTint, fg: COLORS.green },
  medium: { bg: COLORS.amberTint, fg: COLORS.amber },
  high: { bg: COLORS.redTint, fg: COLORS.red },
};

export default function ComparisonScreen({
  selectedItems,
  onBack,
}: ComparisonViewProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const items = useMemo(
    () =>
      selectedItems.map((item, i) => ({
        key: item.key,
        title: item.data.fingerprintTitle?.title || `Fingerprint ${i + 1}`,
        color: seriesColor(i).stroke as string,
        readings: (item.data.fingerprint?.olfactoryData?.readings ??
          {}) as Record<string, unknown>,
        series: gasSeries(
          item.key,
          item.data.fingerprintTitle?.title || `Fingerprint ${i + 1}`,
          item.data.fingerprint?.olfactoryData?.readings ?? {},
          seriesColor(i),
        ),
      })),
    [selectedItems],
  );

  const allSeries = useMemo(() => items.flatMap(i => i.series), [items]);
  const maxValue = useMemo(() => radarMax(allSeries), [allSeries]);
  const visibleSeries = useMemo(
    () => items.filter(i => !hidden.has(i.key)).flatMap(i => i.series),
    [items, hidden],
  );

  const [a, b] = items;

  const diffs = useMemo(() => {
    if (!a || !b) {
      return [];
    }
    return GAS_SENSOR_DEFINITIONS.map((sensor, idx) => {
      const va = num(a.readings[sensor.key]);
      const vb = num(b.readings[sensor.key]);
      const top = Math.max(Math.abs(va ?? 0), Math.abs(vb ?? 0));
      const gap =
        va === null || vb === null
          ? null
          : top === 0
          ? 0
          : Math.abs(va - vb) / top;
      return {
        key: sensor.key,
        label: sensor.chartLabel as string,
        unit: (sensor.unit ?? '') as string,
        va,
        vb,
        top,
        gap,
        order: idx,
      };
    }).sort((x, y) => (y.gap ?? -1) - (x.gap ?? -1) || x.order - y.order);
  }, [a, b]);

  const comparable = diffs.filter(d => d.gap !== null);
  const similarity = comparable.length
    ? 1 - comparable.reduce((s, d) => s + (d.gap ?? 0), 0) / comparable.length
    : null;
  const result = similarity === null ? null : verdict(similarity);

  const toggle = (key: string) =>
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < items.length - 1) {
        next.add(key);
      }
      return next;
    });

  const exportSelected = async () => {
    if (selectedItems.length === 0) {
      Alert.alert('Nothing to export', 'Select fingerprints first.');
      return;
    }
    setExporting(true);
    setExported(false);
    try {
      const savedPath = await exportFingerprintsJson(
        selectedItems.map(i => i.data),
      );
      setExported(true);
      if (Platform.OS === 'android') {
        Alert.alert('Fingerprints saved', `Saved to:\n${savedPath}`);
      }
    } catch (err: any) {
      console.error('Export selected failed', err);
      Alert.alert('Export failed', err?.message || String(err));
    } finally {
      setExporting(false);
    }
  };

  if (items.length < 2) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header onBack={onBack} />
        <View style={styles.emptyWrap}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Pick two fingerprints</Text>
            <Text style={styles.bodyMuted}>
              Comparing needs two saved fingerprints. Go back and tick a second
              one.
            </Text>
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}>
              <ArrowLeft color="#fff" size={20} strokeWidth={2.5} />
              <Text style={styles.primaryButtonText}>Choose fingerprints</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Header onBack={onBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Smell shape
          </Text>
          <Text style={styles.caption}>
            Each corner is a sensor. Farther from the center = stronger
            reaction.
          </Text>

          <View style={styles.chips}>
            {items.map(it => {
              const off = hidden.has(it.key);
              return (
                <Pressable
                  key={it.key}
                  onPress={() => toggle(it.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !off }}
                  accessibilityLabel={`${off ? 'Show' : 'Hide'} ${it.title}`}
                  style={[
                    styles.chip,
                    !off && {
                      backgroundColor: COLORS.greenTint,
                      borderColor: it.color,
                    },
                  ]}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: off ? COLORS.border : it.color },
                    ]}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.chipText, off && styles.textMuted]}>
                    {it.title}
                  </Text>
                  {off ? (
                    <EyeOff color={COLORS.muted} size={16} />
                  ) : (
                    <Eye color={COLORS.ink} size={16} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.chartWrap}>
            <CustomRadarChart
              data={visibleSeries}
              size={300}
              maxValue={maxValue}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Result
          </Text>
          {result ? (
            <View style={styles.verdictRow}>
              <View
                style={[
                  styles.pill,
                  { backgroundColor: toneStyles[result.tone].bg },
                ]}>
                <Text
                  style={[
                    styles.pillText,
                    { color: toneStyles[result.tone].fg },
                  ]}>
                  {result.word} · {Math.round((similarity ?? 0) * 100)}%
                </Text>
              </View>
              <Text style={styles.bodyMuted}>{result.hint}</Text>
            </View>
          ) : (
            <Text style={styles.bodyMuted}>
              These fingerprints share no sensor readings, so they can't be
              compared.
            </Text>
          )}
        </View>

        {comparable.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Readings
            </Text>

            <View>
              {diffs.map((d, i) => {
                const tone: Tone | null =
                  d.gap === null
                    ? null
                    : d.gap < 0.15
                    ? 'low'
                    : d.gap < 0.4
                    ? 'medium'
                    : 'high';
                const stronger =
                  d.va === null || d.vb === null || d.va === d.vb
                    ? null
                    : d.va > d.vb
                    ? a
                    : b;
                return (
                  <View
                    key={d.key}
                    style={[styles.diffRow, i === 0 && styles.diffRowFirst]}>
                    <View style={styles.diffHead}>
                      <Text style={styles.diffLabel}>{d.label}</Text>
                      {tone && (
                        <View
                          style={[
                            styles.miniPill,
                            { backgroundColor: toneStyles[tone].bg },
                          ]}>
                          <Text
                            style={[
                              styles.miniPillText,
                              { color: toneStyles[tone].fg },
                            ]}>
                            {tone === 'low'
                              ? 'Match'
                              : tone === 'medium'
                              ? 'Slight gap'
                              : 'Big gap'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {[a, b].map((it, idx) => {
                      const v = idx === 0 ? d.va : d.vb;
                      const pct =
                        v === null || d.top === 0
                          ? 0
                          : Math.max(0, Math.min(1, Math.abs(v) / d.top));
                      return (
                        <View key={it.key} style={styles.barRow}>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${pct * 100}%`,
                                  backgroundColor: it.color,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.barValue}>
                            {fmt(v)}
                            {d.unit ? ` ${d.unit}` : ''}
                          </Text>
                        </View>
                      );
                    })}

                    {stronger && d.gap !== null && d.gap >= 0.15 && (
                      <Text style={styles.caption}>
                        Stronger in {stronger.title}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.exportBlock}>
          <Pressable
            onPress={exportSelected}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel="Export selected fingerprints"
            accessibilityHint="Saves both fingerprints as a JSON file you can share"
            style={({ pressed }) => [
              styles.primaryButton,
              exporting && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {exported ? (
              <Check color="#fff" size={20} strokeWidth={2.5} />
            ) : (
              <Share2 color="#fff" size={20} strokeWidth={2.25} />
            )}
            <Text style={styles.primaryButtonText}>
              {exporting
                ? 'Preparing file…'
                : exported
                ? 'Exported'
                : 'Export both fingerprints'}
            </Text>
          </Pressable>
          <Text style={styles.captionCenter}>
            {exported
              ? 'Done. Your file was handed to the share sheet.'
              : 'Saves a JSON file you can send or store.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to fingerprint list"
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <ArrowLeft color={COLORS.ink} size={24} strokeWidth={2} />
      </Pressable>
      <Text style={styles.headerTitle} accessibilityRole="header">
        Compare fingerprints
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },

  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },
  captionCenter: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
    textAlign: 'center',
  },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: COLORS.muted },
  textMuted: { color: COLORS.muted },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.ink },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },
  emptyWrap: { flex: 1, padding: 16 },

  card: {
    gap: 8,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },

  verdictRow: { gap: 10, alignItems: 'flex-start' },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '500' },
  miniPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  miniPillText: { fontSize: 12, fontWeight: '500' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    maxWidth: '100%',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipText: { flexShrink: 1, fontSize: 14, color: COLORS.ink },
  dot: { width: 8, height: 8, borderRadius: 4 },

  chartWrap: { alignItems: 'center', marginTop: 8 },

  diffRow: {
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  diffRowFirst: { borderTopWidth: 0, paddingTop: 8 },
  diffHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  diffLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.bg,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4 },
  barValue: {
    minWidth: 76,
    textAlign: 'right',
    fontSize: 13,
    color: COLORS.muted,
  },

  exportBlock: { gap: 8, marginTop: 4 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: COLORS.green,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
});

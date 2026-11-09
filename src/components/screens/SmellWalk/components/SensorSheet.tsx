import { X } from 'lucide-react-native';
import {
  Modal,
  View,
  Pressable,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MAX_POINTS, SAMPLE_MS } from '../consts';
import { SensorAnalysis } from '../types';
import { agoLabel, trendArrow } from '../utils';
import WaitIcon from './icons/WaitIcon';
import LevelBadge from './LevelBadge';
import { COLORS } from '../../../../consts';
import CustomRadarChart, {
  radarSeries,
} from '../../../common/CustomRadarChart';

export default function SensorSheet({
  visible,
  onClose,
  sensors,
  ready,
  screenWidth,
}: {
  visible: boolean;
  onClose: () => void;
  sensors: SensorAnalysis[];
  ready: boolean;
  screenWidth: number;
}) {
  const series = radarSeries(
    'live',
    'Live',
    sensors.map(s => ({ x: s.label, y: s.current ?? 0 })),
  );

  const hasAnyValue = sensors.some(s => s.current !== null);

  const sorted = [...sensors].sort((a, b) => (b.level ?? -1) - (a.level ?? -1));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable
          style={styles.sheetDismiss}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sensor detail"
        />

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Gas sensor readings
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <X color={COLORS.ink} size={22} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}>
            {!hasAnyValue ? (
              <View style={styles.emptyState}>
                <WaitIcon size={28} color={COLORS.muted} />
                <Text style={styles.emptyTitle}>No readings yet</Text>
                <Text style={styles.emptyText}>
                  Make sure the e-nose is connected and switched on. Readings
                  appear here within a few seconds.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.bodyMuted}>
                  {ready
                    ? `Relative signal level compared with the last ${agoLabel(
                        (MAX_POINTS - 1) * (SAMPLE_MS / 1000),
                      )} of this walk.`
                    : 'Collecting baseline readings — comparisons available shortly.'}
                </Text>

                <View style={styles.radarCard}>
                  <CustomRadarChart
                    data={series}
                    size={Math.min(screenWidth - 64, 320)}
                    gridLevels={5}
                  />
                </View>

                <View style={styles.sheetSectionHead}>
                  <Text style={styles.sectionTitle}>All gas channels</Text>
                  <Text style={styles.bodyMuted}>
                    {ready
                      ? 'Relative signal level compared with the last 5 minutes of this walk.'
                      : 'Collecting baseline readings — comparisons available shortly.'}
                  </Text>
                </View>

                <View style={styles.listCard}>
                  {sorted.map((s, i) => (
                    <View
                      key={s.key}
                      accessible
                      accessibilityLabel={`${s.label}: ${
                        s.current !== null
                          ? `${s.current.toFixed(2)} ${s.unit}`
                          : 'no reading'
                      }. ${
                        s.levelWord
                          ? `Relative level: ${s.levelWord}, ${s.trend}.`
                          : ''
                      }`}
                      style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                      <View style={styles.listText}>
                        <Text style={styles.listName}>{s.label}</Text>
                      </View>

                      <View style={styles.listRight}>
                        <LevelBadge word={ready ? s.levelWord : null} />
                        <Text style={styles.caption}>
                          {s.current === null
                            ? '—'
                            : `${s.current.toFixed(2)} ${s.unit}`}
                          {ready && s.current !== null
                            ? `  ${trendArrow(s.trend)}`
                            : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bodyMuted: { fontSize: 15, lineHeight: 22, color: COLORS.muted },

  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },

  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,22,20,0.5)',
  },

  sheetDismiss: { flex: 1 },

  sheet: {
    maxHeight: '88%',
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
  },

  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d6d8d2',
    marginBottom: 6,
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
  },

  sheetTitle: { fontSize: 18, fontWeight: '600', color: COLORS.ink },

  sheetContent: { padding: 20, paddingBottom: 40, gap: 20 },

  sheetSectionHead: { gap: 4 },
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

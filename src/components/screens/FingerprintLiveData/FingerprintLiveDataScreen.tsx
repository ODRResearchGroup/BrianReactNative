import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import {
  NavigationProp,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import Svg, { Path, Line, Rect } from 'react-native-svg';
import { useBLE } from '../../../BLEUniversal';
import { BatteryIndicator, BatteryLifetime } from '../../common/BatteryStatus';
import CustomRadarChart, { radarSeries } from '../../common/CustomRadarChart';
import { useInfluxDB } from '../../../services/influx/InfluxDBService';
import {
  GAS_SENSOR_DEFINITIONS,
  GasSensorKey,
  readGasValues,
  sensorTitle,
} from '../../../sensors';
import { CHANNEL_COLORS, COLORS } from '../../../consts';
import FingerprintModal from '../../common/FingerprintModal';
import { ChevronRight } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const PLOT_WINDOW_S = 5 * 60;
const SAMPLE_MS = 1000;
const PLOT_HISTORY_SIZE = (PLOT_WINDOW_S * 1000) / SAMPLE_MS;
const WINDOW_LABEL = `last ${PLOT_WINDOW_S / 60} minutes`;
const PLOT_WIDTH = width - 72;
const PLOT_HEIGHT = 150;

type SensorKey = GasSensorKey;
const SENSORS = GAS_SENSOR_DEFINITIONS;

interface PlotPoint {
  time: number;
  value: number;
}

const emptyHistory = (): Record<SensorKey, PlotPoint[]> =>
  SENSORS.reduce((acc, s) => {
    acc[s.key] = [];
    return acc;
  }, {} as Record<SensorKey, PlotPoint[]>);

const LiveRadar = memo(function LiveRadar({
  items,
}: {
  items: { chartLabel: string; value: number }[];
}) {
  const data = useMemo(
    () =>
      radarSeries(
        'live-data',
        'Live Reading',
        items.map(d => ({ x: d.chartLabel, y: d.value })),
      ),
    [items],
  );
  return (
    <View style={styles.radarBody}>
      <View style={styles.chartWrap}>
        <CustomRadarChart
          data={data}
          size={Math.min(width - 64, 320)}
          gridLevels={5}
        />
      </View>
    </View>
  );
});

export default function FingerprintLiveDataScreen() {
  const { characteristicValues, connectedDevice } = useBLE();
  const { walkId } = useInfluxDB();
  const navigation = useNavigation<NavigationProp<{ Device: undefined }>>();
  const [isConnected, setIsConnected] = useState(false);

  const batteryPercentage = characteristicValues['Battery Percentage'];
  const batteryRuntime = characteristicValues['Battery Runtime'];
  const currentValues = useMemo(
    () => readGasValues(characteristicValues),
    [characteristicValues],
  );
  const valuesRef = useRef(currentValues);
  valuesRef.current = currentValues;

  useEffect(() => {
    const id = setInterval(() => {
      const t = (Date.now() - startTimeRef.current) / 1000;
      setPlotHistory(prev => {
        const next = {} as Record<SensorKey, PlotPoint[]>;
        SENSORS.forEach(s => {
          next[s.key] = [
            ...prev[s.key],
            { time: t, value: valuesRef.current[s.key] },
          ].slice(-PLOT_HISTORY_SIZE);
        });
        return next;
      });
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);
  const [showFingerprintModal, setShowFingerprintModal] = useState(false);

  const [selectedSensor, setSelectedSensor] = useState<SensorKey | null>(null);
  const [plotHistory, setPlotHistory] =
    useState<Record<SensorKey, PlotPoint[]>>(emptyHistory);
  const startTimeRef = useRef<number>(Date.now());
  const selectedDef = SENSORS.find(s => s.key === selectedSensor) ?? null;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const checkConnection = async () => {
        const connected =
          connectedDevice !== null &&
          (await connectedDevice.isConnected().catch(() => false));
        if (active) {
          setIsConnected(connected);
        }
      };

      checkConnection().catch(() => {
        if (active) {
          setIsConnected(false);
        }
      });

      return () => {
        active = false;
      };
    }, [connectedDevice]),
  );

  useEffect(() => {
    const now = Date.now();
    const elapsedSeconds = (now - startTimeRef.current) / 1000;

    setPlotHistory(prev => {
      const updated = { ...prev };

      (Object.keys(currentValues) as SensorKey[]).forEach(key => {
        const newPoint: PlotPoint = {
          time: elapsedSeconds,
          value: currentValues[key],
        };

        const points = [...prev[key], newPoint];
        updated[key] = points.slice(-PLOT_HISTORY_SIZE);
      });

      return updated;
    });
  }, [currentValues]);

  const radarData = useMemo(
    () =>
      SENSORS.map(s => ({ ...s, value: currentValues[s.key] })).filter(
        item => !isNaN(item.value),
      ),
    [currentValues],
  );

  const handleFingerprint = async () => {
    const connected =
      connectedDevice !== null &&
      (await connectedDevice.isConnected().catch(() => false));
    if (!connected) {
      setIsConnected(false);
      Alert.alert('e-nose not connected', 'Connect to the e-nose first.');
      return;
    }

    setShowFingerprintModal(true);
  };

  const goToDeviceScreen = () => navigation.navigate('Device');

  const generateMiniPlot = (sensorKey: SensorKey): string => {
    const points = plotHistory[sensorKey];
    if (points.length < 2) {
      return '';
    }

    const values = points.map(p => p.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const dataRange = dataMax - dataMin;

    const padding = dataRange * 0.1;
    const Y_MIN = Math.max(0, dataMin - padding);
    const Y_MAX = dataMax + padding;
    const range = Y_MAX - Y_MIN || 0.001;

    const xStep = PLOT_WIDTH / (PLOT_HISTORY_SIZE - 1);

    const pathPoints = points.map((point, index) => {
      const x = index * xStep;
      const clampedValue = Math.max(Y_MIN, Math.min(Y_MAX, point.value));
      const normalized = (clampedValue - Y_MIN) / range;
      const y = PLOT_HEIGHT - normalized * (PLOT_HEIGHT - 20);
      return `${x},${y}`;
    });

    return `M ${pathPoints.join(' L ')}`;
  };

  return (
    <SafeAreaView style={styles.root}>
      <FingerprintModal
        visible={showFingerprintModal}
        onClose={() => setShowFingerprintModal(false)}
        walkId={walkId}
        initialFingerprint={null}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Live data
        </Text>
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConnected ? COLORS.green : COLORS.muted },
            ]}
          />
          <Text style={styles.statusText}>
            {isConnected ? 'Connected' : 'Not connected'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>Battery</Text>
            <BatteryIndicator percentage={batteryPercentage} />
          </View>
          <BatteryLifetime runtimeHours={batteryRuntime} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Live reading</Text>
          <LiveRadar items={radarData} />
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>All gas channels</Text>
          <Text style={styles.bodyMuted}>
            Raw reading from each gas sensor channel. Tap one to see the{' '}
            {WINDOW_LABEL}.
          </Text>
        </View>

        <View style={styles.listCard}>
          {radarData.map((item, i) => (
            <Pressable
              key={item.key}
              onPress={() => setSelectedSensor(item.key)}
              accessibilityRole="button"
              accessibilityLabel={`${sensorTitle(item)}: ${item.value.toFixed(
                4,
              )} ${item.unit}. Show plot.`}
              style={[styles.listRow, i > 0 && styles.listRowBorder]}>
              <Text style={styles.listName}>{sensorTitle(item)}</Text>
              <View style={styles.listRight}>
                <Text style={styles.listValue}>
                  {item.value.toFixed(4)} {item.unit}
                </Text>
                <ChevronRight size={16} color={COLORS.green} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerCaption}>
          {isConnected
            ? 'Saves a snapshot of the current readings'
            : 'Connect the e-nose to take a fingerprint'}
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={isConnected ? handleFingerprint : goToDeviceScreen}
          accessibilityRole="button"
          accessibilityLabel={isConnected ? 'Fingerprint' : 'Connect e-nose'}>
          <Text style={styles.primaryButtonText}>
            {isConnected ? 'Fingerprint' : 'Connect e-nose'}
          </Text>
        </TouchableOpacity>
      </View>

      {selectedSensor && (
        <Modal
          visible
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedSensor(null)}>
          <View style={styles.sheetBackdrop}>
            <Pressable
              style={styles.sheetDismiss}
              onPress={() => setSelectedSensor(null)}
              accessibilityRole="button"
              accessibilityLabel="Close plot"
            />
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle} accessibilityRole="header">
                  {selectedDef && sensorTitle(selectedDef)} · {WINDOW_LABEL}
                </Text>
                <Pressable
                  onPress={() => setSelectedSensor(null)}
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close">
                  <Text style={styles.closeText}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.sheetContent}>
                <View style={styles.plotCard}>
                  <Svg width={PLOT_WIDTH} height={PLOT_HEIGHT}>
                    <Rect
                      x={0}
                      y={0}
                      width={PLOT_WIDTH}
                      height={PLOT_HEIGHT}
                      fill={COLORS.bg}
                    />

                    {[0, 0.5, 1].map((fraction, i) => (
                      <Line
                        key={`grid-${i}`}
                        x1={0}
                        y1={PLOT_HEIGHT - fraction * (PLOT_HEIGHT - 20)}
                        x2={PLOT_WIDTH}
                        y2={PLOT_HEIGHT - fraction * (PLOT_HEIGHT - 20)}
                        stroke={COLORS.border}
                        strokeWidth="1"
                        strokeDasharray={fraction === 0.5 ? '4,4' : '0'}
                      />
                    ))}

                    <Path
                      d={generateMiniPlot(selectedSensor)}
                      stroke={CHANNEL_COLORS[6]}
                      strokeWidth="2.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>

                <View style={styles.currentRow}>
                  <Text style={styles.bodyMuted}>Current</Text>
                  <Text style={styles.currentValue}>
                    {currentValues[selectedSensor].toFixed(4)}{' '}
                    {selectedDef?.unit}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: '600', color: COLORS.ink },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '500', color: COLORS.ink },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 12,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  cardLabel: { fontSize: 15, fontWeight: '600', color: COLORS.ink },

  radarBody: { alignSelf: 'stretch' },
  chartWrap: { alignItems: 'center', overflow: 'hidden' },

  sectionHead: { gap: 4, marginTop: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: COLORS.muted },

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
  listName: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  listRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listValue: {
    fontSize: 13,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },

  footer: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  footerCaption: { fontSize: 13, color: COLORS.muted, textAlign: 'center' },
  primaryButton: {
    height: 54,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '500', color: '#fff' },

  // Plot sheet
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,22,20,0.5)',
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingBottom: 24,
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
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 20, color: COLORS.ink },
  sheetContent: { padding: 20, gap: 16 },
  plotCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    alignItems: 'center',
    overflow: 'hidden',
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  currentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
});

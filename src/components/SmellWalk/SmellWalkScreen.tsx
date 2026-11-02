import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Dimensions,
  InteractionManager,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import KeepAwake from 'react-native-keep-awake';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useBLE } from '../../BLEUniversal';
import CustomRadarChart from '../common/CustomRadarChart';
import FingerprintModal from '../common/FingerprintModal';
import LiveLocationMap from '../common/LiveLocationMap';
import { useInfluxDB } from '../../services/influx/InfluxDBService';
import { exportSmellWalkZip } from '../../services/sync/exportService';
import {
  finalizeInterruptedWalk,
  listInterruptedWalks,
} from '../../services/database/db';
import {
  NavigationProp,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import {
  ArrowRight,
  CircleStop,
  FingerprintPattern,
  Play,
  X,
} from 'lucide-react-native';
import {
  ENV_SENSOR_DEFINITIONS,
  GAS_SENSOR_DEFINITIONS,
  SENSOR_DEFINITIONS,
} from '../../sensors';
import {
  ensureFullLocationAccess,
  locationAccessMessage,
  openLocationSettings,
} from '../../services/location/locationPermissions';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SAMPLE_MS = 2000;
const MAX_POINTS = 150;
const MIN_POINTS_FOR_LEVELS = 4;
const GRAPH_HEIGHT = 150;

const COLORS = {
  bg: '#f6f6f3',
  surface: '#ffffff',
  border: '#e4e4df',
  ink: '#1b1c1a',
  muted: '#666963',
  green: '#1f5c3f',
  greenTint: '#e6efe9',
  red: '#b3261e',
  redTint: '#fbeae8',
  amber: '#8a5a00',
  amberTint: '#fff3d6',
  grid: '#e4e4df',
};

const CHANNEL_COLORS = [
  '#1f5c3f',
  '#2b7bb9',
  '#c2571a',
  '#8e44ad',
  '#b8860b',
  '#c0392b',
  '#16899b',
  '#6c7a1f',
  '#d1457f',
  '#4d5b6b',
];

const channelColor = (index: number) =>
  CHANNEL_COLORS[index % CHANNEL_COLORS.length];

type Point = { t: number; v: Record<string, number | null> };

type Trend = 'rising' | 'falling' | 'steady';

type Level = 'Low' | 'Medium' | 'High';

type SensorAnalysis = {
  key: string;
  label: string;
  unit: string;
  color: string;
  current: number | null;
  peak: number | null;
  avg: number | null;
  series: (number | null)[];
  level: number | null;
  levelWord: Level | null;
  trend: Trend;
};

type ChartLine = {
  key: string;
  color: string;
  values: (number | null)[];
};

function describeError(error: unknown): string {
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

const levelWord = (l: number): Level =>
  l < 0.34 ? 'Low' : l < 0.67 ? 'Medium' : 'High';

function normalise(values: (number | null)[]): (number | null)[] {
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

function trendOf(series: (number | null)[]): Trend {
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

const trendArrow = (t: Trend) =>
  t === 'rising' ? '↑' : t === 'falling' ? '↓' : '→';

const fmtWithUnit = (v: number | null, unit: string, digits = 2) =>
  v === null ? '—' : `${v.toFixed(digits)} ${unit}`;

const agoLabel = (seconds: number) =>
  seconds < 90
    ? `${Math.max(1, Math.round(seconds))} s ago`
    : `${Math.round(seconds / 60)} min ago`;

const levelStyles = (word: Level | null) => {
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
};

type IconProps = { size?: number; color?: string; strokeWidth?: number };

const Icon = ({
  size = 20,
  color = COLORS.ink,
  strokeWidth = 2,
  children,
}: IconProps & { children: React.ReactNode }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round">
    {children}
  </Svg>
);

const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m6 9 6 6 6-6" />
  </Icon>
);

const ChevronUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m18 15-6-6-6 6" />
  </Icon>
);

const WaitIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 6v6l4 2" />
  </Icon>
);

const Dot = ({ color, size = 10 }: { color: string; size?: number }) => (
  <Svg width={size} height={size}>
    <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={color} />
  </Svg>
);

function RoundAction({
  icon,
  label,
  onPress,
  tone,
  muted,
  accessibilityLabel,
  accessibilityHint,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  tone: 'primary' | 'danger' | 'light';
  muted?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!muted }}
      style={({ pressed }) => [
        styles.roundActionWrap,
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          styles.roundAction,
          tone === 'primary' && styles.roundActionPrimary,
          tone === 'danger' && styles.roundActionDanger,
          tone === 'light' && styles.roundActionLight,
          muted && styles.roundActionMuted,
        ]}>
        {icon}
      </View>
      <View style={styles.roundActionLabelChip}>
        <Text style={styles.roundActionLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

function LevelBadge({ word }: { word: Level | null }) {
  const tone = levelStyles(word);
  const filled =
    word === 'High' ? 3 : word === 'Medium' ? 2 : word === 'Low' ? 1 : 0;

  return (
    <View style={[styles.levelBadge, word ? tone.pill : styles.levelBadgeOff]}>
      <View style={styles.levelBars}>
        {[1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              styles.levelBar,
              i === 1 && styles.levelBar1,
              i === 2 && styles.levelBar2,
              i === 3 && styles.levelBar3,
              i <= filled ? tone.bar : styles.levelBarOff,
            ]}
          />
        ))}
      </View>
      <Text
        style={[styles.levelBadgeText, word ? tone.text : styles.textMuted]}>
        {word ?? 'No signal'}
      </Text>
    </View>
  );
}

function LineGraph({
  lines,
  windowSize,
  filled,
  summary,
}: {
  lines: ChartLine[];
  windowSize: number;
  filled: boolean;
  summary: string;
}) {
  const [w, setW] = useState(0);
  const padY = 16;
  const height = GRAPH_HEIGHT;

  const toSegments = (values: (number | null)[]) => {
    const n = values.length;
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];

    values.forEach((v, i) => {
      if (v === null || w === 0) {
        if (current.length) {
          segments.push(current);
          current = [];
        }
        return;
      }
      const x = windowSize <= 1 ? w : w - ((n - 1 - i) / (windowSize - 1)) * w;
      const y = padY + (1 - v) * (height - padY * 2);
      current.push({ x, y });
    });
    if (current.length) {
      segments.push(current);
    }
    return segments;
  };

  const linePath = (seg: { x: number; y: number }[]) =>
    seg
      .map(
        (p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(' ');

  const areaPath = (seg: { x: number; y: number }[]) =>
    `${linePath(seg)} L${seg[seg.length - 1].x.toFixed(1)} ${
      height - padY
    } L${seg[0].x.toFixed(1)} ${height - padY} Z`;

  return (
    <View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        style={styles.graph}
        onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={height}>
            {[0, 0.5, 1].map(f => (
              <Line
                key={f}
                x1={0}
                x2={w}
                y1={padY + (1 - f) * (height - padY * 2)}
                y2={padY + (1 - f) * (height - padY * 2)}
                stroke={COLORS.grid}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))}

            {lines.map(line =>
              toSegments(line.values).map((seg, i) =>
                seg.length > 1 ? (
                  <React.Fragment key={`${line.key}-${i}`}>
                    {filled && (
                      <Path
                        d={areaPath(seg)}
                        fill={line.color}
                        fillOpacity={0.1}
                      />
                    )}
                    <Path
                      d={linePath(seg)}
                      stroke={line.color}
                      strokeWidth={filled ? 2.5 : 1.75}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </React.Fragment>
                ) : null,
              ),
            )}
          </Svg>
        )}

        <Text style={[styles.axisLabel, styles.axisTop]}>High</Text>
        <Text style={[styles.axisLabel, styles.axisBottom]}>Low</Text>
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.caption}>
          {agoLabel((Math.max(windowSize, 2) - 1) * (SAMPLE_MS / 1000))}
        </Text>
        <Text style={styles.caption}>Now</Text>
      </View>
    </View>
  );
}

/** Simple label/value row used for every list in the drawer. */
function DataRow({
  label,
  value,
  first,
  swatch,
  extra,
}: {
  label: string;
  value: string;
  first?: boolean;
  swatch?: string;
  extra?: React.ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.dataRow, !first && styles.dataRowBorder]}>
      <View style={styles.dataRowLeft}>
        {swatch ? <Dot color={swatch} /> : null}
        <Text style={styles.dataLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.dataRowRight}>
        {extra}
        <Text style={styles.dataValue}>{value}</Text>
      </View>
    </View>
  );
}

function InlineRadar({
  sensors,
  hasData,
  onPress,
}: {
  sensors: SensorAnalysis[];
  hasData: boolean;
  onPress: () => void;
}) {
  const RADAR_SIZE = 128;

  const radarValues = sensors.map(s => ({
    x: s.label,
    y: s.current ?? 0,
  }));

  const maxVal = Math.max(1, ...radarValues.map(v => v.y));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Gas sensor radar chart. Tap to expand."
      style={({ pressed }) => [
        styles.inlineRadarWrap,
        pressed && styles.pressed,
      ]}>
      {hasData ? (
        <CustomRadarChart
          data={[
            {
              key: 'live',
              title: 'Live',
              values: radarValues,
              color: {
                fill: 'hsla(210, 100%, 50%, 0.25)',
                stroke: 'hsla(210, 100%, 40%, 1)',
              },
            },
          ]}
          size={RADAR_SIZE}
          maxValue={maxVal}
          gridLevels={3}
          zoomLevel={1}
          hideLabels
        />
      ) : (
        <View style={styles.inlineRadarEmpty}>
          <WaitIcon size={18} color={COLORS.muted} />
          <Text style={styles.caption}>No signal</Text>
        </View>
      )}
    </Pressable>
  );
}

function SensorSheet({
  visible,
  onClose,
  sensors,
  ready,
}: {
  visible: boolean;
  onClose: () => void;
  sensors: SensorAnalysis[];
  ready: boolean;
}) {
  const hasAnyValue = sensors.some(s => s.current !== null);

  const radarValues = sensors.map(s => ({
    x: s.label,
    y: s.current ?? 0,
  }));

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
                  Each axis shows the raw voltage from one gas sensor channel.
                  The shape changes as the sensor array responds to different
                  substances in the air.
                </Text>

                <View style={styles.radarCard}>
                  <CustomRadarChart
                    data={[
                      {
                        key: 'live',
                        title: 'Live',
                        values: radarValues,
                        color: {
                          fill: 'hsla(210, 100%, 50%, 0.35)',
                          stroke: 'hsla(210, 100%, 40%, 1)',
                        },
                      },
                    ]}
                    size={Math.min(SCREEN_WIDTH - 64, 320)}
                    maxValue={Math.max(1, ...radarValues.map(v => v.y))}
                    gridLevels={5}
                    zoomLevel={1}
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

export default function SmellWalkScreen() {
  const { characteristicValues, connectedDevice } = useBLE();
  const {
    location,
    trail,
    isSmellWalkActive,
    startSmellWalk,
    stopSmellWalk,
    walkId,
  } = useInfluxDB();
  const navigation = useNavigation<NavigationProp<{ Device: undefined }>>();
  const [mapVisible, setMapVisible] = useState(false);
  const [isConnected, setIsConnected] = useState(__DEV__);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showFingerprintModal, setShowFingerprintModal] = useState(false);
  const [showSensorSheet, setShowSensorSheet] = useState(false);
  const [didPromptResume, setDidPromptResume] = useState(false);

  const [history, setHistory] = useState<Point[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('all');
  const [panelOpen, setPanelOpen] = useState(true);

  const valuesRef = useRef(characteristicValues);
  valuesRef.current = characteristicValues;

  const handleResumeWalk = useCallback(
    async (interruptedWalkId: string) => {
      const locationAccess = await ensureFullLocationAccess();
      if (!locationAccess.granted) {
        Alert.alert(
          'Full GPS access required',
          locationAccessMessage(locationAccess),
          [
            { text: 'End walk', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                openLocationSettings().catch(error =>
                  console.error('Could not open location settings:', error),
                );
              },
            },
          ],
        );
        return;
      }

      setDidPromptResume(true);
      startSmellWalk(interruptedWalkId).catch(error => {
        console.error('Could not resume smell walk:', error);
        Alert.alert('Could not resume smell walk', String(error));
      });
    },
    [startSmellWalk],
  );

  useEffect(() => {
    if (!isSmellWalkActive) {
      return;
    }
    KeepAwake.activate();
    return () => {
      KeepAwake.deactivate();
    };
  }, [isSmellWalkActive]);

  useEffect(() => {
    const id = setInterval(() => {
      const v: Record<string, number | null> = {};
      let any = false;

      SENSOR_DEFINITIONS.forEach(sensor => {
        const raw = valuesRef.current[sensor.key];
        const ok = typeof raw === 'number' && Number.isFinite(raw);
        v[sensor.key] = ok ? raw : null;
        any = any || ok;
      });

      if (!any) {
        return;
      }

      setHistory(h => [...h.slice(-(MAX_POINTS - 1)), { t: Date.now(), v }]);
    }, SAMPLE_MS);

    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const interaction = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) {
          setMapVisible(true);
        }
      });

      return () => {
        cancelled = true;
        interaction.cancel();
        setMapVisible(false);
      };
    }, []),
  );

  useEffect(() => {
    if (didPromptResume || isSmellWalkActive) {
      return;
    }
    listInterruptedWalks()
      .then(rows => {
        if (rows.length === 0) {
          setDidPromptResume(true);
          return;
        }
        Alert.alert(
          'Interrupted walk found',
          'Your last walk was interrupted. Do you want to resume it?',
          [
            {
              text: 'End',
              style: 'cancel',
              onPress: () => {
                const finalizedAt = Date.now();
                Promise.all(
                  rows.map(row => finalizeInterruptedWalk(row.id, finalizedAt)),
                ).finally(() => {
                  setDidPromptResume(true);
                });
              },
            },
            {
              text: 'Resume',
              onPress: () => {
                handleResumeWalk(rows[0].id);
              },
            },
          ],
        );
      })
      .catch(() => setDidPromptResume(true));
  }, [didPromptResume, handleResumeWalk, isSmellWalkActive, startSmellWalk]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const checkConnection = async () => {
        const connected =
          connectedDevice !== null &&
          (await connectedDevice.isConnected().catch(() => false));
        if (active) {
          setIsConnected(__DEV__ || connected);
          setShowConnectionModal(!__DEV__ && !connected);
        }
      };

      checkConnection().catch(() => {
        if (active) {
          setIsConnected(__DEV__);
          setShowConnectionModal(!__DEV__);
        }
      });

      return () => {
        active = false;
      };
    }, [connectedDevice]),
  );

  const analysis = useMemo(() => {
    const ready = history.length >= MIN_POINTS_FOR_LEVELS;

    const sensors: SensorAnalysis[] = GAS_SENSOR_DEFINITIONS.map(
      (sensor, index) => {
        const raw = history.map(p => p.v[sensor.key] ?? null);
        const nums = raw.filter((v): v is number => v !== null);
        const series = normalise(raw);
        const level = ready ? series[series.length - 1] ?? null : null;
        const live = characteristicValues[sensor.key];

        return {
          key: sensor.key,
          label: sensor.chartLabel,
          unit: sensor.unit,
          color: channelColor(index),
          current:
            typeof live === 'number' && Number.isFinite(live) ? live : null,
          peak: nums.length ? Math.max(...nums) : null,
          avg: nums.length
            ? nums.reduce((a, b) => a + b, 0) / nums.length
            : null,
          series,
          level,
          levelWord: level === null ? null : levelWord(level),
          trend: trendOf(series),
        };
      },
    );

    const strongest = ready
      ? [...sensors]
          .filter(s => s.level !== null)
          .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0] ?? null
      : null;

    return { ready, sensors, strongest };
  }, [characteristicValues, history]);

  const envReadings = useMemo(
    () =>
      ENV_SENSOR_DEFINITIONS.map(sensor => {
        const raw = characteristicValues[sensor.key];
        return {
          key: sensor.key,
          label: sensor.chartLabel,
          value: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
          unit: sensor.unit,
        };
      }),
    [characteristicValues],
  );

  const selectedSensor =
    selectedKey === 'all'
      ? null
      : analysis.sensors.find(s => s.key === selectedKey) ?? null;

  const chartLines: ChartLine[] = selectedSensor
    ? [
        {
          key: selectedSensor.key,
          color: selectedSensor.color,
          values: selectedSensor.series,
        },
      ]
    : analysis.sensors.map(s => ({
        key: s.key,
        color: s.color,
        values: s.series,
      }));

  const windowSize = Math.max(history.length, 30);
  const hasHistory = history.length >= 2;
  const hasGasData = analysis.sensors.some(s => s.current !== null);

  const graphSummary = selectedSensor
    ? `Line graph of ${
        selectedSensor.label
      } signal level over the last ${agoLabel(
        (windowSize - 1) * (SAMPLE_MS / 1000),
      )}.`
    : `Line graph comparing all gas channels over the last ${agoLabel(
        (windowSize - 1) * (SAMPLE_MS / 1000),
      )}.`;

  /* ---------------- actions ---------------- */

  const handleStopWalk = async () => {
    try {
      const completedWalkId = await stopSmellWalk();

      if (!completedWalkId) {
        return;
      }

      try {
        const savedPath = await exportSmellWalkZip(completedWalkId);
        Alert.alert('Walk saved', `Export saved to:\n${savedPath}`);
      } catch (exportError) {
        console.error('Smell walk export failed:', exportError);
        Alert.alert(
          'Walk stopped',
          'The walk was saved, but the export could not be shared.',
        );
      }
    } catch (error) {
      console.error('Could not stop smell walk:', error);
      Alert.alert('Could not stop walk', describeError(error));
    }
  };

  const confirmStopWalk = () => {
    Alert.alert('End this walk?', 'Recording stops and the walk is saved.', [
      { text: 'Keep walking', style: 'cancel' },
      { text: 'End walk', style: 'destructive', onPress: handleStopWalk },
    ]);
  };

  const requireConnectedDevice = async () => {
    if (__DEV__) {
      return true;
    }

    const connected =
      connectedDevice !== null &&
      (await connectedDevice.isConnected().catch(() => false));
    if (!connected) {
      Alert.alert('e-nose not connected', 'Connect to the e-nose first.');
    }
    setIsConnected(connected);
    return connected;
  };

  const handleStartWalk = async () => {
    if (!(await requireConnectedDevice())) {
      return;
    }

    const locationAccess = await ensureFullLocationAccess();
    if (!locationAccess.granted) {
      Alert.alert(
        'Full GPS access required',
        locationAccessMessage(locationAccess),
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              openLocationSettings().catch(error =>
                console.error('Could not open location settings:', error),
              );
            },
          },
        ],
      );
      return;
    }

    try {
      await startSmellWalk();
    } catch (error) {
      Alert.alert('Could not start walk', String(error));
    }
  };

  const handleFingerprint = async () => {
    if (await requireConnectedDevice()) {
      setShowFingerprintModal(true);
    }
  };

  const goToDeviceScreen = () => {
    setShowConnectionModal(false);
    navigation.navigate('Device');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.mapPanel}>
        {mapVisible && <LiveLocationMap coordinates={location} trail={trail} />}

        <View style={styles.topLeft}>
          <InlineRadar
            sensors={analysis.sensors}
            hasData={hasGasData}
            onPress={() => setShowSensorSheet(true)}
          />
        </View>

        <View style={styles.bottomRight}>
          <RoundAction
            tone="light"
            muted={!isConnected}
            label={isConnected ? 'Fingerprint' : 'Connect first'}
            accessibilityLabel="Save fingerprint"
            accessibilityHint={
              isConnected
                ? 'Captures and saves the current sensor readings'
                : 'The e-nose is not connected. Opens the device screen'
            }
            onPress={isConnected ? handleFingerprint : goToDeviceScreen}
            icon={
              <FingerprintPattern
                color={COLORS.green}
                size={28}
                strokeWidth={2}
              />
            }
          />

          <RoundAction
            tone={isSmellWalkActive ? 'danger' : 'primary'}
            muted={!isSmellWalkActive && !isConnected}
            label={
              isSmellWalkActive
                ? 'End walk'
                : isConnected
                ? 'Start walk'
                : 'Connect first'
            }
            accessibilityLabel={isSmellWalkActive ? 'End walk' : 'Start walk'}
            accessibilityHint={
              isSmellWalkActive
                ? 'Asks to confirm, then stops recording and saves the walk'
                : isConnected
                ? 'Begins recording sensor data and your GPS trail'
                : 'The e-nose is not connected. Opens the device screen'
            }
            onPress={
              isSmellWalkActive
                ? confirmStopWalk
                : isConnected
                ? handleStartWalk
                : goToDeviceScreen
            }
            icon={
              isSmellWalkActive ? (
                <CircleStop color="#fff" size={30} strokeWidth={2.25} />
              ) : (
                <Play color="#fff" size={28} strokeWidth={2.25} />
              )
            }
          />
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHandle} />

        <Pressable
          onPress={() => setPanelOpen(o => !o)}
          style={styles.panelHeader}
          accessibilityRole="button"
          accessibilityLabel={panelOpen ? 'Collapse panel' : 'Expand panel'}>
          <View style={styles.panelHeaderText}>
            <Text style={styles.panelTitle} accessibilityRole="header">
              Sensor readings over time
            </Text>
          </View>
          {panelOpen ? (
            <ChevronDownIcon color={COLORS.muted} />
          ) : (
            <ChevronUpIcon color={COLORS.muted} />
          )}
        </Pressable>

        {panelOpen && (
          <ScrollView
            style={styles.panelBody}
            contentContainerStyle={styles.panelBodyContent}
            showsVerticalScrollIndicator={false}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {[
                { key: 'all', label: 'All channels', color: null },
                ...analysis.sensors.map(s => ({
                  key: s.key,
                  label: s.label,
                  color: s.color,
                })),
              ].map(c => {
                const active = c.key === selectedKey;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setSelectedKey(c.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Show ${c.label}`}
                    style={[styles.chip, active && styles.chipActive]}>
                    {c.color ? <Dot color={c.color} size={8} /> : null}
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {hasHistory ? (
              <LineGraph
                lines={chartLines}
                windowSize={windowSize}
                filled={!!selectedSensor}
                summary={graphSummary}
              />
            ) : (
              <View style={styles.graphEmpty}>
                <WaitIcon size={22} color={COLORS.muted} />
                <Text style={styles.bodyMuted}>
                  {isConnected
                    ? 'Graph starts after a few readings.'
                    : 'Connect the e-nose to see live readings.'}
                </Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {selectedSensor ? 'Readings' : 'Gas channels'}
              </Text>
              <View>
                {selectedSensor ? (
                  <>
                    <DataRow
                      first
                      label="Now"
                      value={fmtWithUnit(
                        selectedSensor.current,
                        selectedSensor.unit,
                      )}
                    />
                    <DataRow
                      label="Peak"
                      value={fmtWithUnit(
                        selectedSensor.peak,
                        selectedSensor.unit,
                      )}
                    />
                    <DataRow
                      label="Average"
                      value={fmtWithUnit(
                        selectedSensor.avg,
                        selectedSensor.unit,
                      )}
                    />
                  </>
                ) : (
                  analysis.sensors.map((s, i) => (
                    <DataRow
                      key={s.key}
                      first={i === 0}
                      swatch={s.color}
                      label={s.label}
                      value={fmtWithUnit(s.current, s.unit)}
                      extra={
                        analysis.ready && s.levelWord ? (
                          <Text
                            style={[
                              styles.dataLevel,
                              levelStyles(s.levelWord).text,
                            ]}>
                            {s.levelWord} {trendArrow(s.trend)}
                          </Text>
                        ) : null
                      }
                    />
                  ))
                )}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Environment
              </Text>
              <View>
                {envReadings.map((r, i) => (
                  <DataRow
                    key={r.key}
                    first={i === 0}
                    label={r.label}
                    value={fmtWithUnit(r.value, r.unit, 1)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      <SensorSheet
        visible={showSensorSheet}
        onClose={() => setShowSensorSheet(false)}
        sensors={analysis.sensors}
        ready={analysis.ready}
      />

      <FingerprintModal
        visible={showFingerprintModal}
        onClose={() => setShowFingerprintModal(false)}
        walkId={walkId}
      />

      <Modal
        visible={!__DEV__ && showConnectionModal}
        transparent
        animationType="fade"
        onRequestClose={goToDeviceScreen}>
        <View style={styles.connectionModalBackdrop}>
          <View style={styles.connectionModalCard}>
            <View style={styles.connectionModalHeader}>
              <Text style={styles.connectionModalTitle}>
                Connect your e-nose
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close connection prompt"
                style={styles.iconButton}
                onPress={() => setShowConnectionModal(false)}>
                <X color={COLORS.ink} size={22} strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={styles.connectionModalText}>
              Connect to the e-nose before starting a walk or taking a
              fingerprint.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.connectionModalButton,
                pressed && styles.pressed,
              ]}
              onPress={goToDeviceScreen}>
              <Text style={styles.connectionModalButtonText}>Devices</Text>
              <ArrowRight color="#fff" size={20} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  pressed: { opacity: 0.7 },

  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: COLORS.muted },
  textMuted: { color: COLORS.muted },

  toneLowBg: { backgroundColor: COLORS.greenTint },
  toneMediumBg: { backgroundColor: COLORS.amberTint },
  toneHighBg: { backgroundColor: COLORS.redTint },
  toneLowText: { color: COLORS.green },
  toneMediumText: { color: COLORS.amber },
  toneHighText: { color: COLORS.red },
  toneLowBar: { backgroundColor: COLORS.green },
  toneMediumBar: { backgroundColor: COLORS.amber },
  toneHighBar: { backgroundColor: COLORS.red },

  mapPanel: { flex: 1, position: 'relative' },

  topLeft: {
    position: 'absolute',
    top: 12,
    left: 12,
  },

  inlineRadarWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    paddingBottom: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  inlineRadarEmpty: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  bottomRight: {
    position: 'absolute',
    right: 12,
    bottom: 28,
    gap: 12,
  },

  roundActionWrap: {
    alignItems: 'center',
    gap: 6,
  },

  roundAction: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },

  roundActionPrimary: { backgroundColor: COLORS.green },
  roundActionDanger: { backgroundColor: COLORS.red },
  roundActionLight: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roundActionMuted: { opacity: 0.55 },

  roundActionLabelChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  roundActionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.ink,
  },

  panel: {
    maxHeight: SCREEN_HEIGHT * 0.55,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },

  panelHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d6d8d2',
  },

  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },

  panelHeaderText: { flex: 1, gap: 2 },

  panelTitle: { fontSize: 18, fontWeight: '600', color: COLORS.ink },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 48,
    marginHorizontal: 20,
    paddingBottom: 16,
  },

  summaryText: { flex: 1, gap: 2 },

  summaryName: { fontSize: 16, fontWeight: '500', color: COLORS.ink },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },

  pillText: { fontSize: 14, fontWeight: '500' },

  panelBody: { flexGrow: 0 },

  panelBodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 28,
  },

  chips: { gap: 8, paddingRight: 20 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },

  chipActive: { backgroundColor: COLORS.greenTint, borderColor: COLORS.green },

  chipText: { fontSize: 14, color: COLORS.ink },

  chipTextActive: { fontWeight: '500', color: COLORS.green },

  graph: {
    width: '100%',
    height: GRAPH_HEIGHT,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    overflow: 'hidden',
  },

  axisLabel: {
    position: 'absolute',
    left: 10,
    fontSize: 12,
    color: COLORS.muted,
  },
  axisTop: { top: 2 },
  axisBottom: { bottom: 2 },

  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  graphEmpty: {
    height: GRAPH_HEIGHT,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },

  section: { gap: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },

  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 52,
    paddingVertical: 12,
  },

  dataRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },

  dataRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  dataRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  dataLabel: { flexShrink: 1, fontSize: 15, color: COLORS.ink },

  dataValue: { fontSize: 15, fontWeight: '600', color: COLORS.ink },

  dataLevel: { fontSize: 13 },

  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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

  radarCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    alignItems: 'center',
  },

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

  levelBadge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  levelBadgeOff: { backgroundColor: COLORS.bg },

  levelBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },

  levelBar: { width: 4, borderRadius: 1 },
  levelBar1: { height: 8 },
  levelBar2: { height: 11 },
  levelBar3: { height: 14 },
  levelBarOff: { backgroundColor: 'rgba(0,0,0,0.14)' },

  levelBadgeText: { fontSize: 13, fontWeight: '500' },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 40 },

  emptyTitle: { fontSize: 16, fontWeight: '500', color: COLORS.ink },

  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  connectionModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(20,22,20,0.5)',
  },

  connectionModalCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    paddingTop: 16,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
  },

  connectionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  connectionModalTitle: { fontSize: 18, fontWeight: '600', color: COLORS.ink },

  connectionModalText: {
    marginTop: 6,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
  },

  connectionModalButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    alignItems: 'center',
    marginTop: 20,
    height: 52,
    borderRadius: 999,
    backgroundColor: COLORS.green,
  },

  connectionModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});

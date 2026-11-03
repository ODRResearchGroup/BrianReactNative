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
import { useBLE } from '../../BLEUniversal';
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
  ChevronDownIcon,
  ChevronUpIcon,
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
import {
  COLORS,
  GRAPH_HEIGHT,
  SAMPLE_MS,
  MAX_POINTS,
  MIN_POINTS_FOR_LEVELS,
} from './consts';
import WaitIcon from './components/icons/WaitIcon';
import { ChartLine, Point, SensorAnalysis } from './types';
import {
  agoLabel,
  trendArrow,
  normalise,
  channelColor,
  levelWord,
  trendOf,
  describeError,
  fmtWithUnit,
  levelStyles,
} from './utils';
import DataRow from './components/DataRow';
import InlineRadar from './components/InlineRadar';
import LineGraph from './components/LineGraph';
import RoundAction from './components/RoundAction';
import SensorSheet from './components/SensorSheet';
import Dot from './components/icons/Dot';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
          setIsConnected(connected || __DEV__);
          setShowConnectionModal(!connected && !__DEV__);
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
    const connected =
      connectedDevice !== null &&
      (await connectedDevice.isConnected().catch(() => false));
    if (!connected && !__DEV__) {
      Alert.alert(
        'BRIAN e-Nose not connected',
        'Connect to the BRIAN e-Nose first.',
      );
    }
    setIsConnected(connected || __DEV__);
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
    if ((await requireConnectedDevice()) || __DEV__) {
      setShowFingerprintModal(true);
    }
  };

  const goToDeviceScreen = () => {
    setShowConnectionModal(false && !__DEV__);
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
            onPress={() => {
              if (!isConnected && !__DEV__) {
                setShowConnectionModal(true);
              } else {
                setShowSensorSheet(true);
              }
            }}
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
                : 'BRIAN e-Nose is not connected. Opens the device screen'
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
                : 'BRIAN e-Nose is not connected. Opens the device screen'
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
                    : 'Connect BRIAN e-Nose to see live readings.'}
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
        screenWidth={SCREEN_WIDTH}
      />

      <FingerprintModal
        visible={showFingerprintModal}
        onClose={() => setShowFingerprintModal(false)}
        walkId={walkId}
      />

      <Modal
        visible={showConnectionModal}
        transparent
        animationType="fade"
        onRequestClose={goToDeviceScreen}>
        <View style={styles.connectionModalBackdrop}>
          <View style={styles.connectionModalCard}>
            <View style={styles.connectionModalHeader}>
              <Text style={styles.connectionModalTitle}>
                Connect your e-Nose
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close connection prompt"
                style={styles.iconButton}
                onPress={() => setShowConnectionModal(false && !__DEV__)}>
                <X color={COLORS.ink} size={22} strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={styles.connectionModalText}>
              Connect to the e-Nose before starting a walk or taking a
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

  bottomRight: {
    position: 'absolute',
    right: 12,
    bottom: 28,
    gap: 12,
  },

  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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

  dataLevel: { fontSize: 13 },

  section: { gap: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },

  graphEmpty: {
    height: GRAPH_HEIGHT,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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

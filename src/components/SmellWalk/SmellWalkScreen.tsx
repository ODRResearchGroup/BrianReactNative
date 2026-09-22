import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import KeepAwake from 'react-native-keep-awake';
import { useBLE } from '../../BLEUniversal';
import CustomRadarChart from '../common/CustomRadarChart';
import FingerprintModal from '../common/FingerprintModal';
import LiveLocationMap from '../common/LiveLocationMap';
import { useInfluxDB } from '../../services/influx/InfluxDBService';
import { exportSmellWalkCsv } from '../../services/sync/exportService';
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
import { ENV_SENSOR_DEFINITIONS, GAS_SENSOR_DEFINITIONS } from '../../sensors';

type SensorValue = { label: string; value: number };

const mockSensorValues: SensorValue[] = GAS_SENSOR_DEFINITIONS.map(sensor => ({
  label: sensor.chartLabel,
  value: 0.5,
}));

export default function SmellWalkScreen() {
  const { characteristicValues, connectedDevice } = useBLE();
  const { location, trail, isSmellWalkActive, startSmellWalk, stopSmellWalk } =
    useInfluxDB();
  const navigation = useNavigation<NavigationProp<{ Device: undefined }>>();
  const [mapVisible, setMapVisible] = useState(false);
  const [isConnected, setIsConnected] = useState(__DEV__);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showFingerprintModal, setShowFingerprintModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0.1);

  useEffect(() => {
    if (!isSmellWalkActive) {
      return;
    }
    KeepAwake.activate();
    return () => {
      KeepAwake.deactivate();
    };
  }, [isSmellWalkActive]);

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

  const sensorValues = useMemo<SensorValue[]>(() => {
    if (__DEV__ && Object.keys(characteristicValues).length === 0) {
      return mockSensorValues;
    }

    return GAS_SENSOR_DEFINITIONS.map(sensor => ({
      label: sensor.chartLabel,
      value: characteristicValues[sensor.key] ?? 0,
    }));
  }, [characteristicValues]);
  const environmentalValues = useMemo(
    () =>
      ENV_SENSOR_DEFINITIONS.map(sensor => ({
        key: sensor.key,
        label: sensor.label,
        value: characteristicValues[sensor.key],
        unit: sensor.unit,
      })),
    [characteristicValues],
  );

  const radarData = useMemo(
    () => [
      {
        key: 'live-data',
        title: 'Live Reading',
        values: sensorValues.map(sensor => ({
          x: sensor.label,
          y: sensor.value,
        })),
        color: {
          fill: 'hsla(210, 100%, 50%, 0.35)',
          stroke: 'hsla(210, 100%, 40%, 1)',
        },
      },
    ],
    [sensorValues],
  );

  const handleStopWalk = async () => {
    try {
      const completedWalkId = await stopSmellWalk();
      if (completedWalkId) {
        const savedPath = await exportSmellWalkCsv(completedWalkId);
        Alert.alert('Smell walk saved', `CSV saved to:\n${savedPath}`);
      }
    } catch (error) {
      Alert.alert('Could not save smell walk', String(error));
    }
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
    if (await requireConnectedDevice()) {
      startSmellWalk();
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
        {!location && (
          <View style={styles.mapBadge}>
            <Text style={styles.mapBadgeText}>Waiting for GPS</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Smell Walk</Text>
            <Text style={styles.status}>
              {isSmellWalkActive
                ? 'Recording data every 5 seconds'
                : 'Ready to record'}
            </Text>
            {isSmellWalkActive && (
              <View
                accessibilityRole="text"
                accessibilityLabel="Recording in progress"
                style={styles.recordingBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingBadgeText}>Recording</Text>
              </View>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isSmellWalkActive ? 'End smell walk' : 'Start smell walk'
            }
            accessibilityHint={
              isSmellWalkActive
                ? 'Stops recording and sends the final sample'
                : 'Begins recording sensor data and your GPS trail'
            }
            accessibilityState={{
              disabled: !isSmellWalkActive && !isConnected,
            }}
            onPress={
              isSmellWalkActive
                ? handleStopWalk
                : isConnected
                ? handleStartWalk
                : goToDeviceScreen
            }
            style={({ pressed }) => [
              styles.walkButton,
              isSmellWalkActive && styles.endButton,
              !isSmellWalkActive && !isConnected && styles.disabledButton,
              pressed && styles.buttonPressed,
            ]}>
            {isSmellWalkActive ? (
              <CircleStop color="#fff" size={21} strokeWidth={2.5} />
            ) : (
              <Play color="#fff" size={21} strokeWidth={2.5} />
            )}
            <Text style={styles.buttonText}>
              {isSmellWalkActive ? 'End walk' : 'Start walk'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.plotCard}>
          <CustomRadarChart
            data={radarData}
            size={300}
            maxValue={1}
            zoomLevel={zoomLevel}
            gridLevels={5}
          />
          <Slider
            style={styles.slider}
            minimumValue={0.001}
            maximumValue={1}
            step={0.001}
            value={zoomLevel}
            onValueChange={setZoomLevel}
          />
        </View>
        <View style={styles.envCard}>
          <Text style={styles.sectionTitle}>Environmental</Text>
          {environmentalValues.map(sensor => (
            <View key={sensor.key} style={styles.envRow}>
              <Text style={styles.envLabel}>{sensor.label}</Text>
              <Text style={styles.envValue}>
                {sensor.value == null ? '—' : sensor.value.toFixed(2)}{' '}
                {sensor.unit}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create fingerprint"
            accessibilityHint="Opens the fingerprint annotation form"
            accessibilityState={{ disabled: !isConnected }}
            style={({ pressed }) => [
              styles.actionButton,
              styles.annotationButton,
              !isConnected && styles.disabledButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={isConnected ? handleFingerprint : goToDeviceScreen}>
            <FingerprintPattern color="#fff" size={20} strokeWidth={2.25} />
            <Text style={styles.buttonText}>Fingerprint</Text>
          </Pressable>
        </View>
      </View>

      <FingerprintModal
        visible={showFingerprintModal}
        onClose={() => setShowFingerprintModal(false)}
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
                style={styles.connectionModalClose}
                onPress={() => setShowConnectionModal(false)}>
                <X color="#555" size={22} strokeWidth={2.5} />
              </Pressable>
            </View>
            <Text style={styles.connectionModalText}>
              Connect to the e-nose before starting a walk or taking a
              fingerprint.
            </Text>
            <Pressable
              style={styles.connectionModalButton}
              onPress={goToDeviceScreen}>
              <Text style={styles.buttonText}>Devices</Text>
              <ArrowRight color="#fff" size={20} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  mapPanel: { flex: 1, position: 'relative' },
  mapBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  mapBadgeText: { fontSize: 12, color: '#333 ', fontWeight: '600' },
  content: { padding: 18, paddingBottom: 28 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  status: { fontSize: 13, color: '#666', marginTop: 4 },
  recordingBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dc2626',
  },
  recordingBadgeText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '700',
  },
  actions: { gap: 10, marginTop: 16 },
  walkButton: {
    minWidth: 135,
    height: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    borderRadius: 24,
  },
  buttonPressed: { opacity: 0.65, transform: [{ scale: 0.94 }] },
  actionButton: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 13,
  },
  endButton: { backgroundColor: '#b42318' },
  annotationButton: { backgroundColor: '#2563eb' },
  disabledButton: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  connectionModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  connectionModalCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  connectionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectionModalClose: {
    padding: 4,
  },
  connectionModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  connectionModalText: { marginTop: 10, color: '#555', lineHeight: 20 },
  connectionModalButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginTop: 22,
  },
  plotCard: {
    marginTop: 10,
    alignItems: 'center',
  },
  envCard: {
    marginTop: 12,
    gap: 8,
  },
  envRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  envLabel: { fontSize: 13, color: '#555' },
  envValue: { fontSize: 13, color: '#111', fontWeight: '600' },
  slider: { width: '100%', height: 36 },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  sensorCell: {
    width: '23%',
    minWidth: 72,
    backgroundColor: '#f1f3f5',
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: 'center',
  },
  sensorLabel: { fontSize: 11, color: '#555', fontWeight: '600' },
  sensorValue: { fontSize: 11, color: '#111', marginTop: 2 },
  locationText: { fontSize: 12, color: '#666', marginTop: 16 },
});

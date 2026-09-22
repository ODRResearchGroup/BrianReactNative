import React, {
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
  Dimensions,
  Modal,
} from 'react-native';
import {
  NavigationProp,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { useBLE } from '../../BLEUniversal';
import Slider from '@react-native-community/slider';
import CustomRadarChart from '../common/CustomRadarChart';
import FingerprintModal from '../common/FingerprintModal';
import TimedProgressBar from './components/TimeBar';
import { SensorReadings } from '../../types/fingerprintTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SensorEvent, emitter } from '../../types/events';
import { Alert } from 'react-native';
import Svg, { Path, Line, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');

// Mini plotter config
const PLOT_HISTORY_SIZE = 30; // 30 seconds
const PLOT_WIDTH = width - 80;
const PLOT_HEIGHT = 150;

type SensorKey =
  | 'CH4'
  | 'NH3'
  | 'HCHO'
  | 'VOC'
  | 'Odour'
  | 'H2S'
  | 'Etoh'
  | 'NO2';

interface PlotPoint {
  time: number;
  value: number;
}

export default function LiveData() {
  const { characteristicValues, connectedDevice } = useBLE();
  const navigation = useNavigation<NavigationProp<{ Device: undefined }>>();
  const [isConnected, setIsConnected] = useState(__DEV__);

  const methane = characteristicValues.Methane || 0;
  const ammonia = characteristicValues.Ammonia || 0;
  const formaldehyde = characteristicValues.Formaldehyde || 0;
  const voc = characteristicValues['Voletile Organic Compounds'] || 0;
  const odour = characteristicValues.Odor || 0;
  const hydrogenSulfide = characteristicValues['Hydrogen Sulfide'] || 0;
  const ethanol = characteristicValues.Ethanol || 0;
  const nitrogenDioxide = characteristicValues['Nitrogen Dioxide'] || 0;

  const [showFingerprintModal, setShowFingerprintModal] = useState(false);
  const [showTimeBar, setShowTimeBar] = useState(false);
  const [samplingMode, setSamplingMode] = useState<'idle' | 'fingerprint'>(
    'idle',
  );
  const samplingRef = useRef<{
    intervalId: number | null;
    samples: SensorReadings[];
  }>({
    intervalId: null,
    samples: [],
  });
  const [zoomLevel, setZoomLevel] = useState(0.1);

  // Mini plotter state
  const [selectedSensor, setSelectedSensor] = useState<SensorKey | null>(null);
  const [plotHistory, setPlotHistory] = useState<
    Record<SensorKey, PlotPoint[]>
  >({
    CH4: [],
    NH3: [],
    HCHO: [],
    VOC: [],
    Odour: [],
    H2S: [],
    Etoh: [],
    NO2: [],
  });
  const startTimeRef = useRef<number>(Date.now());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const checkConnection = async () => {
        const connected =
          connectedDevice !== null &&
          (await connectedDevice.isConnected().catch(() => false));
        if (active) {
          setIsConnected(__DEV__ || connected);
        }
      };

      checkConnection().catch(() => {
        if (active) {
          setIsConnected(__DEV__);
        }
      });

      return () => {
        active = false;
      };
    }, [connectedDevice]),
  );

  const currentValues = useMemo<Record<SensorKey, number>>(
    () => ({
      CH4: methane,
      NH3: ammonia,
      HCHO: formaldehyde,
      VOC: voc,
      Odour: odour,
      H2S: hydrogenSulfide,
      Etoh: ethanol,
      NO2: nitrogenDioxide,
    }),
    [
      methane,
      ammonia,
      formaldehyde,
      voc,
      odour,
      hydrogenSulfide,
      ethanol,
      nitrogenDioxide,
    ],
  );

  // Update plot history
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
        // Keep last PLOT_HISTORY_SIZE points
        updated[key] = points.slice(-PLOT_HISTORY_SIZE);
      });

      return updated;
    });
  }, [currentValues]);

  const radarData = useMemo(
    () =>
      [
        { label: 'Ch4', key: 'CH4' as SensorKey, value: methane },
        { label: 'NH3', key: 'NH3' as SensorKey, value: ammonia },
        { label: 'HCHO', key: 'HCHO' as SensorKey, value: formaldehyde },
        { label: 'VOC', key: 'VOC' as SensorKey, value: voc },
        { label: 'Odour', key: 'Odour' as SensorKey, value: odour },
        { label: 'H2S', key: 'H2S' as SensorKey, value: hydrogenSulfide },
        { label: 'Etoh', key: 'Etoh' as SensorKey, value: ethanol },
        { label: 'No2', key: 'NO2' as SensorKey, value: nitrogenDioxide },
      ].filter(item => !isNaN(item.value)),
    [
      methane,
      ammonia,
      formaldehyde,
      voc,
      odour,
      hydrogenSulfide,
      ethanol,
      nitrogenDioxide,
    ],
  );

  const chartData = [
    {
      key: 'live-data',
      title: 'Live Reading',
      values: radarData.map(d => ({ x: d.label, y: d.value })),
      color: {
        fill: 'hsla(210, 100%, 50%, 0.35)',
        stroke: 'hsla(210, 100%, 40%, 1)',
      },
    },
  ];

  const getCurrentReadings = (): SensorReadings => ({
    CH4: methane,
    NH3: ammonia,
    HCHO: formaldehyde,
    VOC: voc,
    Odour: odour,
    H2S: hydrogenSulfide,
    Etoh: ethanol,
    NO2: nitrogenDioxide,
  });

  const startSampling = (
    mode: 'fingerprint',
    durationMs: number,
    sampleCount: number,
  ) => {
    samplingRef.current.samples = [];
    setSamplingMode(mode);
    const intervalMs = Math.max(1000, Math.floor(durationMs / sampleCount));

    const takeSample = () => {
      const sensorReadings: SensorReadings = getCurrentReadings();
      samplingRef.current.samples.push(sensorReadings);
    };

    takeSample();
    const id = setInterval(takeSample, intervalMs) as unknown as number;
    samplingRef.current.intervalId = id;
  };

  const handleFingerprint = async () => {
    const connected =
      __DEV__ ||
      (connectedDevice !== null &&
        (await connectedDevice.isConnected().catch(() => false)));
    if (!connected) {
      setIsConnected(false);
      Alert.alert('e-nose not connected', 'Connect to the e-nose first.');
      return;
    }

    setShowTimeBar(true);
    startSampling('fingerprint', 15000, 15);
  };

  const goToDeviceScreen = () => navigation.navigate('Device');

  const stopSamplingAndAverage = (): SensorReadings | null => {
    const id = samplingRef.current.intervalId;
    if (id) {
      clearInterval(id as any);
      samplingRef.current.intervalId = null;
    }

    const samples = samplingRef.current.samples;
    if (!samples || samples.length === 0) {
      return null;
    }

    const sum = samples.reduce(
      (accumulated, sample) => ({
        CH4: accumulated.CH4 + sample.CH4,
        NH3: accumulated.NH3 + sample.NH3,
        HCHO: accumulated.HCHO + sample.HCHO,
        VOC: accumulated.VOC + sample.VOC,
        Odour: accumulated.Odour + sample.Odour,
        H2S: accumulated.H2S + sample.H2S,
        Etoh: accumulated.Etoh + sample.Etoh,
        NO2: accumulated.NO2 + sample.NO2,
      }),
      { CH4: 0, NH3: 0, HCHO: 0, VOC: 0, Odour: 0, H2S: 0, Etoh: 0, NO2: 0 },
    );

    const avg: SensorReadings = {
      CH4: sum.CH4 / samples.length,
      NH3: sum.NH3 / samples.length,
      HCHO: sum.HCHO / samples.length,
      VOC: sum.VOC / samples.length,
      Odour: sum.Odour / samples.length,
      H2S: sum.H2S / samples.length,
      Etoh: sum.Etoh / samples.length,
      NO2: sum.NO2 / samples.length,
    };

    samplingRef.current.samples = [];
    setSamplingMode('idle');
    return avg;
  };

  const handleFingerprintComplete = () => {
    const avg = stopSamplingAndAverage();
    setShowTimeBar(false);

    if (samplingMode === 'fingerprint' && avg) {
      const fingerprint: SensorEvent = {
        type: 'sensor_reading',
        timestamp: new Date(),
        source: 'BLE Device',
        olfactoryData: {
          readings: avg,
          units: {
            CH4: 'V',
            NH3: 'V',
            HCHO: 'V',
            VOC: 'V',
            Odour: 'V',
            H2S: 'V',
            Etoh: 'V',
            NO2: 'V',
          },
        },
      } as any;

      const savedData = {
        fingerprint,
        location: null,
        fingerprintTitle: { title: 'Untitled' },
        humanDescription: { description: '' },
        photoPath: undefined,
        deltaReadings: undefined,
        timestamp: new Date().toISOString(),
      };

      const key = `sensor_fingerprint_${Date.now()}`;
      AsyncStorage.setItem(key, JSON.stringify(savedData))
        .then(() => {
          emitter.emit('sensor_reading', fingerprint);
          Alert.alert('Saved', 'Fingerprint saved');
          setShowFingerprintModal(true);
        })
        .catch(err => {
          console.error('Failed to save fingerprint', err);
          Alert.alert('Save failed', String(err));
        });
    }
  };

  // Generate mini plot path with DYNAMIC scale per sensor + 20% headroom
  const generateMiniPlot = (sensorKey: SensorKey): string => {
    const points = plotHistory[sensorKey];
    if (points.length < 2) {
      return '';
    }

    // Find min/max for THIS sensor's history
    const values = points.map(p => p.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const dataRange = dataMax - dataMin;

    // Add 20% breathing room (10% on top, 10% on bottom)
    const padding = dataRange * 0.1;
    const Y_MIN = Math.max(0, dataMin - padding);
    const Y_MAX = dataMax + padding;
    const range = Y_MAX - Y_MIN || 0.001; // Avoid division by zero

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
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FingerprintModal
          visible={showFingerprintModal}
          onClose={() => {
            setShowFingerprintModal(false);
          }}
        />

        <TimedProgressBar
          visible={showTimeBar}
          onClose={() => setShowTimeBar(false)}
          duration={15000}
          onComplete={handleFingerprintComplete}
        />

        <View style={styles.liveDataSection}>
          <Text style={styles.title}>Live Data</Text>

          {/* Radar Chart */}
          <CustomRadarChart
            data={chartData}
            size={320}
            maxValue={1}
            zoomLevel={zoomLevel}
            gridLevels={5}
          />

          {/* Zoom Slider */}
          <Slider
            style={styles.slider}
            minimumValue={0.001}
            maximumValue={1}
            step={0.001}
            value={zoomLevel}
            onValueChange={setZoomLevel}
          />

          {/* Fingerprint Button */}
          <Pressable
            style={[
              styles.analyseButton,
              !isConnected && styles.disabledButton,
            ]}
            accessibilityState={{ disabled: !isConnected }}
            onPress={isConnected ? handleFingerprint : goToDeviceScreen}>
            <Text style={styles.analyseButtonText}>Fingerprint</Text>
          </Pressable>

          {/* Sensor Grid - Now clickable */}
          <View style={styles.sensorGrid}>
            {radarData.map(item => (
              <Pressable
                key={item.label}
                style={styles.sensorCell}
                onPress={() => setSelectedSensor(item.key)}>
                <Text style={styles.sensorLabel}>{item.label}</Text>
                <Text style={styles.sensorValue}>{item.value.toFixed(4)}</Text>
                <Text style={styles.tapHint}>Tap for plot</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Mini Plotter Modal */}
        {selectedSensor && (
          <Modal
            visible={true}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setSelectedSensor(null)}>
            <View style={styles.modalOverlay}>
              <View style={styles.plotterModal}>
                <View style={styles.plotterHeader}>
                  <Text style={styles.plotterTitle}>
                    {selectedSensor} - Last 30s
                  </Text>
                  <Pressable onPress={() => setSelectedSensor(null)}>
                    <Text style={styles.closeButton}>✕</Text>
                  </Pressable>
                </View>

                <View style={styles.plotContainer}>
                  <Svg width={PLOT_WIDTH} height={PLOT_HEIGHT}>
                    <Rect
                      x={0}
                      y={0}
                      width={PLOT_WIDTH}
                      height={PLOT_HEIGHT}
                      fill="#FAFAFA"
                    />

                    {/* Simple grid - no labels */}
                    {[0, 0.5, 1].map((fraction, i) => (
                      <Line
                        key={`grid-${i}`}
                        x1={0}
                        y1={PLOT_HEIGHT - fraction * (PLOT_HEIGHT - 20)}
                        x2={PLOT_WIDTH}
                        y2={PLOT_HEIGHT - fraction * (PLOT_HEIGHT - 20)}
                        stroke="#E0E0E0"
                        strokeWidth="1"
                        strokeDasharray={fraction === 0.5 ? '4,4' : '0'}
                      />
                    ))}

                    {/* Plot line */}
                    <Path
                      d={generateMiniPlot(selectedSensor)}
                      stroke="#2196F3"
                      strokeWidth="2.5"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>

                <View style={styles.plotInfo}>
                  <Text style={styles.plotInfoText}>
                    Current: {currentValues[selectedSensor].toFixed(4)}
                  </Text>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: '#fff',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
  },
  liveDataSection: {
    marginTop: 30,
    alignItems: 'center',
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#000',
  },
  slider: {
    width: '80%',
    height: 40,
    marginTop: 16,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginBottom: 16,
  },
  sensorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
    justifyContent: 'center',
    maxWidth: width - 40,
  },
  sensorCell: {
    width: (width - 60) / 2,
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  sensorValue: {
    fontSize: 13,
    color: '#000',
    fontWeight: '600',
    marginBottom: 4,
  },
  tapHint: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  analyseButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#000',
    marginVertical: 12,
  },
  disabledButton: {
    opacity: 0.45,
  },
  analyseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plotterModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: width - 40,
    maxHeight: '80%',
  },
  plotterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  plotterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  plotContainer: {
    marginBottom: 16,
  },
  plotInfo: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  plotInfoText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
});

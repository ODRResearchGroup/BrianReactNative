import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import CustomRadarChart from './CustomRadarChart';
import Slider from '@react-native-community/slider';

const { width } = Dimensions.get('window');
const SENSOR_ORDER = [
  'CH4',
  'NH3',
  'HCHO',
  'VOC',
  'Odour',
  'H2S',
  'Etoh',
  'NO2',
];
const SENSOR_LABELS = [
  'Ch4',
  'NH3',
  'HCHO',
  'VOC',
  'Odour',
  'H2S',
  'Etoh',
  'No2',
];
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { useBLE } from '../../BLEUniversal';
import { DocumentDirectoryPath, copyFile } from 'react-native-fs';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import useLiveLocation from '../../hooks/useLiveLocation';
import { SensorEvent, emitter } from '../../types/events';
import type { SensorReadings } from '../../types/fingerprintTypes';
import CameraModal from './CameraCapture';
import { insertSensorRecord, insertCapture } from '../../services/database/db';
import { enqueueSync } from '../../services/database/db';
import { uploadsPrepare } from '../../services/audio/uploadsPrepare';
import {
  uploadAudioToAzure,
  uploadAudioTrackJsonToAzure,
} from '../../services/audio/audioUpload';
import { notifyUploadComplete } from '../../services/audio/uploadComplete';
import { fetchProcessedStatus } from '../../services/audio/processedStatus';
import {
  fetchProcessedTranscript,
  transcriptToPlainText,
} from '../../services/audio/processedTranscript';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
type MicPhase = 'idle' | 'recording' | 'uploading' | 'processing' | 'error';

const MIC_LABEL: Record<MicPhase, string> = {
  idle: '',
  recording: 'Recording…',
  uploading: 'Uploading…',
  processing: 'Transcribing…',
  error: 'Failed — tap to retry',
};

interface FingerprintModalProps {
  visible: boolean;
  onClose: () => void;
}

const developmentReadings: SensorReadings = {
  CH4: 0.62,
  NH3: 0.38,
  HCHO: 0.76,
  VOC: 0.54,
  Odour: 0.82,
  H2S: 0.29,
  Etoh: 0.68,
  NO2: 0.46,
};

export default function FingerprintModal({
  visible,
  onClose,
}: FingerprintModalProps) {
  const { characteristicValues } = useBLE();
  const { location } = useLiveLocation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedFingerprint, setCapturedFingerprint] =
    useState<SensorEvent | null>(null);
  const [micPhase, setMicPhase] = useState<MicPhase>('idle');
  const [recordingDuration, setRecordingDuration] = useState('00:00');

  const [zoomLevel, setZoomLevel] = useState(1);
  const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;
  const audioPathRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sensorRecordIdRef = useRef<string>(uuidv4());
  const recordingIdRef = useRef<string | null>(null);

  const createFingerprint = useCallback((): SensorEvent => {
    const hasSensorReadings = Object.keys(characteristicValues).length > 0;
    const readings =
      __DEV__ && !hasSensorReadings
        ? developmentReadings
        : {
            CH4: characteristicValues.Methane || 0,
            NH3: characteristicValues.Ammonia || 0,
            HCHO: characteristicValues.Formaldehyde || 0,
            VOC: characteristicValues['Voletile Organic Compounds'] || 0,
            Odour: characteristicValues.Odor || 0,
            H2S: characteristicValues['Hydrogen Sulfide'] || 0,
            Etoh: characteristicValues.Ethanol || 0,
            NO2: characteristicValues['Nitrogen Dioxide'] || 0,
          };

    return {
      type: 'sensor_reading',
      timestamp: new Date(),
      source: 'BLE Device',
      olfactoryData: {
        readings,
        units: {
          CH4: 'ppm',
          NH3: 'ppm',
          HCHO: 'ppm',
          VOC: 'ppm',
          Odour: 'a.u.',
          H2S: 'ppm',
          Etoh: 'ppm',
          NO2: 'ppm',
        },
      },
    };
  }, [characteristicValues]);

  const handlePhotoTaken = async (tempPhotoPath: string) => {
    const permanentPath = `${DocumentDirectoryPath}/fingerprint_${Date.now()}.jpg`;
    try {
      await copyFile(tempPhotoPath, permanentPath);
      setPhotoPath(permanentPath);
      Alert.alert('Photo captured', 'Photo added to fingerprint');
    } catch (error) {
      Alert.alert('Photo save failed', String(error));
    }
  };

  // ── Mic handlers ─────────────────────────────────────────────────────────────

  const handleMicPress = async () => {
    if (micPhase === 'idle' || micPhase === 'error') {
      await startRecording();
    } else if (micPhase === 'recording') {
      await stopAndTranscribe();
    }
  };

  const startRecording = async () => {
    try {
      // Pass no path on iOS — custom absolute paths trigger an AVAudioRecorder init bug in v3.5.x
      const uri = await audioRecorderPlayer.startRecorder(undefined);
      audioRecorderPlayer.addRecordBackListener(e => {
        setRecordingDuration(
          audioRecorderPlayer.mmss(Math.floor(e.currentPosition / 1000)),
        );
      });
      audioPathRef.current = uri;
      setRecordingDuration('00:00');
      setMicPhase('recording');
    } catch (err) {
      Alert.alert('Recording failed', String(err));
      setMicPhase('error');
    }
  };

  const stopAndTranscribe = async () => {
    try {
      await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
    } catch {
      /* already stopped */
    }

    const localUri = audioPathRef.current;
    if (!localUri) {
      setMicPhase('idle');
      return;
    }

    setMicPhase('uploading');
    try {
      const recordingId = uuidv4();
      recordingIdRef.current = recordingId;
      const startedAtMs = Date.now();
      const prep = await uploadsPrepare(recordingId, 'm4a');
      const minimalBundle = {
        schema: 'audio_gps_track_v1' as const,
        recording_started_at_ms: startedAtMs,
        metrics: { minMeters: 3, maxGapMs: 1000 },
        points: [],
        audio: {
          container: prep.audioUpload.container,
          blobName: prep.audioUpload.blobName,
        },
      };
      await Promise.all([
        uploadAudioToAzure(
          localUri,
          prep.audioUpload.uploadUrl,
          prep.audioUpload.container,
          prep.audioUpload.blobName,
        ),
        uploadAudioTrackJsonToAzure(
          minimalBundle,
          prep.bundleUpload.uploadUrl,
          prep.bundleUpload.container,
          prep.bundleUpload.blobName,
          {
            container: prep.audioUpload.container,
            blobName: prep.audioUpload.blobName,
          },
        ),
      ]);
      await notifyUploadComplete(recordingId, 'm4a', 'en-US');

      // Persist the capture so the global poller can finish transcription even if modal closes
      await insertCapture({
        id: recordingId,
        sensorRecordId: sensorRecordIdRef.current,
        type: 'audio',
        localPath: localUri,
        bundleBlobName: prep.bundleUpload.blobName,
        imageBlobName: null,
        imageContainer: null,
        status: 'uploaded',
        transcriptJson: null,
        selectedTagsJson: null,
        suggestedTagsJson: null,
        description: '',
        latitudeDisplay: null,
        longitudeDisplay: null,
        latitudeRaw: null,
        longitudeRaw: null,
        capturedAt: startedAtMs,
        annotationIndex: null,
      });

      setMicPhase('processing');

      // Poll locally while modal is still open for a fast in-modal result
      pollRef.current = setInterval(async () => {
        try {
          const status = await fetchProcessedStatus(recordingId);
          if (status?.status === 'transcribed') {
            clearPoll();
            const transcript = await fetchProcessedTranscript(recordingId);
            if (transcript) {
              setDescription(transcriptToPlainText(transcript));
            }
            setMicPhase('idle');
            setRecordingDuration('00:00');
          } else if (status?.status === 'failed') {
            clearPoll();
            setMicPhase('error');
          }
        } catch (e) {
          console.warn('STT poll error (will retry):', e);
        }
      }, 10_000);
    } catch (err) {
      Alert.alert('Transcription failed', String(err));
      setMicPhase('error');
    }
  };

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ── Save / Cancel ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (isBusy) {
      Alert.alert(
        'Transcription in progress',
        'Please wait for the transcription to finish before saving.',
      );
      return;
    }
    const fingerprint = capturedFingerprint || createFingerprint();
    const r = (fingerprint.olfactoryData?.readings ?? {}) as Record<
      string,
      number
    >;
    const id = sensorRecordIdRef.current;

    try {
      await insertSensorRecord({
        id,
        title: title || 'Untitled',
        description: description || '',
        tagsJson: null,
        photoPath: photoPath ?? null,
        recordedAt: Date.now(),
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        ch4: r.CH4,
        nh3: r.NH3,
        hcho: r.HCHO,
        voc: r.VOC,
        odour: r.Odour,
        h2s: r.H2S,
        etoh: r.Etoh,
        no2: r.NO2,
        deltaCh4: null,
        deltaNh3: null,
        deltaHcho: null,
        deltaVoc: null,
        deltaOdour: null,
        deltaH2s: null,
        deltaEtoh: null,
        deltaNo2: null,
      });

      await enqueueSync({
        id: uuidv4(),
        entityType: 'sensor_record',
        entityId: id,
        operation: 'create',
        payloadJson: JSON.stringify({
          id,
          title: title || 'Untitled',
          description: description || '',
          location: location ?? null,
          readings: r,
        }),
        createdAt: Date.now(),
      });

      emitter.emit('sensor_reading', fingerprint);
      Alert.alert('Saved', 'Fingerprint saved successfully!');
      handleCancel();
    } catch (err) {
      Alert.alert('Save failed', String(err));
    }
  };

  const handleCancel = async () => {
    clearPoll();
    if (micPhase === 'recording') {
      await audioRecorderPlayer.stopRecorder().catch(() => {});
      audioRecorderPlayer.removeRecordBackListener();
    }
    setTitle('');
    setDescription('');
    setPhotoPath(null);
    setMicPhase('idle');
    setRecordingDuration('00:00');
    audioPathRef.current = null;
    recordingIdRef.current = null;
    sensorRecordIdRef.current = uuidv4();
    setCapturedFingerprint(null);
    onClose();
  };

  React.useEffect(() => {
    if (visible && !capturedFingerprint) {
      setCapturedFingerprint(createFingerprint());
    }
  }, [capturedFingerprint, createFingerprint, visible]);

  const isBusy = micPhase === 'uploading' || micPhase === 'processing';
  const statusLabel = MIC_LABEL[micPhase];
  const micIconColor = micPhase === 'error' ? '#ff3b30' : '#333';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCancel}>
      {showCamera ? (
        <CameraModal
          onClose={() => setShowCamera(false)}
          onPhotoTaken={handlePhotoTaken}
        />
      ) : (
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.headerButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Fingerprint</Text>
            <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.inputCard}>
                <TextInput
                  style={styles.titleInput}
                  placeholder="Title"
                  placeholderTextColor="#999"
                  value={title}
                  onChangeText={setTitle}
                />
                <View style={styles.divider} />
                <View style={styles.noteBar}>
                  <TextInput
                    style={styles.noteInput}
                    placeholder={isBusy ? statusLabel : 'Add a note…'}
                    placeholderTextColor={isBusy ? '#007AFF' : '#999'}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!isBusy}
                  />
                  <TouchableOpacity
                    style={[
                      styles.micButton,
                      micPhase === 'recording' && styles.micButtonRecording,
                      micPhase === 'error' && styles.micButtonError,
                      isBusy && styles.micButtonBusy,
                    ]}
                    onPress={handleMicPress}
                    disabled={isBusy}>
                    {micPhase === 'recording' ? (
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Rect
                          x="4"
                          y="4"
                          width="16"
                          height="16"
                          rx="2"
                          fill="#ff3b30"
                        />
                      </Svg>
                    ) : (
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Path
                          d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"
                          fill={
                            micPhase === 'error'
                              ? '#ff3b30'
                              : isBusy
                              ? '#aaa'
                              : micIconColor
                          }
                        />
                        <Path
                          d="M19 10v2a7 7 0 0 1-14 0v-2"
                          stroke={
                            micPhase === 'error'
                              ? '#ff3b30'
                              : isBusy
                              ? '#aaa'
                              : micIconColor
                          }
                          strokeWidth="2"
                          strokeLinecap="round"
                          fill="none"
                        />
                        <Line
                          x1="12"
                          y1="19"
                          x2="12"
                          y2="23"
                          stroke={
                            micPhase === 'error'
                              ? '#ff3b30'
                              : isBusy
                              ? '#aaa'
                              : micIconColor
                          }
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <Line
                          x1="8"
                          y1="23"
                          x2="16"
                          y2="23"
                          stroke={
                            micPhase === 'error'
                              ? '#ff3b30'
                              : isBusy
                              ? '#aaa'
                              : micIconColor
                          }
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </Svg>
                    )}
                  </TouchableOpacity>
                </View>

                {micPhase !== 'idle' && (
                  <View style={styles.statusRow}>
                    {micPhase === 'recording' && (
                      <View style={styles.recordingDot} />
                    )}
                    <Text
                      style={[
                        styles.statusText,
                        micPhase === 'error' && styles.statusTextError,
                      ]}>
                      {micPhase === 'recording'
                        ? recordingDuration
                        : statusLabel}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.photoButton}
                onPress={() => setShowCamera(true)}>
                <Text style={styles.photoButtonText}>Take photo</Text>
                <View style={styles.photoIconContainer}>
                  <Text style={styles.photoIcon}>📷</Text>
                </View>
              </TouchableOpacity>

              {photoPath && (
                <View style={styles.photoPreviewContainer}>
                  <Image
                    source={{ uri: `file://${photoPath}` }}
                    style={styles.photoPreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => setPhotoPath(null)}>
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Radar Chart */}
              {capturedFingerprint &&
                (() => {
                  const r = capturedFingerprint.olfactoryData?.readings ?? {};
                  const radarData = SENSOR_ORDER.map((key, idx) => ({
                    x: SENSOR_LABELS[idx],
                    y: Number((r as any)[key]) || 0,
                  }));
                  const chartData = [
                    {
                      key: 'live',
                      title: title || 'Fingerprint',
                      values: radarData,
                      color: {
                        fill: 'hsla(210, 100%, 50%, 0.35)',
                        stroke: 'hsla(210, 100%, 40%, 1)',
                      },
                    },
                  ];
                  return (
                    <View style={styles.chartCard}>
                      <CustomRadarChart
                        data={chartData}
                        size={Math.min(width - 64, 320)}
                        maxValue={1}
                        gridLevels={5}
                        zoomLevel={zoomLevel}
                      />
                      <Slider
                        style={styles.slider}
                        minimumValue={1}
                        maximumValue={20}
                        value={zoomLevel}
                        onValueChange={setZoomLevel}
                        minimumTrackTintColor="#333"
                        maximumTrackTintColor="#ccc"
                      />
                      <Text style={styles.sliderLabel}>
                        Zoom: {zoomLevel.toFixed(1)}×
                      </Text>
                    </View>
                  );
                })()}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 0 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerButton: { minWidth: 60 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#000' },
  cancelText: { fontSize: 16, color: '#000' },
  saveText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    textAlign: 'right',
  },
  inputCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    paddingVertical: 8,
  },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 8 },
  noteBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },
  noteInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    paddingVertical: 8,
    minHeight: 60,
    maxHeight: 120,
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  micButtonRecording: {
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: '#ff3b30',
  },
  micButtonError: {
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: '#ff3b30',
  },
  micButtonBusy: { opacity: 0.4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
  },
  statusText: { fontSize: 13, color: '#007AFF' },
  statusTextError: { color: '#ff3b30' },
  photoButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  photoButtonText: { fontSize: 16, color: '#000' },
  photoIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIcon: { fontSize: 18 },
  photoPreviewContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoPreview: { width: '100%', height: 250, backgroundColor: '#f0f0f0' },
  removePhotoButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chartCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  modalContent: { flex: 1, backgroundColor: '#fff' },
  slider: { width: '80%', height: 40, marginTop: 8 },
  sliderLabel: { fontSize: 12, color: '#666', marginTop: 2 },
});

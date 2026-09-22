import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Platform,
  UIManager,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
} from '@maplibre/maplibre-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import CustomRadarChart from './CustomRadarChart';

const { width } = Dimensions.get('window');

const locationPointStyle = {
  circleColor: '#ff7043',
  circleRadius: 8,
  circleStrokeWidth: 2,
  circleStrokeColor: '#fff',
};

import {
  SavedFingerprintData,
  SensorReadings,
} from '../../types/fingerprintTypes';
import { updateSensorRecord, insertCapture } from '../../services/database/db';
import { fetchSuggestedDescriptors } from '../../services/annotations/suggestDescriptors';
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

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

type MicPhase = 'idle' | 'recording' | 'uploading' | 'processing' | 'error';

interface ExpandedFingerprintViewProps {
  data: SavedFingerprintData;
  onBack: () => void;
  sensorRecordId?: string;
  initialTags?: string[];
}

export default function ExpandedFingerprintView({
  data,
  onBack,
  sensorRecordId,
  initialTags,
}: ExpandedFingerprintViewProps) {
  const readings = data.fingerprint?.olfactoryData?.readings || {};

  const [title, setTitle] = useState(data.fingerprintTitle?.title || '');
  const [description, setDescription] = useState(
    data.humanDescription?.description || '',
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags || []);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [micPhase, setMicPhase] = useState<MicPhase>('idle');
  const [recordingDuration, setRecordingDuration] = useState('00:00');
  const [saving, setSaving] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedSensor, setSelectedSensor] = useState<{
    label: string;
    value: number;
  } | null>(null);

  const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;
  const audioPathRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      clearPoll();
      if (tagTimerRef.current) {
        clearTimeout(tagTimerRef.current);
      }
    },
    [],
  );

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const refreshTags = useCallback(async (text: string) => {
    if (!text.trim()) {
      return;
    }
    try {
      const res = await fetchSuggestedDescriptors(text);
      setSelectedTags(res.suggestedDescriptors.slice(0, 6));
      setSuggestedTags(res.suggestedDescriptors.slice(6));
    } catch {}
  }, []);

  const handleDescriptionChange = useCallback(
    (text: string) => {
      setDescription(text);
      if (tagTimerRef.current) {
        clearTimeout(tagTimerRef.current);
      }
      tagTimerRef.current = setTimeout(() => refreshTags(text), 1200);
    },
    [refreshTags],
  );

  const isBusy = micPhase === 'uploading' || micPhase === 'processing';
  const micIconColor = micPhase === 'error' ? '#ff3b30' : '#333';

  const handleMicPress = async () => {
    if (micPhase === 'idle' || micPhase === 'error') {
      await startRecording();
    } else if (micPhase === 'recording') {
      await stopAndTranscribe();
    }
  };

  const startRecording = async () => {
    try {
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
    } catch {}

    const localUri = audioPathRef.current;
    if (!localUri) {
      setMicPhase('idle');
      return;
    }

    setMicPhase('uploading');
    try {
      const recordingId = uuidv4();
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

      // Persist so the global poller can finish transcription if the user navigates away
      await insertCapture({
        id: recordingId,
        sensorRecordId: sensorRecordId ?? null,
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
      }).catch(() => {});

      setMicPhase('processing');

      pollRef.current = setInterval(async () => {
        try {
          const status = await fetchProcessedStatus(recordingId);
          if (status?.status === 'transcribed') {
            clearPoll();
            const transcript = await fetchProcessedTranscript(recordingId);
            const text = transcript ? transcriptToPlainText(transcript) : '';
            if (text) {
              setDescription(text);
              await refreshTags(text);
            }
            setMicPhase('idle');
            setRecordingDuration('00:00');
          } else if (status?.status === 'failed') {
            clearPoll();
            setMicPhase('error');
          }
        } catch (e) {
          console.warn('STT poll error:', e);
        }
      }, 10_000);
    } catch (err) {
      Alert.alert('Transcription failed', String(err));
      setMicPhase('error');
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  const handleSave = async () => {
    if (isBusy) {
      Alert.alert(
        'Transcription in progress',
        'Please wait for the transcription to finish before saving.',
      );
      return;
    }
    if (!sensorRecordId) {
      onBack();
      return;
    }
    setSaving(true);
    try {
      await updateSensorRecord(
        sensorRecordId,
        title || 'Untitled',
        description,
        selectedTags.length > 0 ? JSON.stringify(selectedTags) : null,
      );
      onBack();
    } catch (err) {
      Alert.alert('Save failed', String(err));
    } finally {
      setSaving(false);
    }
  };

  const currentReadings: SensorReadings = {
    CH4: Number(readings.CH4) || 0,
    NH3: Number(readings.NH3) || 0,
    HCHO: Number(readings.HCHO) || 0,
    VOC: Number(readings.VOC) || 0,
    Odour: Number(readings.Odour) || 0,
    H2S: Number(readings.H2S) || 0,
    Etoh: Number(readings.Etoh) || 0,
    NO2: Number(readings.NO2) || 0,
  };

  const radarData = SENSOR_ORDER.map((key, idx) => ({
    x: SENSOR_LABELS[idx],
    y: (currentReadings as any)[key] ?? 0,
  }));

  const chartData = [
    {
      key: 'fingerprint-detail',
      title: title || 'Fingerprint',
      values: radarData,
      color: {
        fill: 'hsla(210, 100%, 50%, 0.35)',
        stroke: 'hsla(210, 100%, 40%, 1)',
      },
    },
  ];

  const sensorCells = SENSOR_ORDER.map((key, idx) => ({
    label: SENSOR_LABELS[idx],
    value: (currentReadings as any)[key] ?? 0,
  }));

  const allTags = Array.from(new Set([...suggestedTags, ...selectedTags]));

  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerBtn}
          disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Timestamp */}
        <View style={styles.timestampBadge}>
          <Text style={styles.timestampText}>
            {new Date(data.timestamp).toLocaleDateString()}{' '}
            {new Date(data.timestamp).toLocaleTimeString()}
          </Text>
        </View>

        {/* Editable Description Card */}
        <View style={styles.descriptionCard}>
          {/* Title */}
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor="#999"
          />
          <View style={styles.divider} />

          {/* Description + Mic */}
          <View style={styles.noteBar}>
            <TextInput
              style={styles.noteInput}
              value={description}
              onChangeText={handleDescriptionChange}
              placeholder={
                isBusy
                  ? micPhase === 'uploading'
                    ? 'Uploading…'
                    : 'Transcribing…'
                  : 'Add a description…'
              }
              placeholderTextColor={isBusy ? '#007AFF' : '#999'}
              multiline
              numberOfLines={4}
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

          {micPhase === 'recording' && (
            <View style={styles.statusRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.statusText}>{recordingDuration}</Text>
            </View>
          )}

          {/* Olfactory Tag Chips */}
          {allTags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.tagsLabel}>Olfactory tags</Text>
              <View style={styles.tagsWrap}>
                {allTags.map(tag => {
                  const selected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.tagChip,
                        selected && styles.tagChipSelected,
                      ]}
                      onPress={() => toggleTag(tag)}>
                      <Text
                        style={[
                          styles.tagText,
                          selected && styles.tagTextSelected,
                        ]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Photo */}
        {data.photoPath && (
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: `file://${data.photoPath}` }}
              style={styles.photo}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Radar Chart */}
        <View style={styles.chartSection}>
          <CustomRadarChart
            data={chartData}
            size={Math.min(width - 80, 320)}
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
          <Text style={styles.sliderLabel}>Zoom: {zoomLevel.toFixed(1)}×</Text>
        </View>

        {/* Numbers Grid */}
        <View style={styles.numbersSection}>
          <Text style={styles.sectionTitle}>Numbers</Text>
          <View style={styles.sensorGrid}>
            {sensorCells.map((sensor, idx) => (
              <Pressable
                key={idx}
                style={styles.sensorCell}
                onPress={() => setSelectedSensor(sensor)}>
                <Text style={styles.sensorLabel}>{sensor.label}</Text>
                <Text style={styles.sensorValue}>
                  {sensor.value.toFixed(4)}
                </Text>
                <Text style={styles.tapHint}>Tap for plot</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Sensor detail modal */}
        <Modal
          visible={!!selectedSensor}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedSensor(null)}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setSelectedSensor(null)}>
            <View style={styles.sensorModal}>
              <View style={styles.sensorModalHeader}>
                <Text style={styles.sensorModalTitle}>
                  {selectedSensor?.label}
                </Text>
                <Pressable onPress={() => setSelectedSensor(null)}>
                  <Text style={styles.sensorModalClose}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.sensorModalValue}>
                {selectedSensor?.value.toFixed(6)}
              </Text>
              {selectedSensor && (
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(selectedSensor.value * 100, 100)}%`,
                      },
                    ]}
                  />
                </View>
              )}
              <Text style={styles.sensorModalHint}>
                Value relative to max (1.0)
              </Text>
            </View>
          </Pressable>
        </Modal>

        {/* Map */}
        <View style={styles.mapSection}>
          <Text style={styles.sectionTitle}>Location</Text>
          {data.location ? (
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json">
                <Camera
                  centerCoordinate={[
                    data.location.longitude,
                    data.location.latitude,
                  ]}
                  zoomLevel={14}
                />
                <ShapeSource
                  id="fingerprint-location"
                  shape={{
                    type: 'FeatureCollection',
                    features: [
                      {
                        type: 'Feature',
                        geometry: {
                          type: 'Point',
                          coordinates: [
                            data.location.longitude,
                            data.location.latitude,
                          ],
                        },
                        properties: {},
                      },
                    ],
                  }}>
                  <CircleLayer id="location-point" style={locationPointStyle} />
                </ShapeSource>
              </MapView>
            </View>
          ) : (
            <View style={[styles.mapContainer, styles.noLocationContainer]}>
              <Text style={styles.noLocationText}>No location data</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerBtn: { minWidth: 60 },
  backText: { color: '#007aff', fontSize: 16, fontWeight: '500' },
  saveText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  contentContainer: { padding: 20, paddingBottom: 40 },
  timestampBadge: {
    backgroundColor: '#e8e8e8',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  timestampText: { fontSize: 13, color: '#333' },
  chartSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  slider: { width: '80%', height: 40, marginTop: 8 },
  sliderLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  numbersSection: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
  sensorValue: { fontSize: 12, color: '#666' },
  tapHint: { fontSize: 10, color: '#999', fontStyle: 'italic', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sensorModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: width - 60,
  },
  sensorModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sensorModalTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  sensorModalClose: { fontSize: 22, color: '#999' },
  sensorModalValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 20,
  },
  barTrack: {
    height: 12,
    backgroundColor: '#e8e8e8',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: { height: '100%', backgroundColor: '#1A1A1A', borderRadius: 6 },
  sensorModalHint: { fontSize: 12, color: '#999', textAlign: 'center' },
  descriptionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    paddingVertical: 8,
  },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 8 },
  noteBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    paddingVertical: 8,
    minHeight: 80,
    maxHeight: 160,
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
  tagsSection: { marginTop: 12 },
  tagsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  tagChipSelected: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  tagText: { fontSize: 13, color: '#555' },
  tagTextSelected: { color: '#fff' },
  photoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photo: { width: '100%', height: 220 },
  mapSection: { marginBottom: 20 },
  mapContainer: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
  },
  map: { flex: 1 },
  noLocationContainer: { justifyContent: 'center', alignItems: 'center' },
  noLocationText: { color: '#999', fontSize: 14 },
});

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  ActivityIndicator,
} from 'react-native';

import SensorReadingsPanel from './SensorReadingsPanel';

import AudioRecorderPlayer from 'react-native-audio-recorder-player';

import { useBLE } from '../../BLEUniversal';

import {
  DocumentDirectoryPath,
  copyFile,
  exists,
  mkdir,
} from 'react-native-fs';

import useLiveLocation from '../../hooks/useLiveLocation';

import { SensorEvent, emitter } from '../../types/events';

import CustomRadarChart, { gasSeries } from './CustomRadarChart';
import {
  EnvSensorKey,
  SENSOR_DEFINITIONS,
  SENSOR_UNITS,
  readAllValues,
} from '../../sensors';
import {
  EMPTY_DELTA_FIELDS,
  readingsToRecordFields,
} from '../../sensorRecords';

import CameraModal from './CameraCapture';

import {
  insertSensorRecord,
  insertCapture,
  updateCaptureStatus,
  enqueueSync,
} from '../../services/database/db';

import { uploadAnnotationMedia, BrianMedia } from '../../services/brianBackend';
import {
  LocalAnnotationMedia,
  saveAnnotation,
  SaveAnnotationPayload,
} from '../../services/annotations/annotationService';

import 'react-native-get-random-values';

import { v4 as uuidv4 } from 'uuid';
import { SensorReadings } from '../../types/fingerprintTypes';
import { COLORS } from '../../consts';
import {
  Camera,
  Check,
  AlertCircle,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Trash,
  ChevronRight,
  ChevronUp,
  Info,
  Square,
} from 'lucide-react-native';

type MicPhase = 'idle' | 'recording' | 'uploading' | 'processing' | 'error';
type PlayPhase = 'stopped' | 'playing' | 'paused';
type SavePhase =
  | 'idle'
  | 'saving-local'
  | 'saving-backend'
  | 'success'
  | 'queued'
  | 'error';

type AudioMeta = { uri: string; durationMs: number };

interface FingerprintModalProps {
  visible: boolean;
  onClose: () => void;
  walkId?: string | null;
  initialFingerprint?: SensorEvent | null;
}

const MAX_RECORDING_SECONDS = 60;

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const capturedLabel = (ts: unknown) => {
  const d = ts ? new Date(ts as any) : new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? `Captured today, ${time}`
    : `Captured ${d.toLocaleDateString()}, ${time}`;
};

type Bar = { h: number; c: string };

const makeBars = (
  count: number,
  maxH: number,
  colorFor: (index: number) => string,
  offset = 0,
): Bar[] =>
  Array.from({ length: count }, (_, i) => {
    const k = i + offset;
    const v =
      Math.abs(Math.sin(k * 1.31) + 0.6 * Math.sin(k * 0.43 + 1.2)) / 1.6;
    return {
      h: Math.round(6 + Math.min(1, v) * (maxH - 6)),
      c: colorFor(i),
    };
  });

function Waveform({
  bars,
  height,
  style,
}: {
  bars: Bar[];
  height: number;
  style?: object;
}) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.waveform, { height }, style]}>
      {bars.map((b, i) => (
        <View
          key={i}
          style={[styles.waveformBar, { height: b.h, backgroundColor: b.c }]}
        />
      ))}
    </View>
  );
}

const DEV_ENV: Record<EnvSensorKey, number> = {
  TempC: 21.5,
  PressureHPa: 1013.2,
  HumidityPct: 48,
  AltitudeM: 32,
  GasResOhm: 12000,
};

const developmentReadings: SensorReadings = Object.fromEntries(
  SENSOR_DEFINITIONS.map((s, i) => [
    s.key,
    s.kind === 'gas'
      ? 0.3 + ((i * 37) % 50) / 100
      : DEV_ENV[s.key as EnvSensorKey],
  ]),
) as SensorReadings;

export default function FingerprintModal({
  visible,
  onClose,
  walkId = null,
  initialFingerprint = null,
}: FingerprintModalProps) {
  const { characteristicValues, connectedDevice } = useBLE();

  const { location } = useLiveLocation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showNameError, setShowNameError] = useState(false);

  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  const [showCamera, setShowCamera] = useState(false);

  const [capturedFingerprint, setCapturedFingerprint] =
    useState<SensorEvent | null>(null);

  const [micPhase, setMicPhase] = useState<MicPhase>('idle');
  const [savePhase, setSavePhase] = useState<SavePhase>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  const [recordMs, setRecordMs] = useState(0);
  const [isReplacing, setIsReplacing] = useState(false);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  const [playPhase, setPlayPhase] = useState<PlayPhase>('stopped');
  const [playMs, setPlayMs] = useState(0);

  const [showChart, setShowChart] = useState(false);

  const [undo, setUndo] = useState<{
    message: string;
    onUndo: () => void;
  } | null>(null);

  const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;

  const audioPathRef = useRef<string | null>(null);
  const playPositionRef = useRef(0);

  const sensorRecordIdRef = useRef<string>(uuidv4());

  const recordingIdRef = useRef<string | null>(null);
  const audioMediaRef = useRef<BrianMedia | null>(null);
  const audioUploadFailedRef = useRef(false);

  const lastRecordMsRef = useRef(0);
  const isStoppingRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const photoCaptureIdRef = useRef<string>(uuidv4());

  const createFingerprint = useCallback((): SensorEvent => {
    const hasSensorReadings = Object.keys(characteristicValues).length > 0;
    const readings =
      __DEV__ && !hasSensorReadings
        ? developmentReadings
        : readAllValues(characteristicValues);

    return {
      type: 'sensor_reading',
      timestamp: new Date(),
      source: 'BLE Device',
      olfactoryData: { readings, units: SENSOR_UNITS },
    };
  }, [characteristicValues]);

  const ensureDirectory = useCallback(async (path: string) => {
    if (!(await exists(path))) {
      await mkdir(path);
    }
  }, []);

  const showUndo = (message: string, onUndo: () => void) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    setUndo({ message, onUndo });
    undoTimerRef.current = setTimeout(() => setUndo(null), 6000);
  };

  const handleUndo = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    undo?.onUndo();
    setUndo(null);
  };

  const handlePhotoTaken = async (tempPhotoPath: string) => {
    const permanentPath = walkId
      ? `${DocumentDirectoryPath}/walks/${walkId}/media/${photoCaptureIdRef.current}.jpg`
      : `${DocumentDirectoryPath}/fingerprint_${Date.now()}.jpg`;

    try {
      if (walkId) {
        await ensureDirectory(`${DocumentDirectoryPath}/walks`);

        await ensureDirectory(`${DocumentDirectoryPath}/walks/${walkId}`);

        await ensureDirectory(`${DocumentDirectoryPath}/walks/${walkId}/media`);
      }

      await copyFile(tempPhotoPath, permanentPath);

      setPhotoPath(permanentPath);
      setPhotoVersion(v => v + 1);
    } catch (error) {
      Alert.alert('Photo save failed', String(error));
    }
  };

  const handleRemovePhoto = () => {
    const previous = photoPath;
    setPhotoPath(null);
    showUndo('Photo removed', () => setPhotoPath(previous));
  };

  const stopPlayback = async (resetPosition = true) => {
    try {
      await audioRecorderPlayer.stopPlayer();
    } catch {
      // Nothing was playing.
    }
    audioRecorderPlayer.removePlayBackListener();
    setPlayPhase('stopped');
    if (resetPosition) {
      playPositionRef.current = 0;
      setPlayMs(0);
    }
  };

  const handlePlayPress = async () => {
    if (!audioMeta) {
      return;
    }

    try {
      if (playPhase === 'playing') {
        await audioRecorderPlayer.pausePlayer();
        setPlayPhase('paused');
        return;
      }

      if (playPhase === 'paused') {
        await audioRecorderPlayer.resumePlayer();
        setPlayPhase('playing');
        return;
      }

      const durationMs = audioMeta.durationMs;
      const isFinished =
        durationMs > 0 && playPositionRef.current >= durationMs - 250;
      const startPosition = isFinished ? 0 : playPositionRef.current;

      await audioRecorderPlayer.startPlayer(audioMeta.uri);
      if (startPosition > 0) {
        await audioRecorderPlayer.seekToPlayer(startPosition);
      }

      audioRecorderPlayer.addPlayBackListener(e => {
        playPositionRef.current = e.currentPosition;
        setPlayMs(e.currentPosition);
        if (e.isFinished) {
          audioRecorderPlayer.removePlayBackListener();
          playPositionRef.current = e.currentPosition;
          setPlayMs(e.currentPosition);
          setPlayPhase('stopped');
        }
      });

      if (isFinished) {
        playPositionRef.current = 0;
        setPlayMs(0);
      }
      setPlayPhase('playing');
    } catch (err) {
      Alert.alert('Playback failed', String(err));
      setPlayPhase('stopped');
    }
  };

  const handleMicPress = async () => {
    if (micPhase === 'idle' || micPhase === 'error') {
      await startRecording(false);
    } else if (micPhase === 'recording') {
      await stopAndUpload();
    }
  };

  const startRecording = async (replacing: boolean) => {
    await stopPlayback();

    try {
      const uri = await audioRecorderPlayer.startRecorder(undefined);

      isStoppingRef.current = false;
      lastRecordMsRef.current = 0;

      audioRecorderPlayer.addRecordBackListener(e => {
        lastRecordMsRef.current = e.currentPosition;
        setRecordMs(e.currentPosition);

        if (
          e.currentPosition >= MAX_RECORDING_SECONDS * 1000 &&
          !isStoppingRef.current
        ) {
          stopRef.current();
        }
      });

      audioPathRef.current = uri;

      audioUploadFailedRef.current = false;
      setRecordMs(0);
      setIsReplacing(replacing);
      setMicPhase('recording');
    } catch (err) {
      Alert.alert('Recording failed', String(err));

      setMicPhase(replacing ? 'idle' : 'error');
    }
  };

  const cancelRecording = async () => {
    isStoppingRef.current = true;

    try {
      await audioRecorderPlayer.stopRecorder();
    } catch {
      // Already stopped.
    }

    audioRecorderPlayer.removeRecordBackListener();

    audioPathRef.current = null;

    setIsReplacing(false);
    setRecordMs(0);
    setMicPhase('idle');
  };

  const stopAndUpload = async () => {
    if (isStoppingRef.current) {
      return;
    }
    isStoppingRef.current = true;

    try {
      await audioRecorderPlayer.stopRecorder();

      audioRecorderPlayer.removeRecordBackListener();
    } catch {
      // Already stopped.
    }

    let localUri = audioPathRef.current;
    const durationMs = lastRecordMsRef.current;

    if (!localUri) {
      setIsReplacing(false);
      setMicPhase('idle');
      return;
    }

    setMicPhase('uploading');

    try {
      const recordingId = uuidv4();

      const startedAtMs = Date.now();

      if (walkId) {
        await ensureDirectory(`${DocumentDirectoryPath}/walks`);

        await ensureDirectory(`${DocumentDirectoryPath}/walks/${walkId}`);

        await ensureDirectory(`${DocumentDirectoryPath}/walks/${walkId}/media`);

        const targetPath = `${DocumentDirectoryPath}/walks/${walkId}/media/${recordingId}.m4a`;

        await copyFile(localUri.replace(/^file:\/\//, ''), targetPath);

        localUri = targetPath;
      }

      recordingIdRef.current = recordingId;
      audioPathRef.current = localUri;
      await insertCapture({
        id: recordingId,
        sensorRecordId: sensorRecordIdRef.current,
        walkId,
        type: 'audio',
        localPath: localUri,
        bundleBlobName: null,
        imageBlobName: null,
        imageContainer: null,
        status: 'local',
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

      const audioMedia = await uploadAnnotationMedia(
        recordingId,
        localUri,
        'audio/mp4',
        `${recordingId}.m4a`,
      );

      audioMediaRef.current = audioMedia;
      audioUploadFailedRef.current = false;
      await updateCaptureStatus(recordingId, 'uploaded');

      setAudioMeta({ uri: localUri, durationMs });
      setSaveMessage('Audio note uploaded');

      setIsReplacing(false);
      setRecordMs(0);
      setMicPhase('idle');
    } catch (err) {
      setSaveMessage('Audio upload failed');
      Alert.alert('Audio upload failed', String(err));

      audioUploadFailedRef.current = !audioMediaRef.current;

      if (audioMediaRef.current) {
        setIsReplacing(false);
        setMicPhase('idle');
      } else {
        setMicPhase('error');
      }
    }
  };

  stopRef.current = stopAndUpload;

  const handleDismissAudioError = () => {
    audioUploadFailedRef.current = false;
    audioPathRef.current = null;
    setMicPhase('idle');
  };

  const handleDeleteAudio = async () => {
    await stopPlayback();

    const previous = {
      meta: audioMeta,
      media: audioMediaRef.current,
      recordingId: recordingIdRef.current,
    };

    audioMediaRef.current = null;
    recordingIdRef.current = null;
    audioPathRef.current = null;
    audioUploadFailedRef.current = false;

    setAudioMeta(null);

    showUndo('Voice note deleted', () => {
      audioMediaRef.current = previous.media;
      recordingIdRef.current = previous.recordingId;
      setAudioMeta(previous.meta);
    });
  };

  const handleSave = async () => {
    if (savePhase === 'saving-local' || savePhase === 'saving-backend') {
      return;
    }

    if (!title.trim()) {
      setShowNameError(true);
      return;
    }

    if (micPhase === 'recording') {
      Alert.alert(
        'Recording in progress',
        'Stop the voice note recording before saving.',
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
      setSavePhase('saving-local');
      setSaveMessage('Saving fingerprint on this device…');

      await insertSensorRecord({
        id,
        title: title.trim(),
        description: description || '',
        walkId,
        recordType: 'fingerprint',
        tagsJson: null,
        photoPath: photoPath ?? null,
        recordedAt: Date.now(),
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracyM: null,

        ...readingsToRecordFields(r),
        ...EMPTY_DELTA_FIELDS,

        influxStatus: 'pending',
        influxSyncedAt: null,
        influxLastError: null,
      });

      let photoMedia: BrianMedia | null = null;
      const localMedia: LocalAnnotationMedia[] = [];
      if (photoPath) {
        const photoCaptureId = photoCaptureIdRef.current;
        await insertCapture({
          id: photoCaptureId,
          sensorRecordId: id,
          walkId,
          type: 'photo',
          localPath: photoPath,
          bundleBlobName: null,
          imageBlobName: null,
          imageContainer: null,
          status: 'local',
          transcriptJson: null,
          selectedTagsJson: null,
          suggestedTagsJson: null,
          description: '',
          latitudeDisplay: null,
          longitudeDisplay: null,
          latitudeRaw: location?.latitude ?? null,
          longitudeRaw: location?.longitude ?? null,
          capturedAt: Date.now(),
          annotationIndex: null,
        });
        setSaveMessage('Uploading photo…');
        try {
          photoMedia = await uploadAnnotationMedia(
            id,
            photoPath,
            'image/jpeg',
            `${photoCaptureId}.jpg`,
          );
          await updateCaptureStatus(photoCaptureId, 'uploaded');
        } catch (error) {
          localMedia.push({
            localUri: photoPath,
            contentType: 'image/jpeg',
            fileName: `${photoCaptureId}.jpg`,
            role: 'image',
          });
          console.warn(
            'Photo upload deferred until connectivity is restored',
            error,
          );
        }
      }

      if (
        audioPathRef.current &&
        !audioMediaRef.current &&
        (audioUploadFailedRef.current || isUploading)
      ) {
        localMedia.push({
          localUri: audioPathRef.current,
          contentType: 'audio/mp4',
          fileName: `${recordingIdRef.current ?? id}.m4a`,
          role: 'audio',
        });
      }

      const media = [audioMediaRef.current, photoMedia].filter(
        (item): item is BrianMedia => item !== null,
      );
      const annotationId = recordingIdRef.current ?? photoCaptureIdRef.current;
      const annotationPayload: SaveAnnotationPayload = {
        recordingId: annotationId,
        sensorReadings: r,
        title: title.trim(),
        note: description || '',
        timestamp: new Date().toISOString(),
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        photo: photoMedia?.url ?? undefined,
        audio: audioMediaRef.current?.url ?? undefined,
        deviceName:
          connectedDevice?.name ??
          connectedDevice?.localName ??
          fingerprint.deviceId ??
          fingerprint.source,
        smellWalkId: walkId ?? undefined,
        annotationIndex: 1,
        media,
        localMedia,
      };
      let annotationResult: { annotationId: string; queued: boolean };
      if (localMedia.length > 0) {
        await enqueueSync({
          id: uuidv4(),
          entityType: 'annotation',
          entityId: annotationPayload.recordingId,
          operation: 'update',
          payloadJson: JSON.stringify(annotationPayload),
          createdAt: Date.now(),
        });
        annotationResult = {
          annotationId: annotationPayload.recordingId,
          queued: true,
        };
      } else {
        setSavePhase('saving-backend');
        setSaveMessage('Saving fingerprint…');
        annotationResult = await saveAnnotation(annotationPayload);
      }

      await enqueueSync({
        id: uuidv4(),
        entityType: 'sensor_record',
        entityId: id,
        operation: 'create',
        payloadJson: JSON.stringify({
          id,
          title: title.trim(),
          description: description || '',
          location: location ?? null,
          readings: r,
        }),
        createdAt: Date.now(),
      });
      if (localMedia.length > 0 && !annotationResult.queued) {
        await enqueueSync({
          id: uuidv4(),
          entityType: 'annotation',
          entityId: annotationPayload.recordingId,
          operation: 'update',
          payloadJson: JSON.stringify(annotationPayload),
          createdAt: Date.now(),
        });
      }

      emitter.emit('sensor_reading', fingerprint);

      const queued = annotationResult.queued || localMedia.length > 0;
      setSavePhase(queued ? 'queued' : 'success');
      setSaveMessage(
        queued
          ? 'Saved on this device; will sync when online'
          : 'Fingerprint saved to the backend',
      );
      Alert.alert(
        queued ? 'Saved on device' : 'Saved',
        queued
          ? 'Fingerprint saved locally. The backend was unavailable and it will sync when the connection is restored.'
          : 'Fingerprint saved successfully!',
      );

      resetAndClose();
    } catch (err) {
      setSavePhase('error');
      setSaveMessage('Save failed — your fingerprint was not submitted');
      Alert.alert('Save failed', String(err));
    }
  };

  const resetAndClose = async () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    if (micPhase === 'recording') {
      isStoppingRef.current = true;

      await audioRecorderPlayer.stopRecorder().catch(() => {});

      audioRecorderPlayer.removeRecordBackListener();
    }

    await stopPlayback();

    setTitle('');
    setDescription('');
    setShowNameError(false);
    setShowChart(false);
    setUndo(null);
    setSavePhase('idle');
    setSaveMessage('');
    setPhotoPath(null);
    setPhotoVersion(0);
    setMicPhase('idle');
    setRecordMs(0);
    setIsReplacing(false);
    setAudioMeta(null);

    audioPathRef.current = null;
    recordingIdRef.current = null;
    audioMediaRef.current = null;
    audioUploadFailedRef.current = false;

    sensorRecordIdRef.current = uuidv4();

    photoCaptureIdRef.current = uuidv4();

    setCapturedFingerprint(null);

    onClose();
  };

  const hasUnsavedWork =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    audioMeta !== null ||
    photoPath !== null ||
    micPhase === 'recording' ||
    micPhase === 'uploading';

  const requestCancel = () => {
    if (!hasUnsavedWork) {
      resetAndClose();
      return;
    }

    Alert.alert(
      'Discard this fingerprint?',
      "Your name, note, voice note and photo won't be saved.",
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: resetAndClose },
      ],
    );
  };

  React.useEffect(() => {
    if (visible && !capturedFingerprint) {
      setCapturedFingerprint(initialFingerprint ?? createFingerprint());
    }
  }, [capturedFingerprint, createFingerprint, initialFingerprint, visible]);

  useEffect(
    () => () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      audioRecorderPlayer.removeRecordBackListener();
      audioRecorderPlayer.removePlayBackListener();
    },
    [audioRecorderPlayer],
  );

  const isRecording = micPhase === 'recording';
  const isUploading = micPhase === 'uploading' || micPhase === 'processing';
  const isSaving =
    savePhase === 'saving-local' || savePhase === 'saving-backend';
  const isBusy = isUploading || isSaving;

  const hasName = title.trim().length > 0;
  const nameError = showNameError && !hasName;
  const canSave = hasName && !isSaving && !isRecording;

  const hasAudio = audioMeta !== null;
  const voiceAdded = hasAudio && !isRecording && !isUploading;

  const readings = useMemo(
    () =>
      (capturedFingerprint?.olfactoryData?.readings ?? {}) as Record<
        string,
        number
      >,
    [capturedFingerprint?.olfactoryData?.readings],
  );

  const radar = useMemo(
    () => gasSeries('capture', title || 'Fingerprint', readings),
    [readings, title],
  );

  const attachmentParts: string[] = [];
  if (hasAudio) {
    attachmentParts.push('1 voice note');
  }
  if (photoPath) {
    attachmentParts.push('1 photo');
  }

  let captionText = 'Add a name to save';
  let captionTone: 'muted' | 'ok' | 'error' = 'muted';
  let captionIcon: 'info' | 'check' | 'alert' = 'info';

  if (isSaving) {
    captionText = saveMessage;
  } else if (savePhase === 'error') {
    captionText = saveMessage;
    captionTone = 'error';
    captionIcon = 'alert';
  } else if (savePhase === 'success' || savePhase === 'queued') {
    captionText = saveMessage;
    captionTone = 'ok';
    captionIcon = 'check';
  } else if (isRecording) {
    captionText = 'Stop the recording to save';
  } else if (isUploading) {
    captionText = 'Uploading voice note…';
  } else if (!hasName) {
    captionText = 'Add a name to save';
    if (nameError) {
      captionTone = 'error';
      captionIcon = 'alert';
    }
  } else {
    captionText =
      'Ready to save' +
      (attachmentParts.length ? ` · ${attachmentParts.join(', ')}` : '');
    captionTone = 'ok';
    captionIcon = 'check';
  }

  const captionColor =
    captionTone === 'error'
      ? COLORS.red
      : captionTone === 'ok'
      ? COLORS.green
      : COLORS.muted;

  const saveLabel =
    savePhase === 'success' || savePhase === 'queued'
      ? 'Saved'
      : 'Save fingerprint';

  const RECORD_BARS = 40;
  const PLAYER_BARS = 24;

  const recordingBars = makeBars(
    RECORD_BARS,
    40,
    i => (i < RECORD_BARS - 10 ? COLORS.recording : '#ebc9c6'),
    Math.floor(recordMs / 90),
  );

  const playedBars =
    audioMeta && audioMeta.durationMs > 0
      ? Math.round((PLAYER_BARS * playMs) / audioMeta.durationMs)
      : 0;

  const playerBars = makeBars(PLAYER_BARS, 32, i =>
    playPhase !== 'stopped' && i < playedBars ? COLORS.green : COLORS.wave,
  );

  const playerTime =
    playPhase === 'stopped' ? fmt(audioMeta?.durationMs ?? 0) : fmt(playMs);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={requestCancel}>
      {showCamera ? (
        <CameraModal
          onClose={() => setShowCamera(false)}
          onPhotoTaken={handlePhotoTaken}
        />
      ) : (
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={requestCancel}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel fingerprint">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <Text style={styles.headerTitle} accessibilityRole="header">
              New fingerprint
            </Text>

            <View style={styles.headerButton} />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.card}>
                <View style={styles.summaryRow}>
                  <View style={styles.miniRadarBox}>
                    <CustomRadarChart
                      variant="compact"
                      size={56}
                      data={radar}
                    />
                  </View>

                  <View style={styles.summaryText}>
                    <Text style={styles.summaryTitle}>
                      Fingerprint · {SENSOR_DEFINITIONS.length} sensors
                    </Text>
                    <Text style={styles.summarySub}>
                      {capturedLabel(capturedFingerprint?.timestamp)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.chartLink}
                    onPress={() => setShowChart(v => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showChart ? 'Hide full chart' : 'View full chart'
                    }>
                    <Text style={styles.chartLinkText}>
                      {showChart ? 'Hide' : 'Full data'}
                    </Text>
                    <View style={[styles.chartChevron]}>
                      {showChart ? (
                        <ChevronUp size={18} color={COLORS.green} />
                      ) : (
                        <ChevronRight size={18} color={COLORS.green} />
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {showChart && capturedFingerprint && (
                <SensorReadingsPanel
                  readings={readings}
                  title={title || 'Fingerprint'}
                  emptyText="Make sure the e-nose is connected and switched on. Readings appear here within a few seconds."
                />
              )}

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardLabel}>Name</Text>

                  <View
                    style={[
                      styles.pill,
                      nameError && { backgroundColor: COLORS.redTint },
                    ]}>
                    {hasName && <Check size={14} color={COLORS.green} />}
                    <Text
                      style={[
                        styles.pillText,
                        nameError && { color: COLORS.red },
                      ]}>
                      Required
                    </Text>
                  </View>
                </View>

                <TextInput
                  style={[styles.input, nameError && styles.inputError]}
                  placeholder="e.g. Fresh coffee, 2nd brew"
                  placeholderTextColor="#6b6d67"
                  value={title}
                  onChangeText={text => {
                    setTitle(text);
                    if (text.trim()) {
                      setShowNameError(false);
                    }
                  }}
                  editable={!isSaving}
                  returnKeyType="done"
                  accessibilityLabel="Name"
                />

                {nameError && (
                  <View style={styles.errorRow} accessibilityRole="alert">
                    <AlertCircle size={16} color={COLORS.red} />
                    <Text style={styles.errorText}>
                      Give it a name so you can find it later
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardLabel}>Note</Text>
                  <Text style={styles.optionalText}>Optional</Text>
                </View>

                <TextInput
                  style={[styles.input, styles.noteInput]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isSaving}
                  accessibilityLabel="Note"
                />
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardLabel}>Voice note</Text>

                  {voiceAdded ? (
                    <View style={styles.pill}>
                      <Check size={14} color={COLORS.green} />
                      <Text style={styles.pillText}>Added</Text>
                    </View>
                  ) : (
                    <Text style={styles.optionalText}>Optional</Text>
                  )}
                </View>

                {isRecording ? (
                  <View style={styles.recordingPanel}>
                    {isReplacing && (
                      <View style={styles.replaceBanner}>
                        <Info size={16} color="#5a3a37" />
                        <Text style={styles.replaceBannerText}>
                          Your current {fmt(audioMeta?.durationMs ?? 0)} note is
                          kept until you stop. Cancel to keep it.
                        </Text>
                      </View>
                    )}

                    <View style={styles.recordingTop}>
                      <View style={styles.recordingLabel}>
                        <View style={styles.recordingDot} />
                        <Text style={styles.recordingLabelText}>Recording</Text>
                      </View>

                      <Text style={styles.recordingTimer}>
                        {fmt(recordMs)}
                        <Text style={styles.recordingLimit}>
                          {' '}
                          / {fmt(MAX_RECORDING_SECONDS * 1000)}
                        </Text>
                      </Text>
                    </View>

                    <Waveform bars={recordingBars} height={40} />

                    <View style={styles.recordingActions}>
                      <TouchableOpacity
                        style={styles.textButton}
                        onPress={cancelRecording}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel recording">
                        <Text style={styles.textButtonLabel}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.stopButton}
                        onPress={handleMicPress}
                        accessibilityRole="button"
                        accessibilityLabel="Stop recording">
                        <Square size={16} color={COLORS.bg} />
                        <Text style={styles.stopButtonText}>Stop</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : isUploading ? (
                  <View style={styles.statusPanel}>
                    <ActivityIndicator size="small" color={COLORS.green} />
                    <Text style={styles.statusPanelText}>
                      Saving voice note…
                    </Text>
                  </View>
                ) : micPhase === 'error' ? (
                  <View style={styles.errorPanel}>
                    <View style={styles.errorPanelTop}>
                      <AlertCircle size={18} color={COLORS.red} />
                      <Text style={styles.errorPanelText}>
                        The voice note didn't upload. Try recording it again.
                      </Text>
                    </View>

                    <View style={styles.recordingActions}>
                      <TouchableOpacity
                        style={styles.textButton}
                        onPress={handleDismissAudioError}
                        accessibilityRole="button">
                        <Text style={styles.textButtonLabel}>Dismiss</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.outlineButton}
                        onPress={() => startRecording(false)}
                        accessibilityRole="button">
                        <Mic size={16} color={COLORS.green} />
                        <Text style={styles.outlineButtonText}>
                          Record again
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : hasAudio ? (
                  <View>
                    <View style={styles.playerRow}>
                      <TouchableOpacity
                        style={styles.playButton}
                        onPress={handlePlayPress}
                        accessibilityRole="button"
                        accessibilityLabel={
                          playPhase === 'playing'
                            ? 'Pause voice note'
                            : 'Play voice note'
                        }>
                        {playPhase === 'playing' ? (
                          <Pause color={COLORS.bg} />
                        ) : (
                          <Play color={COLORS.bg} />
                        )}
                      </TouchableOpacity>

                      <Waveform
                        bars={playerBars}
                        height={36}
                        style={styles.playerWave}
                      />

                      <Text style={styles.playerTime}>{playerTime}</Text>
                    </View>

                    <View style={styles.playerActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => startRecording(true)}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel="Re-record voice note">
                        <Mic size={18} color={COLORS.green} />
                        <Text
                          style={[
                            styles.actionButtonText,
                            { color: COLORS.green },
                          ]}>
                          Re-record
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={handleDeleteAudio}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel="Delete voice note">
                        <Trash size={18} color={COLORS.red} />
                        <Text
                          style={[
                            styles.actionButtonText,
                            { color: COLORS.red },
                          ]}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.slotButton,
                      isSaving && styles.controlDisabled,
                    ]}
                    onPress={handleMicPress}
                    disabled={isSaving}
                    accessibilityRole="button"
                    accessibilityLabel="Record a voice note">
                    <View style={styles.slotIcon}>
                      <Mic size={22} color={COLORS.green} />
                    </View>
                    <View style={styles.slotText}>
                      <Text style={styles.slotTitle}>Record a voice note</Text>
                      <Text style={styles.slotHint}>
                        Tap to start · one per fingerprint
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardLabel}>Photo</Text>

                  {photoPath ? (
                    <View style={styles.pill}>
                      <Check size={14} color={COLORS.green} />
                      <Text style={styles.pillText}>Added</Text>
                    </View>
                  ) : (
                    <Text style={styles.optionalText}>Optional</Text>
                  )}
                </View>

                {photoPath ? (
                  <View style={styles.photoRow}>
                    <Image
                      key={photoVersion}
                      source={{ uri: `file://${photoPath}` }}
                      style={styles.photoThumb}
                      resizeMode="cover"
                      accessibilityLabel="Attached photo"
                    />

                    <View style={styles.photoInfo}>
                      <View style={styles.photoActions}>
                        <TouchableOpacity
                          style={styles.pillButton}
                          onPress={() => setShowCamera(true)}
                          disabled={isSaving}
                          accessibilityRole="button"
                          accessibilityLabel="Replace photo">
                          <RefreshCw size={16} />
                          <Text style={styles.pillButtonText}>Replace</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.pillButton}
                          onPress={handleRemovePhoto}
                          disabled={isSaving}
                          accessibilityRole="button"
                          accessibilityLabel="Remove photo">
                          <Trash size={16} color={COLORS.red} />
                          <Text
                            style={[
                              styles.pillButtonText,
                              { color: COLORS.red },
                            ]}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.slotButton,
                      isSaving && styles.controlDisabled,
                    ]}
                    onPress={() => setShowCamera(true)}
                    disabled={isSaving}
                    accessibilityRole="button"
                    accessibilityLabel="Add one photo">
                    <View style={styles.slotIcon}>
                      <Camera size={22} color={COLORS.green} />
                    </View>
                    <View style={styles.slotText}>
                      <Text style={styles.slotTitle}>Add a photo</Text>
                      <Text style={styles.slotHint}>
                        One image can be attached
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>

            {undo && (
              <View style={styles.snackbar} accessibilityRole="alert">
                <Text style={styles.snackbarText}>{undo.message}</Text>
                <TouchableOpacity
                  style={styles.snackbarAction}
                  onPress={handleUndo}
                  accessibilityRole="button"
                  accessibilityLabel="Undo">
                  <Text style={styles.snackbarActionText}>Undo</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.footer}>
              <View style={styles.captionRow}>
                {captionIcon === 'check' ? (
                  <Check size={16} color={captionColor} strokeWidth={2.4} />
                ) : captionIcon === 'alert' ? (
                  <AlertCircle size={16} color={captionColor} />
                ) : (
                  <Info size={16} color={captionColor} />
                )}
                <Text style={[styles.caption, { color: captionColor }]}>
                  {captionText}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, !canSave && styles.saveButtonOff]}
                onPress={handleSave}
                disabled={!canSave}
                accessibilityRole="button"
                accessibilityLabel="Save fingerprint"
                accessibilityState={{ disabled: !canSave }}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.saveButtonText,
                      !canSave && styles.saveButtonTextOff,
                    ]}>
                    {saveLabel}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 12,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
    backgroundColor: COLORS.bg,
  },

  headerButton: {
    minWidth: 72,
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: COLORS.ink,
  },

  cancelText: {
    fontSize: 16,
    color: COLORS.ink,
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

  cardLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.ink,
  },

  optionalText: {
    fontSize: 13,
    color: COLORS.muted,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.greenTint,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },

  pillText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.green,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  miniRadarBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryText: {
    flex: 1,
    minWidth: 0,
  },

  summaryTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.ink,
  },

  summarySub: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },

  chartLink: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: 8,
  },

  chartLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.green,
  },

  chartChevron: {
    transform: [{ rotate: '0deg' }],
  },

  chartChevronExpanded: {
    transform: [{ rotate: '-90deg' }],
  },

  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    fontSize: 17,
    color: COLORS.ink,
  },

  inputError: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.surface,
  },

  noteInput: {
    minHeight: 76,
    maxHeight: 140,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 22,
  },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  errorText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.red,
  },

  slotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.dashed,
  },

  slotIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  slotText: {
    flex: 1,
    gap: 2,
  },

  slotTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.ink,
  },

  slotHint: {
    fontSize: 13,
    color: COLORS.muted,
  },

  controlDisabled: {
    opacity: 0.55,
  },

  recordingPanel: {
    backgroundColor: '#fdf1f0',
    borderWidth: 1,
    borderColor: '#f0c9c5',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },

  replaceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },

  replaceBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#5a3a37',
  },

  recordingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  recordingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.recording,
  },

  recordingLabelText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.red,
  },

  recordingTimer: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },

  recordingLimit: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.muted,
  },

  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  textButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },

  textButtonLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.ink,
  },

  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingLeft: 18,
    paddingRight: 22,
    borderRadius: 999,
    backgroundColor: COLORS.red,
  },

  stopButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },

  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
  },

  waveformBar: {
    width: 3,
    borderRadius: 2,
  },

  statusPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
  },

  statusPanelText: {
    fontSize: 15,
    color: COLORS.ink,
  },

  errorPanel: {
    backgroundColor: COLORS.redTint,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },

  errorPanelTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },

  errorPanelText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.red,
  },

  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.green,
    backgroundColor: COLORS.surface,
  },

  outlineButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.green,
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
  },

  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },

  playerWave: {
    flex: 1,
    minWidth: 0,
  },

  playerTime: {
    minWidth: 36,
    textAlign: 'right',
    fontSize: 13,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },

  playerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 8,
  },

  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: '#c9b393',
  },

  photoInfo: {
    flex: 1,
    gap: 10,
  },

  photoTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.ink,
  },

  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cfd3cc',
    backgroundColor: COLORS.surface,
  },

  pillButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.ink,
  },

  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: 16,
    backgroundColor: COLORS.ink,
  },

  snackbarText: {
    fontSize: 15,
    color: '#fff',
  },

  snackbarAction: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },

  snackbarActionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#a8d8be',
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

  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  caption: {
    fontSize: 13,
  },

  saveButton: {
    height: 54,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonOff: {
    backgroundColor: COLORS.disabledBg,
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },

  saveButtonTextOff: {
    color: COLORS.disabledText,
  },
});

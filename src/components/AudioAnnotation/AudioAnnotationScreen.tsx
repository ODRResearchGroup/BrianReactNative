import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Mic, Type, Play, Pause } from 'lucide-react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import { RootStackParamList } from '../../App';
import {
  startAudioRecording,
  stopAudioRecording,
} from '../../services/audio/audioRecorder';
import {
  startAudioTrack,
  stopAudioTrack,
} from '../../services/audio/audioTrack';
import { uploadsPrepare } from '../../services/audio/uploadsPrepare';
import {
  uploadAudioToAzure,
  uploadAudioTrackJsonToAzure,
} from '../../services/audio/audioUpload';
import { notifyUploadComplete } from '../../services/audio/uploadComplete';
import { insertCapture, enqueueSync } from '../../services/database/db';
import { fetchSuggestedDescriptors } from '../../services/annotations/suggestDescriptors';
import { saveAnnotation } from '../../services/annotations/annotationService';
import { usePressAnimation } from '../../hooks/usePressAnimation';

const C = {
  black: '#1A1A1A',
  darkGray: '#4D4D4D',
  lightGray: '#B3B3B3',
  white: '#FAFAFA',
  border: '#E0E0E0',
  error: '#C0392B',
};

type InputMode = 'record' | 'type';
type Phase = 'idle' | 'recording' | 'paused' | 'uploading' | 'done' | 'error';

const formatDuration = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(v => String(v).padStart(2, '0'))
    .join(':');

const formatCoord = (lat: number, lon: number) => ({
  latitude: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`,
  longitude: `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`,
});

const formatTimestamp = (ms: number) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(v => String(v).padStart(2, '0'))
    .join(':');
};

const WAVEFORM_BARS = Array.from({ length: 60 }, (_, i) => {
  const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return 0.15 + Math.abs(seed - Math.floor(seed)) * 0.85;
});

const Waveform = ({ isActive }: { isActive: boolean }) => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0.85,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [isActive, pulse]);
  return (
    <Animated.View
      style={[styles.waveform, isActive && { transform: [{ scaleY: pulse }] }]}>
      {WAVEFORM_BARS.map((h, i) => (
        <View
          key={i}
          style={[
            styles.waveBar,
            {
              height: 4 + h * 28,
              backgroundColor: isActive ? C.black : C.lightGray,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

type Props = NativeStackScreenProps<RootStackParamList, 'AudioAnnotation'>;

export default function AudioAnnotationScreen({ navigation, route }: Props) {
  const { annotationIndex, sensorRecordId } = route.params;

  const [inputMode, setInputMode] = useState<InputMode>('record');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [statusLabel, setStatusLabel] = useState('');

  const recordingIdRef = useRef<string | null>(null);
  const startedAtMsRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      stopTimer();
    },
    [],
  );

  // ── Record mode ─────────────────────────────────────────────────────────────

  const handleStart = async () => {
    try {
      const recordingId = uuidv4();
      recordingIdRef.current = recordingId;
      startedAtMsRef.current = Date.now();
      await Promise.all([
        startAudioRecording(recordingId),
        startAudioTrack(startedAtMsRef.current),
      ]);
      setElapsed(0);
      setPhase('recording');
      startTimer();
    } catch (err: any) {
      Alert.alert('Recording error', err.message ?? String(err));
      setPhase('error');
    }
  };

  const handlePauseResume = () => {
    if (phase === 'recording') {
      stopTimer();
      setPhase('paused');
    } else if (phase === 'paused') {
      startTimer();
      setPhase('recording');
    }
  };

  const handleStop = async () => {
    stopTimer();
    setPhase('uploading');
    setStatusLabel('Uploading…');

    const recordingId = recordingIdRef.current!;
    const startedAt = startedAtMsRef.current ?? Date.now();

    // Step 1: stop recording — failure here means no file, show error and stay
    let stopResult: Awaited<ReturnType<typeof stopAudioRecording>>;
    let trackBundle: ReturnType<typeof stopAudioTrack>;
    try {
      [stopResult, trackBundle] = await Promise.all([
        stopAudioRecording(),
        Promise.resolve(stopAudioTrack()),
      ]);
      if (!stopResult.localUri) {
        throw new Error('No audio file produced');
      }
    } catch (err: any) {
      Alert.alert('Recording error', err.message ?? String(err));
      setPhase('error');
      setStatusLabel('');
      return;
    }

    const firstPt = trackBundle.points[0] ?? null;
    const coords = firstPt
      ? formatCoord(firstPt.lat, firstPt.lon)
      : { latitude: '00.0000° N', longitude: '00.0000° E' };
    const baseCapture = {
      id: recordingId,
      sensorRecordId: sensorRecordId ?? null,
      type: 'audio' as const,
      localPath: stopResult.localUri,
      imageBlobName: null,
      imageContainer: null,
      transcriptJson: null,
      selectedTagsJson: null,
      suggestedTagsJson: null,
      description: '',
      latitudeDisplay: coords.latitude,
      longitudeDisplay: coords.longitude,
      latitudeRaw: firstPt?.lat ?? null,
      longitudeRaw: firstPt?.lon ?? null,
      capturedAt: startedAt,
      annotationIndex,
    };

    // Step 2: upload — failure saves locally and queues for retry
    let uploadedOk = false;
    try {
      const prep = await uploadsPrepare(recordingId, 'm4a');
      await Promise.all([
        uploadAudioToAzure(
          stopResult.localUri,
          prep.audioUpload.uploadUrl,
          prep.audioUpload.container,
          prep.audioUpload.blobName,
        ),
        uploadAudioTrackJsonToAzure(
          trackBundle,
          prep.bundleUpload.uploadUrl,
          prep.bundleUpload.container,
          prep.bundleUpload.blobName,
          {
            container: prep.audioUpload.container,
            blobName: prep.audioUpload.blobName,
          },
        ),
      ]);
      await insertCapture({
        ...baseCapture,
        bundleBlobName: prep.bundleUpload.blobName,
        status: 'uploaded',
      });
      await notifyUploadComplete(recordingId, 'm4a');
      uploadedOk = true;
    } catch {
      await insertCapture({
        ...baseCapture,
        bundleBlobName: null,
        status: 'pending',
      }).catch(() => {});
      await enqueueSync({
        id: uuidv4(),
        entityType: 'capture',
        entityId: recordingId,
        operation: 'create',
        createdAt: Date.now(),
        payloadJson: JSON.stringify({
          type: 'audio',
          captureId: recordingId,
          localPath: stopResult.localUri,
          audioExt: 'm4a',
          locale: 'en-US',
          trackBundle,
          sensorRecordId: sensorRecordId ?? null,
          capturedAt: startedAt,
          annotationIndex,
        }),
      }).catch(() => {});
    }

    setPhase('done');
    setStatusLabel(
      uploadedOk
        ? 'Processing in background…'
        : 'Saved offline — will sync when online',
    );
    setTimeout(() => navigation.navigate('AnnotationFeed'), 900);
  };

  // ── Type mode ────────────────────────────────────────────────────────────────

  const handleSaveTyped = async () => {
    const text = typedText.trim();
    if (!text) {
      Alert.alert('Empty note', 'Write something before saving.');
      return;
    }
    setSavingText(true);
    setStatusLabel('Suggesting tags…');
    try {
      const captureId = uuidv4();
      const capturedAt = Date.now();
      const timestamp = formatTimestamp(capturedAt);

      let selectedTags: string[] = [];
      let suggestedTags: string[] = [];
      try {
        const tagRes = await fetchSuggestedDescriptors(text, captureId);
        suggestedTags = tagRes.suggestedDescriptors;
      } catch (e) {
        console.warn('Tag suggestion failed (non-fatal):', e);
      }

      setStatusLabel('Saving…');
      await insertCapture({
        id: captureId,
        sensorRecordId: sensorRecordId ?? null,
        type: 'audio',
        localPath: null,
        bundleBlobName: null,
        imageBlobName: null,
        imageContainer: null,
        status: 'transcribed',
        transcriptJson: null,
        selectedTagsJson: JSON.stringify(selectedTags),
        suggestedTagsJson: JSON.stringify(suggestedTags),
        description: text,
        latitudeDisplay: null,
        longitudeDisplay: null,
        latitudeRaw: null,
        longitudeRaw: null,
        capturedAt,
        annotationIndex,
      });

      await saveAnnotation({
        recordingId: captureId,
        sensorRecordId: sensorRecordId ?? undefined,
        type: 'audio',
        description: text,
        selectedTags,
        timestamp,
        latitude: '00.0000° N',
        longitude: '00.0000° E',
        capturedAtMs: capturedAt,
        annotationIndex,
      });

      navigation.navigate('EditAnnotationTags', { annotationId: captureId });
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? String(err));
    } finally {
      setSavingText(false);
      setStatusLabel('');
    }
  };

  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';
  const isActive = isRecording || isPaused;
  const isBusy = phase === 'uploading' || phase === 'done';

  const pauseAnim = usePressAnimation({ scaleTo: 0.88, haptic: 'light' });
  const actionAnim = usePressAnimation({ scaleTo: 0.96, haptic: 'medium' });
  const modeAnim = usePressAnimation({ scaleTo: 0.94, haptic: 'light' });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.annotationLabel}>
            ANNOTATION #{annotationIndex}
          </Text>
          <View style={styles.headerDivider} />

          {/* Mode toggle — only shown when not mid-recording */}
          {phase === 'idle' && (
            <View style={styles.modeRow}>
              {(['record', 'type'] as InputMode[]).map(m => (
                <TouchableWithoutFeedback
                  key={m}
                  onPress={() => {
                    modeAnim.fireHaptic();
                    setInputMode(m);
                  }}
                  {...modeAnim.handlers}>
                  <Animated.View
                    style={[
                      styles.modeBtn,
                      inputMode === m && styles.modeBtnActive,
                      { transform: [{ scale: modeAnim.scale }] },
                    ]}>
                    {m === 'record' ? (
                      <Mic
                        size={16}
                        color={inputMode === m ? C.white : C.lightGray}
                        strokeWidth={2}
                      />
                    ) : (
                      <Type
                        size={16}
                        color={inputMode === m ? C.white : C.lightGray}
                        strokeWidth={2}
                      />
                    )}
                    <Text
                      style={[
                        styles.modeBtnLabel,
                        inputMode === m && styles.modeBtnLabelActive,
                      ]}>
                      {m === 'record' ? 'Record' : 'Type'}
                    </Text>
                  </Animated.View>
                </TouchableWithoutFeedback>
              ))}
            </View>
          )}

          {/* ── Type mode ── */}
          {inputMode === 'type' && (
            <View style={styles.typeContainer}>
              <TextInput
                style={styles.typeInput}
                placeholder="Describe what you smell…"
                placeholderTextColor={C.lightGray}
                value={typedText}
                onChangeText={setTypedText}
                multiline
                textAlignVertical="top"
                autoFocus
              />
              {statusLabel !== '' && (
                <Text style={styles.statusText}>{statusLabel}</Text>
              )}
              <TouchableWithoutFeedback
                onPress={handleSaveTyped}
                {...actionAnim.handlers}
                disabled={savingText}>
                <Animated.View
                  style={[
                    styles.actionButton,
                    savingText && styles.actionButtonDisabled,
                    { transform: [{ scale: actionAnim.scale }] },
                  ]}>
                  <Text style={styles.actionButtonLabel}>
                    {savingText ? 'Saving…' : 'Save Note'}
                  </Text>
                </Animated.View>
              </TouchableWithoutFeedback>
            </View>
          )}

          {/* ── Record mode ── */}
          {inputMode === 'record' && (
            <>
              <Text style={styles.title}>Voice Note</Text>
              <View style={styles.spacer} />
              <Text style={styles.duration}>{formatDuration(elapsed)}</Text>
              <Waveform isActive={isRecording} />

              <TouchableWithoutFeedback
                onPress={() => {
                  if (isActive) {
                    pauseAnim.fireHaptic();
                    handlePauseResume();
                  }
                }}
                {...pauseAnim.handlers}
                disabled={!isActive}>
                <Animated.View
                  style={[
                    styles.playPauseButton,
                    !isActive && styles.playPauseDisabled,
                    { transform: [{ scale: pauseAnim.scale }] },
                  ]}>
                  {isPaused ? (
                    <Play
                      size={22}
                      color={C.white}
                      fill={C.white}
                      strokeWidth={0}
                    />
                  ) : (
                    <Pause
                      size={22}
                      color={C.white}
                      fill={C.white}
                      strokeWidth={0}
                    />
                  )}
                </Animated.View>
              </TouchableWithoutFeedback>

              <View style={styles.spacer} />

              {statusLabel !== '' && (
                <Text
                  style={[
                    styles.statusText,
                    phase === 'error' && { color: C.error },
                  ]}>
                  {statusLabel}
                </Text>
              )}

              <TouchableWithoutFeedback
                onPress={() => {
                  if (!isBusy) {
                    actionAnim.fireHaptic();
                    isActive ? handleStop() : handleStart();
                  }
                }}
                {...actionAnim.handlers}
                disabled={isBusy}>
                <Animated.View
                  style={[
                    styles.actionButton,
                    isBusy && styles.actionButtonDisabled,
                    { transform: [{ scale: actionAnim.scale }] },
                  ]}>
                  <Text style={styles.actionButtonLabel}>
                    {isActive ? 'Stop Recording' : 'Start Recording'}
                  </Text>
                </Animated.View>
              </TouchableWithoutFeedback>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  scroll: { flexGrow: 1, padding: 16 },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  annotationLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.darkGray,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  headerDivider: { height: 1, backgroundColor: C.border, marginBottom: 20 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  modeBtnActive: { backgroundColor: C.black, borderColor: C.black },
  modeBtnLabel: { fontSize: 14, fontWeight: '600', color: C.lightGray },
  modeBtnLabelActive: { color: C.white },
  typeContainer: { gap: 16 },
  typeInput: {
    fontSize: 15,
    color: C.black,
    lineHeight: 22,
    minHeight: 140,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.black,
    textAlign: 'center',
  },
  spacer: { flex: 1, minHeight: 20 },
  duration: {
    fontSize: 18,
    color: C.darkGray,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 14,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 2,
    marginBottom: 28,
    overflow: 'hidden',
  },
  waveBar: { width: 2.5, borderRadius: 2 },
  playPauseButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.darkGray,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseDisabled: { backgroundColor: C.lightGray },
  statusText: { fontSize: 13, color: C.darkGray, textAlign: 'center' },
  actionButton: {
    backgroundColor: C.black,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonDisabled: { backgroundColor: C.lightGray },
  actionButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.white,
    letterSpacing: 0.3,
  },
});

import React, { useState, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  PanResponder,
  GestureResponderEvent,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { ArrowLeft, Eraser } from 'lucide-react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  Canvas,
  Path,
  Skia,
  useCanvasRef,
  useImage,
  Image as SkiaImage,
} from '@shopify/react-native-skia';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

import { photosPrepare } from '../../services/photos/photosPrepare';
import {
  uploadPhotoToAzure,
  uploadPhotoBundleJsonToAzure,
} from '../../services/photos/photoUpload';
import { notifyPhotoUploadComplete } from '../../services/photos/photoUploadComplete';
import { insertCapture, enqueueSync } from '../../services/database/db';
import { saveAnnotation } from '../../services/annotations/annotationService';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import type { PhotoBundle } from '../../services/photos/photoTypes';

const C = {
  black: '#1A1A1A',
  darkGray: '#4D4D4D',
  lightGray: '#B3B3B3',
  white: '#FAFAFA',
  border: '#E0E0E0',
};

type Point = { x: number; y: number };
type Stroke = {
  id: string;
  points: Point[];
  color: string;
  strokeWidth: number;
};

// HSL (sat=100%, light=50%) + alpha → #RRGGBBAA so Skia always parses correctly
function hslaToHex(hueDeg: number, alpha: number): string {
  const h = hueDeg / 360;
  const q = 1; // l=0.5, s=1 → q = l + s - l*s = 1
  const p = 0; // 2*l - q = 0
  const c = (t: number) => {
    let t2 = ((t % 1) + 1) % 1;
    if (t2 < 1 / 6) {
      return (q - p) * 6 * t2;
    }
    if (t2 < 1 / 2) {
      return q;
    }
    if (t2 < 2 / 3) {
      return p + (q - p) * (2 / 3 - t2) * 6;
    }
    return p;
  };
  const r = Math.round(c(h + 1 / 3) * 255);
  const g = Math.round(c(h) * 255);
  const b = Math.round(c(h - 1 / 3) * 255);
  const a = Math.round(alpha * 255);
  return '#' + [r, g, b, a].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Smooth quadratic-bezier path through midpoints — GPU-friendly, no jagged lines
function buildSkiaPath(points: Point[]) {
  const path = Skia.Path.Make();
  if (points.length === 0) {
    return path;
  }
  if (points.length === 1) {
    path.addCircle(points[0].x, points[0].y, 2);
    return path;
  }
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    path.quadTo(points[i].x, points[i].y, mx, my);
  }
  const last = points[points.length - 1];
  path.lineTo(last.x, last.y);
  return path;
}

// Proximity eraser — finds closest stroke within threshold pixels
function closestStrokeId(
  strokes: Stroke[],
  x: number,
  y: number,
  threshold = 18,
): string | null {
  let best: string | null = null;
  let bestDist = threshold;
  for (const s of strokes) {
    for (const pt of s.points) {
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = s.id;
      }
    }
  }
  return best;
}

// Memoised per-stroke renderer — only rebuilds Skia path when points change
const SkiaStroke = memo(({ stroke }: { stroke: Stroke }) => {
  const path = useMemo(() => buildSkiaPath(stroke.points), [stroke.points]);
  return (
    <Path
      path={path}
      color={stroke.color}
      style="stroke"
      strokeWidth={stroke.strokeWidth}
      strokeCap="round"
      strokeJoin="round"
    />
  );
});

// ── Slider control (PanResponder-based, unchanged) ─────────────────────────────

const Slider = ({
  value,
  onChange,
  track,
}: {
  value: number;
  onChange: (v: number) => void;
  track: React.ReactNode;
}) => {
  const tw = useRef(0);
  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) =>
        onChange(
          Math.min(1, Math.max(0, e.nativeEvent.locationX / (tw.current || 1))),
        ),
      onPanResponderMove: (e: GestureResponderEvent) =>
        onChange(
          Math.min(1, Math.max(0, e.nativeEvent.locationX / (tw.current || 1))),
        ),
    }),
  ).current;
  return (
    <View
      style={styles.sliderTrackWrap}
      onLayout={e => {
        tw.current = e.nativeEvent.layout.width;
      }}
      {...pr.panHandlers}>
      {track}
      <View
        style={[
          styles.sliderThumb,
          { left: `${(value * 100).toFixed(1)}%` as any },
        ]}
      />
    </View>
  );
};

const HUE_STOPS = [
  '#ff0000',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#0000ff',
  '#ff00ff',
  '#ff0000',
];
const HueTrack = () => (
  <View style={styles.hueTrack}>
    {HUE_STOPS.slice(0, -1).map((c, i) => (
      <View key={i} style={[styles.hueStop, { backgroundColor: c }]} />
    ))}
  </View>
);
const OpacityTrack = ({ hue }: { hue: number }) => (
  <View style={styles.opacityTrack}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.lightGray }]} />
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: `hsl(${hue},100%,50%)` },
      ]}
    />
  </View>
);
const WidthTrack = () => (
  <View style={styles.widthTrack}>
    {Array.from({ length: 20 }).map((_, i) => (
      <View key={i} style={[styles.widthStop, { height: 1 + i * 0.5 }]} />
    ))}
  </View>
);

// ── Skia drawing canvas ────────────────────────────────────────────────────────

const DrawingCanvas = ({
  strokes,
  onAddStroke,
  onErase,
  currentColor,
  strokeWidth,
  isErasing,
  photoUri,
  canvasRef,
}: {
  strokes: Stroke[];
  onAddStroke: (s: Stroke) => void;
  onErase: (id: string) => void;
  currentColor: string;
  strokeWidth: number;
  isErasing: boolean;
  photoUri: string;
  canvasRef: React.RefObject<any>;
}) => {
  const photoImage = useImage(photoUri);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const pts = useRef<Point[]>([]);
  const activeId = useRef<string | null>(null);
  const [livePoints, setLivePoints] = useState<Point[]>([]);

  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        if (isErasing) {
          const hit = closestStrokeId(strokes, x, y);
          if (hit) {
            onErase(hit);
          }
          return;
        }
        activeId.current = `s-${Date.now()}`;
        pts.current = [{ x, y }];
        setLivePoints([{ x, y }]);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        if (isErasing) {
          const { locationX: x, locationY: y } = e.nativeEvent;
          const hit = closestStrokeId(strokes, x, y);
          if (hit) {
            onErase(hit);
          }
          return;
        }
        const pt = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        pts.current = [...pts.current, pt];
        setLivePoints(prev => [...prev, pt]);
      },
      onPanResponderRelease: () => {
        if (isErasing || pts.current.length < 2) {
          pts.current = [];
          setLivePoints([]);
          return;
        }
        onAddStroke({
          id: activeId.current!,
          points: [...pts.current],
          color: currentColor,
          strokeWidth,
        });
        pts.current = [];
        activeId.current = null;
        setLivePoints([]);
      },
    }),
  ).current;

  const livePath = useMemo(() => buildSkiaPath(livePoints), [livePoints]);

  return (
    <View
      style={styles.canvas}
      {...pr.panHandlers}
      onLayout={e =>
        setCanvasSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }>
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
        {photoImage && canvasSize.w > 0 && (
          <SkiaImage
            image={photoImage}
            x={0}
            y={0}
            width={canvasSize.w}
            height={canvasSize.h}
            fit="cover"
          />
        )}
        {strokes.map(s => (
          <SkiaStroke key={s.id} stroke={s} />
        ))}
        {livePoints.length > 1 && (
          <Path
            path={livePath}
            color={currentColor}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        )}
      </Canvas>
      {isErasing && (
        <View style={styles.eraserHint}>
          <Text style={styles.eraserHintText}>Draw over a stroke to erase</Text>
        </View>
      )}
    </View>
  );
};

// ── Screen ─────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'PhotoAnnotation'>;

export default function PhotoAnnotationScreen({ navigation, route }: Props) {
  const {
    annotationIndex,
    photoUri,
    timestamp,
    capturedAtMs,
    latitude,
    longitude,
    latitudeRaw,
    longitudeRaw,
    accuracyM,
    sensorRecordId,
  } = route.params;

  const canvasRef = useCanvasRef();

  const [description, setDescription] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [hue, setHue] = useState(0.33); // 0–1
  const [opacity, setOpacity] = useState(0.85); // 0–1
  const [width, setWidth] = useState(0.25); // 0–1 → maps to 1.5–10px
  const [isErasing, setIsErasing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const hueDeg = hue * 360;
  const strokeWidth = 1.5 + width * 8.5;
  const currentColor = hslaToHex(hueDeg, opacity);

  const backAnim = usePressAnimation({ scaleTo: 0.8, haptic: 'light' });
  const eraserAnim = usePressAnimation({ scaleTo: 0.9, haptic: 'light' });
  const saveAnim = usePressAnimation({ scaleTo: 0.96, haptic: 'medium' });

  const handleSave = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const captureId = uuidv4();

      // Composite drawing into photo
      setSaveStatus('Compositing drawing…');
      let uploadUri = photoUri;
      const snapshot = canvasRef.current?.makeImageSnapshot();
      if (snapshot) {
        const pngBytes = snapshot.encodeToBytes();
        const base64 = Buffer.from(pngBytes).toString('base64');
        const tempPath =
          RNFS.TemporaryDirectoryPath.replace(/\/$/, '') +
          `/${captureId}_annotated.png`;
        await RNFS.writeFile(tempPath, base64, 'base64');
        uploadUri = 'file://' + tempPath;
      }

      const gpsPoint =
        latitudeRaw !== null && longitudeRaw !== null
          ? {
              t_ms: 0,
              lat: latitudeRaw,
              lon: longitudeRaw,
              accuracy_m: accuracyM ?? undefined,
            }
          : null;

      const serialisedStrokes = strokes.map(s => ({
        id: s.id,
        points: s.points,
        color: s.color,
        shape: (s.strokeWidth - 1.5) / 8.5,
      }));

      const baseCapture = {
        id: captureId,
        sensorRecordId: sensorRecordId ?? null,
        type: 'photo' as const,
        localPath: uploadUri,
        transcriptJson: null,
        selectedTagsJson: null,
        suggestedTagsJson: null,
        description,
        latitudeDisplay: latitude,
        longitudeDisplay: longitude,
        latitudeRaw: latitudeRaw ?? null,
        longitudeRaw: longitudeRaw ?? null,
        capturedAt: capturedAtMs,
        annotationIndex,
      };

      // Try upload — on failure, save locally and queue for retry
      let uploadedOk = false;
      try {
        setSaveStatus('Preparing upload…');
        const prep = await photosPrepare(captureId, 'png');
        const bundle: PhotoBundle = {
          schema: 'photo_gps_bundle_v1',
          captured_at_ms: capturedAtMs,
          photo: {
            container: prep.imageUpload.container,
            blobName: prep.imageUpload.blobName,
            contentType: 'image/png',
          },
          point: gpsPoint,
        };

        setSaveStatus('Uploading photo…');
        await Promise.all([
          uploadPhotoToAzure(
            uploadUri,
            prep.imageUpload.uploadUrl,
            prep.imageUpload.container,
            prep.imageUpload.blobName,
          ),
          uploadPhotoBundleJsonToAzure(
            bundle,
            prep.bundleUpload.uploadUrl,
            prep.bundleUpload.container,
            prep.bundleUpload.blobName,
          ),
        ]);

        setSaveStatus('Verifying upload…');
        await notifyPhotoUploadComplete(
          captureId,
          prep.imageUpload.blobName,
          prep.bundleUpload.blobName,
        );
        await insertCapture({
          ...baseCapture,
          bundleBlobName: prep.bundleUpload.blobName,
          imageBlobName: prep.imageUpload.blobName,
          imageContainer: prep.imageUpload.container,
          status: 'uploaded',
        });

        setSaveStatus('Saving annotation…');
        await saveAnnotation({
          recordingId: captureId,
          sensorRecordId: sensorRecordId ?? undefined,
          type: 'photo',
          description,
          strokes: serialisedStrokes,
          selectedTags: [],
          timestamp,
          latitude,
          longitude,
          latitudeRaw: latitudeRaw ?? undefined,
          longitudeRaw: longitudeRaw ?? undefined,
          accuracyM: accuracyM ?? undefined,
          capturedAtMs,
          photoUri: uploadUri,
          annotationIndex,
          imageBlobName: prep.imageUpload.blobName,
          imageContainer: prep.imageUpload.container,
          bundleBlobName: prep.bundleUpload.blobName,
          bundleContainer: prep.bundleUpload.container,
        });
        uploadedOk = true;
      } catch {
        // Copy composited image from temp to permanent storage so it survives
        let permanentUri = uploadUri;
        try {
          const permanentPath =
            RNFS.DocumentDirectoryPath.replace(/\/$/, '') +
            `/pending_${captureId}.png`;
          await RNFS.copyFile(
            uploadUri.replace(/^file:\/\//, ''),
            permanentPath,
          );
          permanentUri = 'file://' + permanentPath;
        } catch {}

        await insertCapture({
          ...baseCapture,
          localPath: permanentUri,
          bundleBlobName: null,
          imageBlobName: null,
          imageContainer: null,
          status: 'pending',
        }).catch(() => {});
        await enqueueSync({
          id: uuidv4(),
          entityType: 'capture',
          entityId: captureId,
          operation: 'create',
          createdAt: Date.now(),
          payloadJson: JSON.stringify({
            type: 'photo',
            captureId,
            compositedUri: permanentUri,
            gpsPoint,
            description,
            strokesJson: JSON.stringify(serialisedStrokes),
            selectedTags: [],
            timestamp,
            latitude,
            longitude,
            latitudeRaw: latitudeRaw ?? null,
            longitudeRaw: longitudeRaw ?? null,
            accuracyM: accuracyM ?? null,
            capturedAtMs,
            sensorRecordId: sensorRecordId ?? null,
            annotationIndex,
          }),
        }).catch(() => {});
      }

      if (uploadedOk) {
        navigation.navigate('EditAnnotationTags', { annotationId: captureId });
      } else {
        navigation.navigate('AnnotationFeed');
      }
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? String(err));
    } finally {
      setSaving(false);
      setSaveStatus('');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.topBar}>
            <TouchableWithoutFeedback
              onPress={() => {
                backAnim.fireHaptic();
                navigation.goBack();
              }}
              {...backAnim.handlers}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Animated.View style={{ transform: [{ scale: backAnim.scale }] }}>
                <ArrowLeft size={20} color={C.darkGray} strokeWidth={2} />
              </Animated.View>
            </TouchableWithoutFeedback>
            <View style={styles.topBarMeta}>
              <Text style={styles.timestamp}>{timestamp}</Text>
              <View style={styles.coordsBlock}>
                <Text style={styles.coords}>{latitude}</Text>
                <Text style={styles.coords}>{longitude}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.annotationLabel}>
            ANNOTATION #{annotationIndex}
          </Text>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Write a description…"
            placeholderTextColor={C.lightGray}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.divider} />

          {/* Toolbar */}
          <View style={styles.toolbar}>
            <TouchableWithoutFeedback
              onPress={() => {
                eraserAnim.fireHaptic();
                setIsErasing(e => !e);
              }}
              {...eraserAnim.handlers}>
              <Animated.View
                style={[
                  styles.eraserButton,
                  isErasing && styles.eraserButtonActive,
                  { transform: [{ scale: eraserAnim.scale }] },
                ]}>
                <Eraser
                  size={18}
                  color={isErasing ? C.white : C.lightGray}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    styles.eraserLabel,
                    isErasing && styles.eraserLabelActive,
                  ]}>
                  Eraser
                </Text>
              </Animated.View>
            </TouchableWithoutFeedback>
            <View style={styles.strokePreview}>
              <View
                style={[
                  styles.strokePreviewLine,
                  {
                    height: strokeWidth,
                    backgroundColor: currentColor,
                    borderRadius: strokeWidth / 2,
                  },
                ]}
              />
            </View>
            <View
              style={[styles.colorDot, { backgroundColor: currentColor }]}
            />
          </View>

          {/* Photo + drawing canvas — photo rendered inside Skia so snapshot composites both */}
          <View style={styles.photoWrapper}>
            <DrawingCanvas
              strokes={strokes}
              onAddStroke={s => setStrokes(p => [...p, s])}
              onErase={id => setStrokes(p => p.filter(s => s.id !== id))}
              currentColor={currentColor}
              strokeWidth={strokeWidth}
              isErasing={isErasing}
              photoUri={photoUri}
              canvasRef={canvasRef}
            />
          </View>

          {/* Sliders */}
          <Text style={styles.sliderLabel}>Hue</Text>
          <Slider value={hue} onChange={setHue} track={<HueTrack />} />
          <Text style={styles.sliderLabel}>Opacity</Text>
          <Slider
            value={opacity}
            onChange={setOpacity}
            track={<OpacityTrack hue={hueDeg} />}
          />
          <Text style={styles.sliderLabel}>Width</Text>
          <Slider value={width} onChange={setWidth} track={<WidthTrack />} />

          {saving && saveStatus !== '' && (
            <Text style={styles.statusLabel}>{saveStatus}</Text>
          )}

          <TouchableWithoutFeedback
            onPress={handleSave}
            {...saveAnim.handlers}
            disabled={saving}>
            <Animated.View
              style={[
                styles.saveButton,
                saving && styles.saveButtonBusy,
                { transform: [{ scale: saveAnim.scale }] },
              ]}>
              <Text style={styles.saveButtonLabel}>
                {saving ? 'Saving…' : 'Save Annotation'}
              </Text>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hueStop: { flex: 1 },
  widthStop: {
    flex: 1,
    backgroundColor: C.darkGray,
    borderRadius: 1,
    alignSelf: 'center',
  },
  safe: { flex: 1, backgroundColor: C.white },
  scrollContent: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  topBarMeta: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timestamp: { fontSize: 13, color: C.darkGray },
  coordsBlock: { alignItems: 'flex-end' },
  coords: { fontSize: 12, color: C.darkGray, lineHeight: 17 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  annotationLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.darkGray,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  descriptionInput: {
    fontSize: 14,
    color: C.black,
    lineHeight: 20,
    minHeight: 48,
    marginBottom: 12,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eraserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  eraserButtonActive: { backgroundColor: C.darkGray, borderColor: C.darkGray },
  eraserLabel: { fontSize: 13, color: C.lightGray },
  eraserLabelActive: { color: C.white },
  strokePreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  strokePreviewLine: { width: '80%' },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  photoWrapper: {
    height: 280,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#111',
    marginBottom: 20,
  },
  canvas: { ...StyleSheet.absoluteFillObject },
  eraserHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  eraserHintText: { fontSize: 11, color: C.white },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.black,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  sliderTrackWrap: { height: 28, justifyContent: 'center', marginBottom: 20 },
  hueTrack: {
    height: 12,
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  opacityTrack: { height: 12, borderRadius: 6, overflow: 'hidden' },
  widthTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 3,
    overflow: 'hidden',
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.darkGray,
    marginLeft: -10,
    top: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  statusLabel: {
    fontSize: 13,
    color: C.darkGray,
    textAlign: 'center',
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: C.black,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonBusy: { backgroundColor: C.lightGray },
  saveButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.white,
    letterSpacing: 0.3,
  },
});

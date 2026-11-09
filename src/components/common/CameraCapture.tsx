import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import type { CameraRuntimeError } from 'react-native-vision-camera';
import ImageEditor from '@react-native-community/image-editor';
import { unlink } from 'react-native-fs';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS } from '../../consts';
import { Check, RefreshCw, X, Zap, ZapOff } from 'lucide-react-native';

interface CameraCaptureProps {
  onClose: () => void;
  onPhotoTaken: (photoPath: string) => void;
}

type FlashMode = 'auto' | 'on' | 'off';
type CameraPosition = 'back' | 'front';

const OUTPUT_SIZE = 1024;
const JPEG_QUALITY = 0.9;

const FLASH_CYCLE: Record<FlashMode, FlashMode> = {
  auto: 'on',
  on: 'off',
  off: 'auto',
};

const FLASH_LABEL: Record<FlashMode, string> = {
  auto: 'Auto',
  on: 'On',
  off: 'Off',
};

const stripScheme = (p: string) => p.replace(/^file:\/\//, '');

const removeFile = async (path: string | null | undefined) => {
  if (!path) {
    return;
  }
  try {
    await unlink(stripScheme(path));
  } catch {
    // Already gone, nothing to clean up.
  }
};

const cropCenterSquare = async (uri: string, w: number, h: number) => {
  const side = Math.min(w, h);
  const out = Math.min(side, OUTPUT_SIZE);

  const x = Math.max(0, Math.round((w - side) / 2));
  const y = Math.max(0, Math.round((h - side) / 2));

  const cropped: any = await ImageEditor.cropImage(uri, {
    offset: { x, y },
    size: { width: side, height: side },
    displaySize: { width: out, height: out },
    resizeMode: 'cover',
    format: 'jpeg',
    quality: JPEG_QUALITY,
  });

  return typeof cropped === 'string' ? cropped : (cropped.uri as string);
};

type IconProps = { size?: number; color?: string; strokeWidth?: number };

const Icon = ({
  size = 22,
  color = COLORS.white,
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

const CameraGlyph = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <Circle cx="12" cy="13" r="3" />
  </Icon>
);

export default function CameraCapture({
  onClose,
  onPhotoTaken,
}: CameraCaptureProps) {
  const { width } = useWindowDimensions();
  const previewSize = width - 24;

  const cameraRef = useRef<Camera>(null);

  const [position, setPosition] = useState<CameraPosition>('back');
  const [flash, setFlash] = useState<FlashMode>('auto');

  const device = useCameraDevice(position);
  const hasOtherCamera =
    useCameraDevice(position === 'back' ? 'front' : 'back') != null;

  const format = useCameraFormat(device, [
    { photoAspectRatio: 4 / 3 },
    { photoResolution: { width: 2048, height: 1536 } },
  ]);

  const { hasPermission, requestPermission } = useCameraPermission();

  const [isCapturing, setIsCapturing] = useState(false);
  const [reviewPath, setReviewPath] = useState<string | null>(null);

  const [isReady, setIsReady] = useState(false);

  const pendingPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    setIsReady(false);
  }, [device?.id]);

  useEffect(
    () => () => {
      removeFile(pendingPathRef.current);
    },
    [],
  );

  const handleCameraError = useCallback((error: CameraRuntimeError) => {
    console.error('Camera error:', error.code, error.message);
  }, []);

  const takePhoto = useCallback(async () => {
    if (isCapturing || !isReady || !cameraRef.current || !device) {
      return;
    }

    setIsCapturing(true);

    let originalPath: string | null = null;

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: device.hasFlash ? flash : 'off',
        enableShutterSound: true,
      });

      originalPath = photo.path;
      const sourceUri = `file://${stripScheme(photo.path)}`;

      const rotated =
        photo.orientation === 'portrait' ||
        photo.orientation === 'portrait-upside-down';
      const w = rotated ? photo.height : photo.width;
      const h = rotated ? photo.width : photo.height;

      let croppedUri: string;
      try {
        croppedUri = await cropCenterSquare(sourceUri, w, h);
      } catch (firstError) {
        console.warn('Crop failed, retrying with swapped size:', firstError);
        croppedUri = await cropCenterSquare(sourceUri, h, w);
      }

      pendingPathRef.current = stripScheme(croppedUri);
      setReviewPath(pendingPathRef.current);
    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Could not take photo', 'Please try again.');
    } finally {
      removeFile(originalPath);
      setIsCapturing(false);
    }
  }, [device, flash, isCapturing, isReady]);

  const retake = useCallback(async () => {
    const path = pendingPathRef.current;
    pendingPathRef.current = null;
    setReviewPath(null);
    await removeFile(path);
  }, []);

  const usePhoto = useCallback(() => {
    const path = pendingPathRef.current;
    if (!path) {
      return;
    }

    pendingPathRef.current = null;
    onPhotoTaken(path);
    onClose();
  }, [onClose, onPhotoTaken]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.messageView}>
          <View style={styles.messageIcon}>
            <CameraGlyph size={28} />
          </View>
          <Text style={styles.messageTitle}>Camera access needed</Text>
          <Text style={styles.messageText}>
            Allow camera access to take a photo of the sample.
          </Text>

          <TouchableOpacity
            onPress={requestPermission}
            style={styles.primaryButton}
            accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Allow camera</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClose}
            style={styles.textButton}
            accessibilityRole="button">
            <Text style={styles.textButtonLabel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.messageView}>
          <View style={styles.messageIcon}>
            <CameraGlyph size={28} />
          </View>
          <Text style={styles.messageTitle}>No camera found</Text>
          <Text style={styles.messageText}>
            This device doesn't have a camera that can be used here.
          </Text>

          <TouchableOpacity
            onPress={handleClose}
            style={styles.primaryButton}
            accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const reviewing = reviewPath !== null;
  const shutterDisabled = isCapturing || !isReady;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        {reviewing ? (
          <View style={styles.roundButtonSpacer} />
        ) : (
          <TouchableOpacity
            style={styles.roundButton}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close camera">
            <X color={COLORS.bg} />
          </TouchableOpacity>
        )}

        <Text style={styles.headerTitle} accessibilityRole="header">
          {reviewing ? 'Review photo' : 'Camera'}
        </Text>

        {!reviewing && device.hasFlash ? (
          <TouchableOpacity
            style={styles.flashButton}
            onPress={() => setFlash(f => FLASH_CYCLE[f])}
            accessibilityRole="button"
            accessibilityLabel={`Flash ${FLASH_LABEL[flash]}`}>
            {flash === 'off' ? (
              <Zap color={COLORS.bg} size={16} />
            ) : (
              <ZapOff color={COLORS.bg} size={16} />
            )}
            <Text style={styles.flashLabel}>{FLASH_LABEL[flash]}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.roundButtonSpacer} />
        )}
      </View>

      <View style={styles.stage}>
        <View
          style={[styles.square, { width: previewSize, height: previewSize }]}>
          <Camera
            ref={cameraRef}
            photo={true}
            device={device}
            format={format}
            isActive={!reviewing}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
            onInitialized={() => setIsReady(true)}
            onError={handleCameraError}
          />

          {reviewing && (
            <Image
              source={{ uri: `file://${reviewPath}` }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibilityLabel="Captured photo"
            />
          )}

          {(isCapturing || (!isReady && !reviewing)) && (
            <View style={styles.processing}>
              <ActivityIndicator size="large" color={COLORS.white} />
            </View>
          )}
        </View>

        {reviewing && (
          <Text style={styles.reviewHint}>
            Looks good? You can replace it any time before saving.
          </Text>
        )}
      </View>

      {reviewing ? (
        <View style={styles.reviewControls}>
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={retake}
            accessibilityRole="button"
            accessibilityLabel="Retake photo">
            <RefreshCw color={COLORS.bg} size={16} />
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.useButton}
            onPress={usePhoto}
            accessibilityRole="button"
            accessibilityLabel="Use this photo">
            <Check color={COLORS.bg} size={16} />
            <Text style={styles.useText}>Use photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.controls}>
          <View style={styles.controlSide} />

          <TouchableOpacity
            onPress={takePhoto}
            disabled={shutterDisabled}
            style={[styles.shutter, shutterDisabled && styles.shutterBusy]}
            accessibilityRole="button"
            accessibilityLabel="Take photo">
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <View style={styles.controlSide}>
            {hasOtherCamera && (
              <TouchableOpacity
                style={styles.roundButton}
                onPress={() =>
                  setPosition(p => (p === 'back' ? 'front' : 'back'))
                }
                disabled={isCapturing}
                accessibilityRole="button"
                accessibilityLabel="Switch camera">
                <RefreshCw color={COLORS.bg} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.ink,
  },

  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.bg,
  },

  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  roundButtonSpacer: {
    width: 44,
    height: 44,
  },

  flashButton: {
    minWidth: 44,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: COLORS.muted,
  },

  flashLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.white,
  },

  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  square: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  hintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
  },

  hint: {
    fontSize: 13,
    color: COLORS.white,
    backgroundColor: COLORS.hintBg,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    overflow: 'hidden',
  },

  processing: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,18,16,0.45)',
  },

  reviewHint: {
    marginTop: 16,
    paddingHorizontal: 16,
    textAlign: 'center',
    fontSize: 14,
    color: COLORS.muted,
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 12,
    paddingBottom: 32,
  },

  controlSide: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },

  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  shutterBusy: {
    opacity: 0.5,
  },

  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.white,
  },

  reviewControls: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },

  retakeButton: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  retakeText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.white,
  },

  useButton: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  useText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.white,
  },

  messageView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  messageIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  messageTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },

  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 28,
  },

  primaryButton: {
    minWidth: 220,
    height: 54,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.white,
  },

  textButton: {
    minHeight: 48,
    marginTop: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textButtonLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.muted,
  },
});

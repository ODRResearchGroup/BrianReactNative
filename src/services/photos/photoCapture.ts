import { PermissionsAndroid, Platform } from 'react-native';
import {
  launchCamera,
  type ImagePickerResponse,
  type Asset,
} from 'react-native-image-picker';

export type CapturedPhoto = { uri: string; fileName: string | null };

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function pickFirstAsset(result: ImagePickerResponse): Asset | null {
  return result.assets?.[0] ?? null;
}

export async function capturePhoto(): Promise<CapturedPhoto> {
  const ok = await ensureCameraPermission();
  if (!ok) {
    throw new Error('Camera permission denied');
  }

  const result = await launchCamera({
    mediaType: 'photo',
    cameraType: 'back',
    saveToPhotos: false,
    includeExtra: false,
    quality: 0.9,
  });

  if (result.didCancel) {
    throw new Error('Cancelled');
  }
  if (result.errorCode) {
    throw new Error(result.errorMessage ?? result.errorCode);
  }

  const asset = pickFirstAsset(result);
  if (!asset || !asset.uri) {
    throw new Error('No photo returned');
  }

  return { uri: asset.uri, fileName: asset.fileName ?? null };
}

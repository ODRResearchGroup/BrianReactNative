import { Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

export type FullLocationAccessResult =
  | { granted: true }
  | { granted: false; reason: 'foreground' | 'background' | 'ios' | 'request' };

const isGranted = (permission: string | undefined) =>
  permission === PermissionsAndroid.RESULTS.GRANTED;

export async function ensureFullLocationAccess(): Promise<FullLocationAccessResult> {
  if (Platform.OS === 'android') {
    try {
      const foregroundPermissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ];
      const foregroundStatus = await PermissionsAndroid.requestMultiple(
        foregroundPermissions,
      );

      if (
        !isGranted(
          foregroundStatus[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION],
        )
      ) {
        return { granted: false, reason: 'foreground' };
      }

      if (Platform.Version >= 29) {
        const backgroundStatus = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
        );

        if (!isGranted(backgroundStatus)) {
          return { granted: false, reason: 'background' };
        }
      }

      return { granted: true };
    } catch (error) {
      console.error('Unable to request full location access:', error);
      return { granted: false, reason: 'request' };
    }
  }

  try {
    const authorization = await Geolocation.requestAuthorization('always');
    return authorization === 'granted'
      ? { granted: true }
      : { granted: false, reason: 'ios' };
  } catch (error) {
    console.error('Unable to request full iOS location access:', error);
    return { granted: false, reason: 'request' };
  }
}

export async function openLocationSettings(): Promise<void> {
  await Linking.openSettings();
}

export function locationAccessMessage(
  result: Exclude<FullLocationAccessResult, { granted: true }>,
): string {
  if (result.reason === 'background') {
    return 'Allow background location access so GPS points continue to be recorded while the phone is locked or the app is in the background. In Settings, choose “Allow all the time” for BRIAN.';
  }

  if (result.reason === 'ios') {
    return 'Allow “Always” location access and make sure Precise Location is enabled for BRIAN. This is required to include GPS coordinates in the walk CSV.';
  }

  return 'Allow precise location access for BRIAN. Choose “While using the app” first, then allow “All the time” if your phone asks. A walk cannot start without full GPS access because its CSV must include location data.';
}

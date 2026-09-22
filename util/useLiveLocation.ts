import {useState, useEffect} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation, {
  GeoPosition,
  GeoError,
} from 'react-native-geolocation-service';

type Coordinates = {latitude: number; longitude: number};

export default function useLiveLocation() {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        // Request both coarse and fine location permissions
        const fine = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message:
              'This app requires access to your location for live updates.',
            buttonPositive: 'OK',
          },
        );

        const coarse = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        );

        return (
          fine === PermissionsAndroid.RESULTS.GRANTED ||
          coarse === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        console.error('Permission error:', err);
        setError('Failed to request location permission');
        return false;
      }
    }

    // iOS permissions handled via Info.plist
    return true;
  };

  useEffect(() => {
    let watchId: number | null = null;

    const startWatching = async () => {
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setError('Location permission denied');
        return;
      }

      // 🧭 One-time position fetch (with retry)
      Geolocation.getCurrentPosition(
        (pos: GeoPosition) => {
          console.log('📍 One-time position:', pos.coords);
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err: GeoError) => {
          console.error('❌ getCurrentPosition error:', err);
          setError(err.message);

          // 🕐 Retry once after timeout (code 3 = TIMEOUT)
          if (err.code === 3) {
            setTimeout(() => {
              console.log('⏳ Retrying one-time location fetch...');
              Geolocation.getCurrentPosition(
                (retryPos: GeoPosition) => {
                  console.log('📍 Retry position:', retryPos.coords);
                  setLocation({
                    latitude: retryPos.coords.latitude,
                    longitude: retryPos.coords.longitude,
                  });
                  setError(null);
                },
                (retryErr: GeoError) => {
                  console.error('❌ Retry getCurrentPosition error:', retryErr);
                  setError(retryErr.message);
                },
                {
                  enableHighAccuracy: true,
                  timeout: 20000, // give more time
                  maximumAge: 0,
                  forceRequestLocation: true,
                  showLocationDialog: true,
                },
              );
            }, 3000);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 20000, // increased from 15000 → 20000
          maximumAge: 0,
          forceRequestLocation: true,
          showLocationDialog: true,
        },
      );

      // 🛰️ Continuous updates (watchPosition)
      watchId = Geolocation.watchPosition(
        (pos: GeoPosition) => {
          console.log('📡 Position update:', pos.coords);
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err: GeoError) => {
          console.error('❌ Geolocation error:', err);
          setError(err.message);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 0,
          interval: 2000,
          fastestInterval: 1000,
          forceRequestLocation: true,
          showLocationDialog: true,
        },
      );
    };

    startWatching();

    return () => {
      try {
        if (watchId != null) {
          Geolocation.clearWatch(watchId as number);
          Geolocation.stopObserving();
        }
      } catch (err) {
        console.warn('Error clearing geolocation watcher:', err);
      }
    };
  }, []);

  return {location, error};
}

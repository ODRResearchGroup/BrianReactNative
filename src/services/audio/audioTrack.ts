import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

export type TrackPoint = { t_ms: number; lat: number; lon: number };

export type AudioTrackBundle = {
  schema: 'audio_gps_track_v1';
  recording_started_at_ms: number;
  metrics: { minMeters: number; maxGapMs: number };
  points: TrackPoint[];
};

const MIN_METERS = 3;
const MAX_GAP_MS = 1000;

let watchId: number | null = null;
let startedAtMs: number | null = null;
let points: TrackPoint[] = [];

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function haversineMeters(a: TrackPoint, b: TrackPoint) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function shouldKeep(next: TrackPoint) {
  if (points.length === 0) {
    return true;
  }
  const last = points[points.length - 1];
  return (
    haversineMeters(last, next) >= MIN_METERS ||
    next.t_ms - last.t_ms >= MAX_GAP_MS
  );
}

export async function startAudioTrack(recordingStartedAtMs: number) {
  const ok = await ensureLocationPermission();
  if (!ok) {
    throw new Error('Location permission denied');
  }

  startedAtMs = recordingStartedAtMs;
  points = [];

  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }

  watchId = Geolocation.watchPosition(
    pos => {
      if (startedAtMs === null) {
        return;
      }
      const next: TrackPoint = {
        t_ms: Date.now() - startedAtMs,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
      if (shouldKeep(next)) {
        points.push(next);
      }
    },
    err => {
      console.error(err);
    },
    {
      enableHighAccuracy: true,
      distanceFilter: 0,
      interval: 1000,
      fastestInterval: 1000,
    },
  );
}

export function stopAudioTrack(): AudioTrackBundle {
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }
  const start = startedAtMs ?? Date.now();
  startedAtMs = null;
  return {
    schema: 'audio_gps_track_v1',
    recording_started_at_ms: start,
    metrics: { minMeters: MIN_METERS, maxGapMs: MAX_GAP_MS },
    points,
  };
}

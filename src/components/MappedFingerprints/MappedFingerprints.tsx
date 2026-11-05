import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
  MarkerView,
} from '@rnmapbox/maps';
import { FeatureCollection, Feature, Point } from 'geojson';
import useLiveLocation from '../../hooks/useLiveLocation';
import { listSensorRecords, SensorRecord } from '../../services/database/db';
import { SavedFingerprintData } from '../../types/fingerprintTypes';
import FingerprintMapCard from './FingerprintMapCard';
import FingerprintDetailView from '../common/FingerprintDetailView';

const USER_ZOOM = 15;
const FALLBACK_ZOOM = 10;
const FALLBACK_CENTER: [number, number] = [10, 50];
const FALLBACK_WORLD_ZOOM = 3;

const CARD_MIN_ZOOM = 13;
const MAX_CARDS = 30;

const userPointStyle = {
  circleColor: '#007aff',
  circleRadius: 8,
  circleStrokeWidth: 2,
  circleStrokeColor: '#fff',
};

const fingerprintPointStyle = {
  circleColor: '#ff7043',
  circleRadius: 5,
  circleStrokeWidth: 2,
  circleStrokeColor: '#fff',
};

type Viewport = {
  zoom: number;
  bounds?: { ne: [number, number]; sw: [number, number] };
};

function isValidCoordinate(
  c: { latitude: number; longitude: number } | null | undefined,
): c is { latitude: number; longitude: number } {
  return (
    !!c &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180 &&
    !(c.latitude === 0 && c.longitude === 0)
  );
}

const isFingerprint = (r: SensorRecord) => r.recordType !== 'walk_sample';

function recordToLegacy(record: SensorRecord): SavedFingerprintData {
  return {
    fingerprint: {
      type: 'sensor_reading',
      timestamp: new Date(record.recordedAt),
      source: 'BLE Device',
      olfactoryData: {
        readings: {
          CH4: record.ch4 ?? 0,
          NH3: record.nh3 ?? 0,
          HCHO: record.hcho ?? 0,
          VOC: record.voc ?? 0,
          Odour: record.odour ?? 0,
          H2S: record.h2s ?? 0,
          Etoh: record.etoh ?? 0,
          NO2: record.no2 ?? 0,
        },
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
    },
    location:
      record.latitude !== null && record.longitude !== null
        ? { latitude: record.latitude, longitude: record.longitude }
        : null,
    fingerprintTitle: { title: record.title },
    humanDescription: { description: record.description },
    photoPath: record.photoPath ?? undefined,
    timestamp: new Date(record.recordedAt).toISOString(),
  };
}

export default function MappedFingerprints() {
  const [records, setRecords] = useState<SensorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<SensorRecord | null>(
    null,
  );
  const [mapReady, setMapReady] = useState(false);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  focusedIdRef.current = focusedId;
  const lastFeaturePressRef = useRef(0);
  const cameraRef = useRef<React.ElementRef<typeof Camera> | null>(null);
  const centeredOnUserRef = useRef(false);
  const centeredOnFallbackRef = useRef(false);
  const { location } = useLiveLocation();

  const validLocation = isValidCoordinate(location) ? location : null;
  const userLat = validLocation?.latitude;
  const userLng = validLocation?.longitude;

  const fingerprints = useMemo(() => records.filter(isFingerprint), [records]);

  const firstLocatedRecord = fingerprints.find(
    r => r.latitude !== null && r.longitude !== null,
  );

  const defaultZoom =
    userLat !== undefined && userLng !== undefined
      ? USER_ZOOM
      : firstLocatedRecord
      ? FALLBACK_ZOOM
      : FALLBACK_WORLD_ZOOM;

  const effectiveZoom = viewport?.zoom ?? defaultZoom;
  const effectiveZoomRef = useRef(effectiveZoom);
  effectiveZoomRef.current = effectiveZoom;

  const visibleCards = useMemo(() => {
    if (effectiveZoom < CARD_MIN_ZOOM) {
      return [];
    }

    let candidates = fingerprints.filter(
      r => r.latitude !== null && r.longitude !== null,
    );

    const bounds = viewport?.bounds;
    if (bounds) {
      const { ne, sw } = bounds;
      const lngSpan = ne[0] - sw[0];
      const latSpan = ne[1] - sw[1];
      const minLng = sw[0] - 0.25 * lngSpan;
      const maxLng = ne[0] + 0.25 * lngSpan;
      const minLat = sw[1] - 0.1 * latSpan;
      const maxLat = ne[1] + 0.4 * latSpan;
      candidates = candidates.filter(
        r =>
          r.longitude! >= minLng &&
          r.longitude! <= maxLng &&
          r.latitude! >= minLat &&
          r.latitude! <= maxLat,
      );
    }

    return candidates.slice(0, MAX_CARDS);
  }, [fingerprints, viewport, effectiveZoom]);

  const cards = useMemo(() => {
    const focused = focusedId
      ? fingerprints.find(r => r.id === focusedId) ?? null
      : null;
    const base = visibleCards.filter(r => r.id !== focusedId);
    return focused && focused.latitude !== null && focused.longitude !== null
      ? [...base, focused]
      : base;
  }, [visibleCards, fingerprints, focusedId]);

  const loadRecords = useCallback(async () => {
    try {
      const rows = await listSensorRecords(200);
      setRecords(rows);
    } catch (e) {
      console.warn('Failed to load fingerprints for map', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, [loadRecords]),
  );

  const handleMapIdle = useCallback((state: any) => {
    const props = state?.properties;
    if (!props || typeof props.zoom !== 'number') {
      return;
    }
    const ne = props.bounds?.ne;
    const sw = props.bounds?.sw;
    const boundsValid =
      Array.isArray(ne) &&
      Array.isArray(sw) &&
      [ne[0], ne[1], sw[0], sw[1]].every(
        (n: unknown) => typeof n === 'number' && Number.isFinite(n),
      );
    setViewport({
      zoom: props.zoom,
      bounds: boundsValid
        ? {
            ne: [ne[0], ne[1]] as [number, number],
            sw: [sw[0], sw[1]] as [number, number],
          }
        : undefined,
    });
  }, []);

  const handleCardPress = useCallback((record: SensorRecord) => {
    if (focusedIdRef.current === record.id) {
      setSelectedRecord(record);
      return;
    }
    setFocusedId(record.id);
    if (record.latitude !== null && record.longitude !== null) {
      const zoomedOut = effectiveZoomRef.current < CARD_MIN_ZOOM + 1;
      cameraRef.current?.setCamera({
        centerCoordinate: [record.longitude, record.latitude],
        ...(zoomedOut ? { zoomLevel: CARD_MIN_ZOOM + 2 } : {}),
        animationMode: 'easeTo',
        animationDuration: 400,
      });
    }
  }, []);

  const handleMapPress = useCallback(() => {
    if (Date.now() - lastFeaturePressRef.current < 400) {
      return;
    }
    setFocusedId(null);
  }, []);

  useEffect(() => {
    if (
      !mapReady ||
      centeredOnUserRef.current ||
      userLat === undefined ||
      userLng === undefined
    ) {
      return;
    }
    cameraRef.current?.setCamera({
      centerCoordinate: [userLng, userLat],
      zoomLevel: USER_ZOOM,
      animationMode: 'moveTo',
      animationDuration: 0,
    });
    centeredOnUserRef.current = true;
  }, [mapReady, userLat, userLng]);

  useEffect(() => {
    if (
      !mapReady ||
      centeredOnUserRef.current ||
      centeredOnFallbackRef.current ||
      !firstLocatedRecord
    ) {
      return;
    }
    cameraRef.current?.setCamera({
      centerCoordinate: [
        firstLocatedRecord.longitude!,
        firstLocatedRecord.latitude!,
      ],
      zoomLevel: FALLBACK_ZOOM,
      animationMode: 'moveTo',
      animationDuration: 0,
    });
    centeredOnFallbackRef.current = true;
  }, [mapReady, firstLocatedRecord]);

  if (selectedRecord) {
    const tags = selectedRecord.tagsJson
      ? (() => {
          try {
            return JSON.parse(selectedRecord.tagsJson!);
          } catch {
            return [];
          }
        })()
      : [];
    return (
      <FingerprintDetailView
        data={recordToLegacy(selectedRecord)}
        tags={tags}
        onBack={() => {
          centeredOnUserRef.current = false;
          centeredOnFallbackRef.current = false;
          setMapReady(false);
          setViewport(null);
          setFocusedId(null);
          setSelectedRecord(null);
        }}
      />
    );
  }

  const features: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: fingerprints
      .filter(r => r.latitude !== null && r.longitude !== null)
      .map(
        r =>
          ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [r.longitude!, r.latitude!],
            },
            properties: { id: r.id },
          } as Feature<Point>),
      ),
  };

  if (loading) {
    return (
      <View style={[styles.fullscreen, styles.center]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.fullscreen}>
      <MapView
        style={styles.map}
        styleURL="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        attributionEnabled={false}
        logoEnabled={false}
        onDidFinishLoadingMap={() => setMapReady(true)}
        onMapIdle={handleMapIdle}
        onPress={handleMapPress}>
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate:
              userLat !== undefined && userLng !== undefined
                ? [userLng, userLat]
                : firstLocatedRecord
                ? [firstLocatedRecord.longitude!, firstLocatedRecord.latitude!]
                : FALLBACK_CENTER,
            zoomLevel: defaultZoom,
          }}
        />

        {validLocation && (
          <ShapeSource
            id="user-location"
            shape={{
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: [
                      validLocation.longitude,
                      validLocation.latitude,
                    ],
                  },
                  properties: {},
                },
              ],
            }}>
            <CircleLayer id="user-point" style={userPointStyle} />
          </ShapeSource>
        )}

        <ShapeSource
          id="fingerprints"
          shape={features}
          onPress={(ev: any) => {
            const f = ev?.features?.[0] as Feature<Point> | undefined;
            if (!f) {
              return;
            }
            const id = f.properties?.id as string;
            const record = fingerprints.find(r => r.id === id);
            if (record) {
              lastFeaturePressRef.current = Date.now();
              handleCardPress(record);
            }
          }}>
          <CircleLayer id="fingerprint-points" style={fingerprintPointStyle} />
        </ShapeSource>

        {cards.map(record => (
          <MarkerView
            key={record.id}
            coordinate={[record.longitude!, record.latitude!]}
            anchor={{ x: 0.5, y: 1 }}>
            <FingerprintMapCard
              record={record}
              onPress={handleCardPress}
              focused={record.id === focusedId}
              dimmed={focusedId !== null && record.id !== focusedId}
            />
          </MarkerView>
        ))}
      </MapView>

      {features.features.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>
            No fingerprints with location yet
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  map: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  emptyOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emptyText: { color: '#666', fontSize: 14 },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox, {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
  LineLayer,
} from '@rnmapbox/maps';

type Coordinate = { latitude: number; longitude: number };

type LiveLocationMapProps = {
  coordinates: Coordinate | null;
  trail: Coordinate[];
};

const MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const FALLBACK_CENTER: [number, number] = [10, 50];
const FALLBACK_ZOOM = 3;
const FOLLOW_ZOOM = 15;
const FOLLOW_EASE_MS = 700;

const trailLineStyle = {
  lineColor: '#e4572e',
  lineWidth: 4,
  lineOpacity: 0.9,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
};

const locationPointStyle = {
  circleColor: '#00a6ff',
  circleRadius: 6,
  circleStrokeWidth: 2,
  circleStrokeColor: '#ffffff',
};

function isValidCoordinate(c: Coordinate | null): c is Coordinate {
  return (
    !!c &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180 &&
    !(c.latitude === 0 && c.longitude === 0)
  );
}

type LngLat = [number, number];

function smoothPath(points: LngLat[]): LngLat[] {
  if (points.length < 3) {
    return points;
  }

  const averaged: LngLat[] = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) {
      return p;
    }
    const prev = points[i - 1];
    const next = points[i + 1];
    return [(prev[0] + p[0] + next[0]) / 3, (prev[1] + p[1] + next[1]) / 3];
  });

  const out: LngLat[] = [averaged[0]];
  for (let i = 0; i < averaged.length - 1; i++) {
    const a = averaged[i];
    const b = averaged[i + 1];
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
    out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
  }
  out.push(averaged[averaged.length - 1]);
  return out;
}

export default function LiveLocationMap({
  coordinates,
  trail,
}: LiveLocationMapProps) {
  const cameraRef = useRef<Mapbox.Camera>(null);
  const hasCenteredRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  const validCoordinates = isValidCoordinate(coordinates) ? coordinates : null;
  const lat = validCoordinates?.latitude;
  const lng = validCoordinates?.longitude;

  useEffect(() => {
    if (!mapReady || lat === undefined || lng === undefined) {
      return;
    }
    const first = !hasCenteredRef.current;
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      ...(first ? { zoomLevel: FOLLOW_ZOOM } : {}),
      animationMode: first ? 'moveTo' : 'easeTo',
      animationDuration: first ? 0 : FOLLOW_EASE_MS,
    });
    hasCenteredRef.current = true;
  }, [mapReady, lat, lng]);

  const trailShape = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => {
    const raw: LngLat[] = trail
      .filter(isValidCoordinate)
      .map(point => [point.longitude, point.latitude]);

    if (raw.length > 0 && lat !== undefined && lng !== undefined) {
      const last = raw[raw.length - 1];
      if (last[0] !== lng || last[1] !== lat) {
        raw.push([lng, lat]);
      }
    }

    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: smoothPath(raw) },
      properties: {},
    };
  }, [trail, lat, lng]);

  const locationShape =
    useMemo<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(
      () =>
        lat !== undefined && lng !== undefined
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [lng, lat] },
                  properties: {},
                },
              ],
            }
          : null,
      [lat, lng],
    );

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        styleURL={MAP_STYLE_URL}
        attributionEnabled={false}
        logoEnabled={false}
        onDidFinishLoadingMap={() => setMapReady(true)}>
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate:
              lat !== undefined && lng !== undefined
                ? [lng, lat]
                : FALLBACK_CENTER,
            zoomLevel:
              lat !== undefined && lng !== undefined
                ? FOLLOW_ZOOM
                : FALLBACK_ZOOM,
          }}
        />

        {trailShape.geometry.coordinates.length > 1 && (
          <ShapeSource id="smell-walk-trail" shape={trailShape}>
            <LineLayer id="smell-walk-trail-line" style={trailLineStyle} />
          </ShapeSource>
        )}

        {locationShape && (
          <ShapeSource id="user-location" shape={locationShape}>
            <CircleLayer id="user-point" style={locationPointStyle} />
          </ShapeSource>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

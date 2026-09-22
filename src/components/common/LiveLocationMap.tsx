import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
  LineLayer,
} from '@maplibre/maplibre-react-native';

type LiveLocationMapProps = {
  coordinates: { latitude: number; longitude: number } | null;
  trail: Array<{ latitude: number; longitude: number }>;
};

const trailLineStyle = {
  lineColor: '#e4572e',
  lineWidth: 4,
  lineOpacity: 0.9,
};

const locationPointStyle = {
  circleColor: '#00a6ffff',
  circleRadius: 6,
  circleStrokeWidth: 2,
  circleStrokeColor: '#ffffff',
};

export default function LiveLocationMap({
  coordinates,
  trail,
}: LiveLocationMapProps) {
  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const mapReadyRef = useRef(false);
  const userCoordinate: [number, number] | undefined = coordinates
    ? [coordinates.longitude, coordinates.latitude]
    : undefined;

  const centerOnUser = useCallback(() => {
    if (!coordinates || !cameraRef.current || !mapReadyRef.current) {
      return;
    }

    cameraRef.current.setCamera({
      centerCoordinate: [coordinates.longitude, coordinates.latitude],
      zoomLevel: 15,
      animationMode: 'moveTo',
      animationDuration: 0,
    });
  }, [coordinates]);

  useEffect(() => {
    centerOnUser();
  }, [centerOnUser]);

  useEffect(
    () => () => {
      mapReadyRef.current = false;
    },
    [],
  );

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        attributionEnabled={false}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        onDidFinishLoadingMap={() => {
          mapReadyRef.current = true;
          centerOnUser();
        }}>
        <Camera
          ref={cameraRef}
          centerCoordinate={userCoordinate}
          zoomLevel={15}
        />

        {trail.length > 1 && (
          <ShapeSource
            id="smell-walk-trail"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: trail.map(point => [
                  point.longitude,
                  point.latitude,
                ]),
              },
              properties: {},
            }}>
            <LineLayer id="smell-walk-trail-line" style={trailLineStyle} />
          </ShapeSource>
        )}

        {coordinates && (
          <ShapeSource
            id="user-location"
            shape={{
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: [coordinates.longitude, coordinates.latitude],
                  },
                  properties: {},
                },
              ],
            }}>
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

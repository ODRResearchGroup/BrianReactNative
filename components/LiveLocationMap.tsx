import React, {useRef, useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
} from '@maplibre/maplibre-react-native';

type LiveLocationMapProps = {
  coordinates: {latitude: number; longitude: number} | null;
};

export default function LiveLocationMap({coordinates}: LiveLocationMapProps) {
  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);

  useEffect(() => {
    if (coordinates && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [coordinates.longitude, coordinates.latitude],
        zoomLevel: 15,
        animationMode: 'easeTo', // smoother than flyTo
        animationDuration: 2000, // slow down the move
      });
    }
  }, [coordinates]);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json">
        <Camera ref={cameraRef} zoomLevel={15} />

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
            <CircleLayer
              id="user-point"
              style={{
                circleColor: '#00a6ffff',
                circleRadius: 6,
                circleStrokeWidth: 2,
                circleStrokeColor: '#ffffff',
              }}
            />
          </ShapeSource>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  map: {flex: 1},
});

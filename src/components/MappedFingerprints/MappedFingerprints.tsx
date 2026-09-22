import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
} from '@maplibre/maplibre-react-native';
import { FeatureCollection, Feature, Point } from 'geojson';
import useLiveLocation from '../../hooks/useLiveLocation';
import { listSensorRecords, SensorRecord } from '../../services/database/db';
import ExpandedFingerprintView from '../common/ExpandedFingerprintView';
import { SavedFingerprintData } from '../../types/fingerprintTypes';

const userPointStyle = {
  circleColor: '#007aff',
  circleRadius: 8,
  circleStrokeWidth: 2,
  circleStrokeColor: '#fff',
};

const fingerprintPointStyle = {
  circleColor: '#ff7043',
  circleRadius: 10,
  circleStrokeWidth: 2,
  circleStrokeColor: '#fff',
};

function recordToLegacy(record: SensorRecord): SavedFingerprintData {
  return {
    fingerprint: {
      type: 'sensor_reading',
      timestamp: new Date(record.recordedAt),
      source: 'BLE Device',
      olfactoryData: {
        readings: {
          CH4: record.ch4,
          NH3: record.nh3,
          HCHO: record.hcho,
          VOC: record.voc,
          Odour: record.odour,
          H2S: record.h2s,
          Etoh: record.etoh,
          NO2: record.no2,
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
  const cameraRef = useRef<React.ElementRef<typeof Camera> | null>(null);
  const { location } = useLiveLocation();

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

  useEffect(() => {
    if (records.length && cameraRef.current && !location) {
      const first = records.find(
        r => r.latitude !== null && r.longitude !== null,
      );
      if (first) {
        cameraRef.current.setCamera({
          centerCoordinate: [first.longitude!, first.latitude!],
          zoomLevel: 10,
        });
      }
    }
  }, [location, records]);

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
      <ExpandedFingerprintView
        data={recordToLegacy(selectedRecord)}
        sensorRecordId={selectedRecord.id}
        initialTags={tags}
        onBack={() => {
          setSelectedRecord(null);
          loadRecords();
        }}
      />
    );
  }

  const features: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: records
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
      <SafeAreaView style={[styles.fullscreen, styles.center]}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.fullscreen}>
      <MapView
        style={styles.map}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json">
        <Camera ref={cameraRef} />

        {location && (
          <ShapeSource
            id="user-location"
            shape={{
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: [location.longitude, location.latitude],
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
            const record = records.find(r => r.id === id);
            if (record) {
              const [lon, lat] = f.geometry.coordinates;
              cameraRef.current?.setCamera({ centerCoordinate: [lon, lat] });
              setSelectedRecord(record);
            }
          }}>
          <CircleLayer id="fingerprint-points" style={fingerprintPointStyle} />
        </ShapeSource>
      </MapView>

      {features.features.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>
            No fingerprints with location yet
          </Text>
        </View>
      )}
    </SafeAreaView>
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

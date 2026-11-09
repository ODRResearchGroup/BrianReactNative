import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
} from 'react-native';
import { MapView, Camera, ShapeSource, CircleLayer } from '@rnmapbox/maps';
import Svg, { Path } from 'react-native-svg';
import SensorReadingsPanel from './SensorReadingsPanel';
import type { SavedFingerprintData } from '../../types/fingerprintTypes';
import CustomRadarChart, { gasSeries } from './CustomRadarChart';
import { COLORS } from '../../consts';

const locationPointStyle = {
  circleColor: '#ff7043',
  circleRadius: 8,
  circleStrokeWidth: 2,
  circleStrokeColor: '#fff',
};

const capturedLabel = (ts: unknown) => {
  const d = ts ? new Date(ts as any) : new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? `Captured today, ${time}`
    : `Captured ${d.toLocaleDateString()}, ${time}`;
};

const ChevronIcon = ({ size = 18, color = COLORS.green }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round">
    <Path d="m9 18 6-6-6-6" />
  </Svg>
);

interface FingerprintDetailViewProps {
  data: SavedFingerprintData;
  onBack: () => void;
  tags?: string[];
}

export default function FingerprintDetailView({
  data,
  onBack,
  tags = [],
}: FingerprintDetailViewProps) {
  const [showChart, setShowChart] = useState(false);

  const title = data.fingerprintTitle?.title?.trim() || '';
  const description = data.humanDescription?.description?.trim() || '';
  const readings = useMemo(
    () =>
      (data.fingerprint?.olfactoryData?.readings ?? {}) as Record<
        string,
        number
      >,
    [data.fingerprint?.olfactoryData?.readings],
  );

  const radar = useMemo(
    () => gasSeries('detail', title || 'Fingerprint', readings),
    [readings, title],
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Fingerprint
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={styles.miniRadarBox}>
              <CustomRadarChart variant="compact" size={56} data={radar} />
            </View>
            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle} numberOfLines={1}>
                {title || 'Untitled'}
              </Text>
              <Text style={styles.summarySub}>
                {capturedLabel(data.timestamp)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.chartLink}
              onPress={() => setShowChart(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                showChart ? 'Hide full chart' : 'View full chart'
              }>
              <Text style={styles.chartLinkText}>
                {showChart ? 'Hide' : 'Full data'}
              </Text>
              <View
                style={{
                  transform: [{ rotate: showChart ? '-90deg' : '0deg' }],
                }}>
                <ChevronIcon />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {showChart && (
          <SensorReadingsPanel
            readings={readings}
            title={title || 'Fingerprint'}
          />
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Name</Text>
          <View style={styles.valueBox}>
            <Text style={[styles.valueText, !title && styles.placeholderText]}>
              {title || 'No name'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Note</Text>
          <View style={[styles.valueBox, styles.noteBox]}>
            <Text
              style={[
                styles.valueText,
                styles.noteText,
                !description && styles.placeholderText,
              ]}>
              {description || 'No note'}
            </Text>
          </View>
        </View>

        {tags.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Olfactory tags</Text>
            <View style={styles.tagsWrap}>
              {tags.map(tag => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.photoPath ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Photo</Text>
            <Image
              source={{ uri: `file://${data.photoPath}` }}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel="Attached photo"
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Location</Text>
          {data.location ? (
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                styleURL="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                attributionEnabled={false}
                logoEnabled={false}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}>
                <Camera
                  centerCoordinate={[
                    data.location.longitude,
                    data.location.latitude,
                  ]}
                  zoomLevel={14}
                />
                <ShapeSource
                  id="fingerprint-location"
                  shape={{
                    type: 'FeatureCollection',
                    features: [
                      {
                        type: 'Feature',
                        geometry: {
                          type: 'Point',
                          coordinates: [
                            data.location.longitude,
                            data.location.latitude,
                          ],
                        },
                        properties: {},
                      },
                    ],
                  }}>
                  <CircleLayer id="location-point" style={locationPointStyle} />
                </ShapeSource>
              </MapView>
            </View>
          ) : (
            <View style={[styles.mapContainer, styles.noLocation]}>
              <Text style={styles.placeholderText}>No location data</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
    backgroundColor: COLORS.bg,
  },
  headerButton: {
    minWidth: 72,
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '500', color: COLORS.ink },
  backText: { fontSize: 16, color: COLORS.ink },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  cardLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  miniRadarBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 16, fontWeight: '500', color: COLORS.ink },
  summarySub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  chartLink: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: 8,
  },
  chartLinkText: { fontSize: 14, fontWeight: '500', color: COLORS.green },
  valueBox: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  noteBox: {
    minHeight: 76,
    paddingVertical: 12,
    justifyContent: 'flex-start',
  },
  valueText: { fontSize: 17, color: COLORS.ink },
  noteText: { fontSize: 16, lineHeight: 22 },
  placeholderText: { color: '#8a8c86', fontSize: 14 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.greenTint,
  },
  tagText: { fontSize: 13, fontWeight: '500', color: COLORS.green },
  photo: { width: '100%', height: 220, borderRadius: 16 },
  mapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.bg,
  },
  map: { flex: 1 },
  noLocation: { justifyContent: 'center', alignItems: 'center' },
});

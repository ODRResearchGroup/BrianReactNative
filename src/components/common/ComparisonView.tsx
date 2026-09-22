import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Button,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomRadarChart from './CustomRadarChart';
import { SavedFingerprintData } from '../../types/fingerprintTypes';
import { DocumentDirectoryPath, writeFile } from 'react-native-fs';
import Share from 'react-native-share';

type StoredItem = { key: string; data: SavedFingerprintData };

interface ComparisonViewProps {
  selectedItems: StoredItem[];
  onBack: () => void;
}

// Consistent sensor order and labels
const SENSOR_MAP = [
  { key: 'CH4', label: 'Ch4' },
  { key: 'NH3', label: 'NH3' },
  { key: 'HCHO', label: 'HCHO' },
  { key: 'VOC', label: 'VOC' },
  { key: 'Odour', label: 'Odour' },
  { key: 'H2S', label: 'H2S' },
  { key: 'Etoh', label: 'Etoh' },
  { key: 'NO2', label: 'NO2' },
];

// Color generator
const generateColor = (index: number) => {
  const hue = (index * 137.508) % 360;
  return {
    fill: `hsla(${hue}, 80%, 65%, 0.35)`,
    stroke: `hsla(${hue}, 85%, 45%, 1)`,
  };
};

export default function ComparisonView({
  selectedItems,
  onBack,
}: ComparisonViewProps) {
  // Comparison view simplified: always show stored/raw readings

  // Prepare radar chart data
  const getRadarData = (item: StoredItem) => {
    const olfactoryData = item.data.fingerprint?.olfactoryData;
    const maybeReadings: Record<string, number> =
      olfactoryData && typeof olfactoryData === 'object'
        ? (olfactoryData as any).readings ?? olfactoryData
        : {};

    if (!Object.keys(maybeReadings).length) {
      return SENSOR_MAP.map(({ label }) => ({ x: label, y: 0.01 }));
    }

    return SENSOR_MAP.map(({ key, label }) => ({
      x: label,
      y: Number(maybeReadings[key] ?? 0),
    }));
  };

  const radarChartData = selectedItems.map((item, itemIndex) => ({
    key: item.key,
    title: item.data.fingerprintTitle?.title || `Fingerprint ${itemIndex + 1}`,
    values: getRadarData(item),
    color: generateColor(itemIndex),
  }));

  // Export selected
  const exportSelected = async () => {
    try {
      const selected = selectedItems.map(i => i.data);
      if (selected.length === 0) {
        return Alert.alert(
          'No selection',
          'Please select fingerprints to export.',
        );
      }

      const filename = `fingerprints_selected_${Date.now()}.json`;
      const path = `${DocumentDirectoryPath}/${filename}`;
      await writeFile(path, JSON.stringify(selected, null, 2), 'utf8');

      await Share.open({
        title: 'Share selected fingerprints',
        url: `file://${path}`,
        saveToFiles: true,
        failOnCancel: false,
      });
    } catch (err: any) {
      console.error('Export selected failed', err);
      Alert.alert('Export failed', err?.message || String(err));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Radar Chart */}
        <View style={styles.chartContainer}>
          <CustomRadarChart
            data={radarChartData}
            size={320}
            maxValue={1}
            gridLevels={4}
          />

          {/* Legend */}
          <View style={styles.legend}>
            {radarChartData.map(dataset => (
              <View key={dataset.key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendColor,
                    { backgroundColor: dataset.color.stroke },
                  ]}
                />
                <Text style={styles.legendText}>{dataset.title}</Text>
              </View>
            ))}
          </View>

          {/* Export button */}
          <View style={styles.exportButtonContainer}>
            <Button title="Export Selected" onPress={exportSelected} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const MARGIN = 20;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: MARGIN,
    paddingVertical: 20,
  },
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: '#007aff',
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: MARGIN,
    paddingBottom: 40,
  },
  chartContainer: {
    alignItems: 'center',
  },
  slider: {
    width: '80%',
    height: 40,
    marginTop: 10,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 4,
  },
  toggleBtnActive: {
    backgroundColor: '#141414',
  },
  toggleText: {
    color: '#333',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: '#333',
  },
  sensorPreview: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    width: '90%',
  },
  sensorPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  sensorPreviewText: {
    fontSize: 12,
    color: '#666',
  },
  exportButtonContainer: {
    marginTop: 20,
    width: '100%',
  },
});

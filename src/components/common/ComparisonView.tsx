import React, { useMemo } from 'react';
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
import CustomRadarChart, {
  gasSeries,
  radarMax,
  seriesColor,
} from './CustomRadarChart';
import { SavedFingerprintData } from '../../types/fingerprintTypes';
import { DocumentDirectoryPath, writeFile } from 'react-native-fs';
import Share from 'react-native-share';

type StoredItem = { key: string; data: SavedFingerprintData };

interface ComparisonViewProps {
  selectedItems: StoredItem[];
  onBack: () => void;
}

export default function ComparisonView({
  selectedItems,
  onBack,
}: ComparisonViewProps) {
  const series = useMemo(
    () =>
      selectedItems.flatMap((item, i) =>
        gasSeries(
          item.key,
          item.data.fingerprintTitle?.title || `Fingerprint ${i + 1}`,
          item.data.fingerprint?.olfactoryData?.readings ?? {},
          seriesColor(i),
        ),
      ),
    [selectedItems],
  );

  const exportSelected = async () => {
    try {
      if (selectedItems.length === 0) {
        return Alert.alert(
          'No selection',
          'Please select fingerprints to export.',
        );
      }
      const path = `${DocumentDirectoryPath}/fingerprints_selected_${Date.now()}.json`;
      await writeFile(
        path,
        JSON.stringify(
          selectedItems.map(i => i.data),
          null,
          2,
        ),
        'utf8',
      );
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
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chartContainer}>
          <CustomRadarChart
            data={series}
            size={320}
            maxValue={radarMax(series)}
          />

          <View style={styles.legend}>
            {series.map(s => (
              <View key={s.key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendColor,
                    { backgroundColor: s.color.stroke },
                  ]}
                />
                <Text style={styles.legendText}>{s.title}</Text>
              </View>
            ))}
          </View>

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
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: MARGIN, paddingVertical: 20 },
  backButton: { paddingVertical: 8 },
  backText: { fontSize: 16, color: '#007aff', fontWeight: '500' },
  content: { paddingHorizontal: MARGIN, paddingBottom: 40 },
  chartContainer: { alignItems: 'center' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendColor: { width: 16, height: 16, borderRadius: 3 },
  legendText: { fontSize: 11, color: '#333' },
  exportButtonContainer: { marginTop: 20, width: '100%' },
});

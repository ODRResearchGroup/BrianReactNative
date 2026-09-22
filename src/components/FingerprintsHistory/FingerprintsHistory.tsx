import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  listSensorRecords,
  SensorRecord,
  deleteSensorRecords,
} from '../../services/database/db';
import ExpandedFingerprintView from '../common/ExpandedFingerprintView';
import ComparisonView from '../common/ComparisonView';
import { SavedFingerprintData } from '../../types/fingerprintTypes';

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
    deltaReadings:
      record.deltaCh4 !== null
        ? {
            CH4: record.deltaCh4 ?? 0,
            NH3: record.deltaNh3 ?? 0,
            HCHO: record.deltaHcho ?? 0,
            VOC: record.deltaVoc ?? 0,
            Odour: record.deltaOdour ?? 0,
            H2S: record.deltaH2s ?? 0,
            Etoh: record.deltaEtoh ?? 0,
            NO2: record.deltaNo2 ?? 0,
          }
        : undefined,
  };
}

export default function FingerprintsHistory() {
  const [items, setItems] = useState<SensorRecord[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  const loadFingerprints = useCallback(async () => {
    try {
      const records = await listSensorRecords(100);
      setItems(records);
    } catch (err) {
      console.error('Error loading fingerprints:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFingerprints();
    }, [loadFingerprints]),
  );

  const toggleSelectMode = () => {
    setIsSelectMode(p => !p);
    setSelectedIds([]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete fingerprints',
      `Delete ${selectedIds.length} fingerprint${
        selectedIds.length !== 1 ? 's' : ''
      }? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSensorRecords(selectedIds);
            setSelectedIds([]);
            setIsSelectMode(false);
            loadFingerprints();
          },
        },
      ],
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id],
    );
  };

  const handleFingerprintPress = (index: number, id: string) => {
    if (isSelectMode) {
      toggleSelect(id);
    } else {
      setExpandedIndex(index);
    }
  };

  if (showComparison) {
    const selectedLegacy = items
      .filter(r => selectedIds.includes(r.id))
      .map(r => ({ key: r.id, data: recordToLegacy(r) }));
    return (
      <ComparisonView
        selectedItems={selectedLegacy}
        onBack={() => setShowComparison(false)}
      />
    );
  }

  if (expandedIndex !== null && items[expandedIndex]) {
    const rec = items[expandedIndex];
    const tags = rec.tagsJson
      ? (() => {
          try {
            return JSON.parse(rec.tagsJson!);
          } catch {
            return [];
          }
        })()
      : [];
    return (
      <ExpandedFingerprintView
        data={recordToLegacy(rec)}
        sensorRecordId={rec.id}
        initialTags={tags}
        onBack={() => {
          setExpandedIndex(null);
          loadFingerprints();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerButtons}>
          {!isSelectMode ? (
            <Pressable style={styles.selectButton} onPress={toggleSelectMode}>
              <Text style={styles.selectButtonText}>Select</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.cancelButton} onPress={toggleSelectMode}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.analyseButton,
                  selectedIds.length < 2 && styles.disabledButton,
                ]}
                onPress={() => setShowComparison(true)}
                disabled={selectedIds.length < 2}>
                <Text style={styles.analyseButtonText}>Analyse</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.deleteButton,
                  selectedIds.length === 0 && styles.disabledButton,
                ]}
                onPress={handleDelete}
                disabled={selectedIds.length === 0}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.listSection}
        contentContainerStyle={styles.listContent}>
        {items.map((record, idx) => {
          const isSelected = selectedIds.includes(record.id);
          const tags: string[] = record.tagsJson
            ? (() => {
                try {
                  return JSON.parse(record.tagsJson!);
                } catch {
                  return [];
                }
              })()
            : [];
          return (
            <Pressable
              key={record.id}
              onPress={() => handleFingerprintPress(idx, record.id)}
              style={[
                styles.fingerprintCard,
                isSelectMode && isSelected && styles.selectedCard,
              ]}>
              <View style={styles.cardContent}>
                {isSelectMode && (
                  <View style={styles.selectionCircle}>
                    {isSelected ? (
                      <View style={styles.selectedCircle}>
                        <View style={styles.selectedCircleInner} />
                      </View>
                    ) : (
                      <View style={styles.unselectedCircle} />
                    )}
                  </View>
                )}
                <View style={styles.textContent}>
                  <Text style={styles.cardTitle}>
                    {record.title || 'Untitled'}
                  </Text>
                  <Text style={styles.cardDescription}>
                    {record.description || 'No description'}
                  </Text>
                  {tags.length > 0 && (
                    <Text style={styles.tagsBadge} numberOfLines={1}>
                      {tags.slice(0, 3).join(' · ')}
                      {tags.length > 3 ? ` +${tags.length - 3}` : ''}
                    </Text>
                  )}
                </View>
                {record.photoPath ? (
                  <Image
                    source={{ uri: `file://${record.photoPath}` }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}

        {items.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No fingerprints saved yet</Text>
            <Text style={styles.emptySubtext}>
              Create a fingerprint to get started
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const GUTTER = 20;
const MARGIN = 20;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: MARGIN,
    paddingVertical: 20,
  },
  headerButtons: { flexDirection: 'row', gap: 10 },
  selectButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#fff',
  },
  selectButtonText: { fontSize: 16, color: '#000', fontWeight: '500' },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#fff',
  },
  cancelButtonText: { fontSize: 16, color: '#000', fontWeight: '500' },
  analyseButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#000',
  },
  analyseButtonText: { fontSize: 16, color: '#fff', fontWeight: '500' },
  deleteButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#ff3b30',
  },
  deleteButtonText: { fontSize: 16, color: '#fff', fontWeight: '500' },
  disabledButton: { opacity: 0.4 },
  listSection: { flex: 1 },
  listContent: { paddingHorizontal: MARGIN, paddingBottom: 100 },
  fingerprintCard: {
    marginBottom: GUTTER,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  selectedCard: { backgroundColor: '#f0f0f0', borderColor: '#000' },
  cardContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  selectionCircle: { marginRight: 12 },
  unselectedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#666',
  },
  selectedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCircleInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  textContent: { flex: 1, marginRight: 12 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  cardDescription: { fontSize: 14, color: '#666', lineHeight: 20 },
  tagsBadge: { marginTop: 6, fontSize: 12, color: '#555', fontStyle: 'italic' },
  thumbnail: { width: 60, height: 60, borderRadius: 8 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: { fontSize: 14, color: '#999' },
});

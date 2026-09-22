import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { ArrowLeft } from 'lucide-react-native';
import {
  loadAnnotation,
  saveAnnotation,
  AnnotationRecord,
} from '../../services/annotations/annotationService';
import {
  getCapture,
  updateCaptureTags,
  updateCaptureDescription,
} from '../../services/database/db';
import { usePressAnimation } from '../../hooks/usePressAnimation';

const C = {
  black: '#1A1A1A',
  darkGray: '#4D4D4D',
  lightGray: '#B3B3B3',
  white: '#FAFAFA',
  border: '#E0E0E0',
};

type TagColor =
  | 'green'
  | 'orange'
  | 'pink'
  | 'teal'
  | 'yellow'
  | 'lavender'
  | 'sand';
const TAG_PALETTE: Record<
  TagColor,
  { bg: string; border: string; text: string }
> = {
  green: { bg: '#D6EDD6', border: '#7DC47D', text: '#3A7A3A' },
  orange: { bg: '#FDEBD0', border: '#E8A96A', text: '#9A5C1A' },
  pink: { bg: '#FADDE1', border: '#E88A9A', text: '#9A2A3A' },
  teal: { bg: '#D6EDEA', border: '#6DBFB8', text: '#1A6B65' },
  yellow: { bg: '#FDF8D0', border: '#D4C84A', text: '#7A6A00' },
  lavender: { bg: '#E5E0F5', border: '#9B8FD4', text: '#3D2E8A' },
  sand: { bg: '#F0EAD6', border: '#C4A96A', text: '#6B4E1A' },
};

function tagColor(tag: string): TagColor {
  const colors: TagColor[] = [
    'green',
    'orange',
    'pink',
    'teal',
    'yellow',
    'lavender',
    'sand',
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + hash * 31;
  }
  return colors[Math.abs(hash) % colors.length];
}

function TagPill({
  label,
  mode,
  onPress,
}: {
  label: string;
  mode: 'selected' | 'suggested';
  onPress: () => void;
}) {
  const p = TAG_PALETTE[tagColor(label)];
  const { scale, handlers, fireHaptic } = usePressAnimation({
    scaleTo: 0.88,
    haptic: 'light',
  });
  return (
    <TouchableWithoutFeedback
      onPress={() => {
        fireHaptic();
        onPress();
      }}
      {...handlers}>
      <Animated.View
        style={[
          styles.tagPill,
          {
            backgroundColor: p.bg,
            borderColor: p.border,
            transform: [{ scale }],
          },
        ]}>
        <Text style={[styles.tagIcon, { color: p.text }]}>
          {mode === 'selected' ? '−' : '+'}
        </Text>
        <Text style={[styles.tagLabel, { color: p.text }]}>{label}</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'EditAnnotationTags'>;

export default function EditAnnotationTagsScreen({ navigation, route }: Props) {
  const { annotationId } = route.params;

  const [annotation, setAnnotation] = useState<AnnotationRecord | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let ann = await loadAnnotation(annotationId);

        if (!ann) {
          const row = await getCapture(annotationId);
          if (row) {
            ann = {
              annotationId,
              recordingId: annotationId,
              type: row.type,
              description: row.description ?? '',
              selectedTags: row.selectedTagsJson
                ? JSON.parse(row.selectedTagsJson)
                : [],
              timestamp: row.latitudeDisplay
                ? new Date(row.capturedAt).toLocaleTimeString()
                : '00:00:00',
              latitude: row.latitudeDisplay ?? '00.0000° N',
              longitude: row.longitudeDisplay ?? '00.0000° E',
              annotationIndex: row.annotationIndex ?? 1,
              savedAt: new Date(row.capturedAt).toISOString(),
              schema: 'annotation_v1',
            } as AnnotationRecord;
          }
        }

        if (ann) {
          setAnnotation(ann);
          setDescription(ann.description ?? '');
          setSelectedTags(ann.selectedTags ?? []);
          const row = await getCapture(annotationId);
          const suggested: string[] = row?.suggestedTagsJson
            ? JSON.parse(row.suggestedTagsJson)
            : [];
          setSuggestedTags(
            suggested.filter(t => !(ann!.selectedTags ?? []).includes(t)),
          );
          if (row) {
            setCaptureStatus(row.status);
          }
        }
      } catch (e) {
        console.warn('Failed to load annotation:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [annotationId]);

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(p => p.filter(t => t !== tag));
    setSuggestedTags(p => (p.includes(tag) ? p : [...p, tag]));
  };

  const handleAddTag = (tag: string) => {
    setSuggestedTags(p => p.filter(t => t !== tag));
    setSelectedTags(p => (p.includes(tag) ? p : [...p, tag]));
  };

  const doSave = async () => {
    if (!annotation || saving) {
      return;
    }
    setSaving(true);
    try {
      await updateCaptureTags(annotationId, selectedTags, suggestedTags);
      await updateCaptureDescription(annotationId, description);
      await saveAnnotation({
        recordingId: annotation.recordingId,
        sensorRecordId: (annotation as any).sensorRecordId ?? undefined,
        type: annotation.type,
        description,
        strokes: annotation.strokes,
        selectedTags,
        timestamp: annotation.timestamp,
        latitude: annotation.latitude,
        longitude: annotation.longitude,
        photoUri: annotation.photoUri,
        annotationIndex: annotation.annotationIndex,
      });
      navigation.navigate('AnnotationFeed');
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!annotation || saving) {
      return;
    }
    const transcriptionPending =
      annotation.type === 'audio' &&
      captureStatus !== null &&
      captureStatus !== 'transcribed' &&
      captureStatus !== 'failed';
    if (transcriptionPending) {
      Alert.alert(
        'Transcription in progress',
        "Your audio is still being transcribed. Saving now means the transcript won't be included. Save anyway?",
        [
          { text: 'Wait', style: 'cancel' },
          { text: 'Save anyway', onPress: doSave },
        ],
      );
      return;
    }
    doSave();
  };

  const backAnim = usePressAnimation({ scaleTo: 0.8, haptic: 'light' });
  const saveAnim = usePressAnimation({ scaleTo: 0.97, haptic: 'medium' });

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.darkGray} />
        </View>
      </SafeAreaView>
    );
  }

  if (!annotation) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Annotation not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.topBar}>
            <TouchableWithoutFeedback
              onPress={() => {
                backAnim.fireHaptic();
                navigation.goBack();
              }}
              {...backAnim.handlers}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Animated.View style={{ transform: [{ scale: backAnim.scale }] }}>
                <ArrowLeft size={20} color={C.darkGray} strokeWidth={2} />
              </Animated.View>
            </TouchableWithoutFeedback>
            <View style={styles.topBarMeta}>
              <Text style={styles.timestamp}>{annotation.timestamp}</Text>
              <View style={styles.coordsBlock}>
                <Text style={styles.coords}>{annotation.latitude}</Text>
                <Text style={styles.coords}>{annotation.longitude}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.annotationLabel}>
            ANNOTATION #{annotation.annotationIndex}
          </Text>
          <TextInput
            style={styles.descriptionInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description…"
            placeholderTextColor={C.lightGray}
            multiline
            textAlignVertical="top"
          />
          {annotation.type === 'photo' && (
            <View style={styles.photoPlaceholder} />
          )}

          <View style={styles.divider} />
          <Text style={styles.tagsLabel}>TAGS</Text>

          <View style={styles.selectedTagsWrap}>
            {selectedTags.map(tag => (
              <TagPill
                key={tag}
                label={tag}
                mode="selected"
                onPress={() => handleRemoveTag(tag)}
              />
            ))}
            {selectedTags.length === 0 && (
              <Text style={styles.noTagsHint}>
                No tags selected. Add from suggestions below.
              </Text>
            )}
          </View>

          {suggestedTags.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestedTagsRow}>
              {suggestedTags.map(tag => (
                <TagPill
                  key={tag}
                  label={tag}
                  mode="suggested"
                  onPress={() => handleAddTag(tag)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <View style={styles.fabContainer}>
        <TouchableWithoutFeedback
          onPress={handleSave}
          {...saveAnim.handlers}
          disabled={saving}>
          <Animated.View
            style={[
              styles.fab,
              saving && styles.fabBusy,
              { transform: [{ scale: saveAnim.scale }] },
            ]}>
            <Text style={styles.fabLabel}>
              {saving ? 'Saving…' : 'Save & Go Home'}
            </Text>
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: C.darkGray },
  scrollContent: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  topBarMeta: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timestamp: { fontSize: 13, color: C.darkGray },
  coordsBlock: { alignItems: 'flex-end' },
  coords: { fontSize: 12, color: C.darkGray, lineHeight: 17 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  annotationLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.darkGray,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  descriptionInput: {
    fontSize: 14,
    color: C.black,
    lineHeight: 20,
    minHeight: 60,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 8,
  },
  photoPlaceholder: {
    height: 200,
    borderRadius: 8,
    backgroundColor: C.black,
    marginBottom: 14,
  },
  tagsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.darkGray,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  noTagsHint: { fontSize: 12, color: C.lightGray, fontStyle: 'italic' },
  selectedTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    minHeight: 32,
  },
  suggestedTagsRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  tagIcon: { fontSize: 16, lineHeight: 18, marginTop: -1, fontWeight: '600' },
  tagLabel: { fontSize: 13 },
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  fab: {
    backgroundColor: C.black,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  fabBusy: { backgroundColor: C.lightGray },
  fabLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.white,
    letterSpacing: 0.3,
  },
});

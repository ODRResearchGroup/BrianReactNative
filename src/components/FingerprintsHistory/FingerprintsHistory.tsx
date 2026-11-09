import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import {
  listSensorRecords,
  SensorRecord,
  deleteSensorRecords,
} from '../../services/database/db';
import FingerprintDetailView from '../common/FingerprintDetailView';
import { recordToSaved } from '../../sensorRecords';
import RecordRadar from '../common/RecordRadar';
import ComparisonScreen from '../ComparisonScreen.tsx/ComparisonScreen';

const LOAD_LIMIT = 500;

const COLORS = {
  bg: '#f6f6f3',
  surface: '#ffffff',
  border: '#e4e4df',
  ink: '#1b1c1a',
  muted: '#666963',
  green: '#1f5c3f',
  greenTint: '#e6efe9',
  red: '#b3261e',
  redTint: '#fbeae8',
  disabledBg: '#e3e5e0',
  disabledText: '#7d7f79',
};

// ─── Filters ──────────────────────────────────────────────────────────────────

type WalkFilter = 'all' | 'walk' | 'standalone';
type MediaFilter = 'all' | 'photo' | 'none';

type Filters = {
  title: string;
  note: string;
  tag: string;
  walk: WalkFilter;
  media: MediaFilter;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  title: '',
  note: '',
  tag: '',
  walk: 'all',
  media: 'all',
  dateFrom: '',
  dateTo: '',
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Parses YYYY-MM-DD as a local date. Returns null for empty/invalid input.
function parseDate(value: string, endOfDay: boolean): number | null {
  const m = DATE_RE.exec(value.trim());
  if (!m) {
    return null;
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = endOfDay
    ? new Date(y, mo - 1, d, 23, 59, 59, 999)
    : new Date(y, mo - 1, d, 0, 0, 0, 0);
  // Reject things like 2026-02-31 that roll over into the next month.
  if (date.getMonth() !== mo - 1) {
    return null;
  }
  return date.getTime();
}

function isInvalidDate(value: string) {
  return value.trim().length > 0 && parseDate(value, false) === null;
}

function parseTags(json: string | null | undefined): string[] {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const includes = (haystack: string | null | undefined, needle: string) =>
  (haystack ?? '').toLowerCase().includes(needle.trim().toLowerCase());

function matchesFilters(r: SensorRecord, f: Filters): boolean {
  if (f.title.trim() && !includes(r.title, f.title)) {
    return false;
  }
  if (f.note.trim() && !includes(r.description, f.note)) {
    return false;
  }
  if (f.tag.trim() && !parseTags(r.tagsJson).some(t => includes(t, f.tag))) {
    return false;
  }
  if (f.walk === 'walk' && !r.walkId) {
    return false;
  }
  if (f.walk === 'standalone' && r.walkId) {
    return false;
  }
  if (f.media === 'photo' && !r.photoPath) {
    return false;
  }
  if (f.media === 'none' && r.photoPath) {
    return false;
  }
  const from = parseDate(f.dateFrom, false);
  if (from !== null && r.recordedAt < from) {
    return false;
  }
  const to = parseDate(f.dateTo, true);
  if (to !== null && r.recordedAt > to) {
    return false;
  }
  return true;
}

// Number of filters in the expanded panel plus the name search that are set.
function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.title.trim()) {
    n++;
  }
  if (f.note.trim()) {
    n++;
  }
  if (f.tag.trim()) {
    n++;
  }
  if (f.walk !== 'all') {
    n++;
  }
  if (f.media !== 'all') {
    n++;
  }
  if (parseDate(f.dateFrom, false) !== null) {
    n++;
  }
  if (parseDate(f.dateTo, true) !== null) {
    n++;
  }
  return n;
}

// ─── Record helpers ───────────────────────────────────────────────────────────

// Walk samples share the sensor-record table but are not saved fingerprints.
const isFingerprint = (r: SensorRecord) => r.recordType !== 'walk_sample';

const capturedLabel = (ms: number) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString()}, ${time}`;
};

// ─── Small UI pieces ──────────────────────────────────────────────────────────

const icon = {
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

const SearchIcon = ({ color = COLORS.muted }: { color?: string }) => (
  <Svg width={20} height={20} stroke={color} strokeWidth={2} {...icon}>
    <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
    <Path d="m21 21-4.3-4.3" />
  </Svg>
);

const SlidersIcon = ({ color = COLORS.ink }: { color?: string }) => (
  <Svg width={18} height={18} stroke={color} strokeWidth={2} {...icon}>
    <Path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <Path d="M16 4v4M10 10v4M18 16v4" />
  </Svg>
);

const CheckIcon = ({ color = '#fff' }: { color?: string }) => (
  <Svg width={14} height={14} stroke={color} strokeWidth={3} {...icon}>
    <Path d="M20 6 9 17l-5-5" />
  </Svg>
);

const CameraIcon = ({ color = COLORS.muted }: { color?: string }) => (
  <Svg width={14} height={14} stroke={color} strokeWidth={2} {...icon}>
    <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
  </Svg>
);

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.segment, on && styles.segmentOn]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FingerprintsHistory() {
  const [items, setItems] = useState<SensorRecord[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const loadFingerprints = useCallback(async () => {
    try {
      const records = await listSensorRecords(LOAD_LIMIT);
      setItems(records.filter(isFingerprint));
    } catch (err) {
      console.error('Error loading fingerprints:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFingerprints();
    }, [loadFingerprints]),
  );

  const visible = useMemo(
    () => items.filter(r => matchesFilters(r, filters)),
    [items, filters],
  );

  const activeCount = activeFilterCount(filters);
  const hasFilters = activeCount > 0;

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const toggleSelectMode = () => {
    setIsSelectMode(p => !p);
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id],
    );
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

  const handlePress = (id: string) => {
    if (isSelectMode) {
      toggleSelect(id);
    } else {
      setExpandedId(id);
    }
  };

  if (showComparison) {
    const selectedLegacy = items
      .filter(r => selectedIds.includes(r.id))
      .map(r => ({ key: r.id, data: recordToSaved(r) }));
    return (
      <ComparisonScreen
        selectedItems={selectedLegacy}
        onBack={() => setShowComparison(false)}
      />
    );
  }

  const expanded = expandedId ? items.find(r => r.id === expandedId) : null;
  if (expanded) {
    return (
      <FingerprintDetailView
        data={recordToSaved(expanded)}
        tags={parseTags(expanded.tagsJson)}
        onBack={() => setExpandedId(null)}
      />
    );
  }

  const dateFromBad = isInvalidDate(filters.dateFrom);
  const dateToBad = isInvalidDate(filters.dateTo);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Fingerprints
        </Text>
        <TouchableOpacity
          style={styles.headerPill}
          onPress={toggleSelectMode}
          accessibilityRole="button">
          <Text style={styles.headerPillText}>
            {isSelectMode ? 'Cancel' : 'Select'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isSelectMode && styles.scrollContentWithFooter,
        ]}
        keyboardShouldPersistTaps="handled">
        {/* Search + filters */}
        <View style={styles.card}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <SearchIcon />
              <TextInput
                style={styles.searchInput}
                value={filters.title}
                onChangeText={t => setFilter('title', t)}
                placeholder="Search by name"
                placeholderTextColor="#6b6d67"
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Search by name"
              />
            </View>
            <TouchableOpacity
              style={[
                styles.filterButton,
                showFilters && styles.filterButtonOn,
              ]}
              onPress={() => setShowFilters(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                showFilters ? 'Hide filters' : 'Show filters'
              }>
              <SlidersIcon color={showFilters ? '#fff' : COLORS.ink} />
              <Text
                style={[
                  styles.filterButtonText,
                  showFilters && styles.filterButtonTextOn,
                ]}>
                Filters
              </Text>
              {activeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {showFilters && (
            <View style={styles.filterPanel}>
              <Field label="Note">
                <TextInput
                  style={styles.input}
                  value={filters.note}
                  onChangeText={t => setFilter('note', t)}
                  placeholder="Text in the note"
                  placeholderTextColor="#6b6d67"
                  autoCorrect={false}
                  accessibilityLabel="Filter by note"
                />
              </Field>

              <Field label="Olfactory tag">
                <TextInput
                  style={styles.input}
                  value={filters.tag}
                  onChangeText={t => setFilter('tag', t)}
                  placeholder="e.g. coffee"
                  placeholderTextColor="#6b6d67"
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Filter by tag"
                />
              </Field>

              <Field label="Smell walk">
                <Segmented<WalkFilter>
                  value={filters.walk}
                  onChange={v => setFilter('walk', v)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'walk', label: 'On a walk' },
                    { value: 'standalone', label: 'Standalone' },
                  ]}
                />
              </Field>

              <Field label="Media">
                <Segmented<MediaFilter>
                  value={filters.media}
                  onChange={v => setFilter('media', v)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'photo', label: 'Photo' },
                    { value: 'none', label: 'No photo' },
                  ]}
                />
              </Field>

              <View style={styles.dateRow}>
                <View style={styles.dateCol}>
                  <Field label="From">
                    <TextInput
                      style={[styles.input, dateFromBad && styles.inputError]}
                      value={filters.dateFrom}
                      onChangeText={t => setFilter('dateFrom', t)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#6b6d67"
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                      accessibilityLabel="From date"
                    />
                  </Field>
                </View>
                <View style={styles.dateCol}>
                  <Field label="To">
                    <TextInput
                      style={[styles.input, dateToBad && styles.inputError]}
                      value={filters.dateTo}
                      onChangeText={t => setFilter('dateTo', t)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#6b6d67"
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                      accessibilityLabel="To date"
                    />
                  </Field>
                </View>
              </View>
              {(dateFromBad || dateToBad) && (
                <Text style={styles.errorText}>
                  Use the format YYYY-MM-DD, e.g. 2026-09-25
                </Text>
              )}

              <TouchableOpacity
                style={[styles.clearButton, !hasFilters && styles.clearOff]}
                onPress={clearFilters}
                disabled={!hasFilters}
                accessibilityRole="button">
                <Text style={styles.clearButtonText}>Clear filters</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {items.length > 0 && (
          <Text style={styles.resultCount}>
            {hasFilters
              ? `${visible.length} of ${items.length} fingerprints`
              : `${items.length} fingerprint${items.length !== 1 ? 's' : ''}`}
          </Text>
        )}

        {/* List */}
        {visible.map(record => {
          const isSelected = selectedIds.includes(record.id);
          const tags = parseTags(record.tagsJson);
          return (
            <TouchableOpacity
              key={record.id}
              activeOpacity={0.7}
              onPress={() => handlePress(record.id)}
              style={[styles.card, isSelected && styles.cardSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelectMode && isSelected }}>
              <View style={styles.itemRow}>
                {isSelectMode && (
                  <View
                    style={[styles.check, isSelected && styles.checkOn]}
                    accessible={false}>
                    {isSelected && <CheckIcon />}
                  </View>
                )}

                <View style={styles.miniRadarBox}>
                  <RecordRadar record={record} size={56} />
                </View>

                <View style={styles.itemText}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {record.title || 'Untitled'}
                  </Text>
                  <Text style={styles.itemSub}>
                    {capturedLabel(record.recordedAt)}
                  </Text>
                  {!!record.description && (
                    <Text style={styles.itemNote} numberOfLines={2}>
                      {record.description}
                    </Text>
                  )}
                  {tags.length > 0 && (
                    <View style={styles.tagsRow}>
                      {tags.slice(0, 3).map(t => (
                        <View key={t} style={styles.tagChip}>
                          <Text style={styles.tagText}>{t}</Text>
                        </View>
                      ))}
                      {tags.length > 3 && (
                        <Text style={styles.moreTags}>+{tags.length - 3}</Text>
                      )}
                    </View>
                  )}
                </View>

                {record.photoPath ? (
                  <Image
                    source={{ uri: `file://${record.photoPath}` }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.noPhoto}>
                    <CameraIcon />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {items.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No fingerprints saved yet</Text>
            <Text style={styles.emptyText}>
              Create a fingerprint to get started
            </Text>
          </View>
        )}

        {items.length > 0 && visible.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyText}>
              No fingerprints fit these filters.
            </Text>
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={clearFilters}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {isSelectMode && (
        <View style={styles.footer}>
          <Text style={styles.footerCaption}>
            {selectedIds.length === 0
              ? 'Tap fingerprints to select them'
              : `${selectedIds.length} selected`}
          </Text>
          <View style={styles.footerButtons}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                selectedIds.length < 2 && styles.buttonOff,
              ]}
              onPress={() => setShowComparison(true)}
              disabled={selectedIds.length < 2}
              accessibilityRole="button">
              <Text
                style={[
                  styles.primaryButtonText,
                  selectedIds.length < 2 && styles.buttonTextOff,
                ]}>
                Analyse
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dangerButton,
                selectedIds.length === 0 && styles.buttonOff,
              ]}
              onPress={handleDelete}
              disabled={selectedIds.length === 0}
              accessibilityRole="button">
              <Text
                style={[
                  styles.dangerButtonText,
                  selectedIds.length === 0 && styles.buttonTextOff,
                ]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: '600', color: COLORS.ink },
  headerPill: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cfd3cc',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
  },
  headerPillText: { fontSize: 14, fontWeight: '500', color: COLORS.ink },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
    gap: 12,
  },
  scrollContentWithFooter: { paddingBottom: 140 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  cardSelected: {
    borderColor: COLORS.green,
    backgroundColor: COLORS.greenTint,
  },

  // Search + filters
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.ink, paddingVertical: 8 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cfd3cc',
    backgroundColor: COLORS.surface,
  },
  filterButtonOn: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  filterButtonText: { fontSize: 14, fontWeight: '500', color: COLORS.ink },
  filterButtonTextOn: { color: '#fff' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  filterPanel: {
    gap: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: COLORS.muted },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    fontSize: 16,
    color: COLORS.ink,
  },
  inputError: { borderColor: COLORS.red, backgroundColor: COLORS.surface },
  errorText: { fontSize: 13, fontWeight: '500', color: COLORS.red },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 1 },

  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cfd3cc',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  segmentText: { fontSize: 14, fontWeight: '500', color: COLORS.ink },
  segmentTextOn: { color: '#fff' },

  clearButton: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearOff: { opacity: 0.4 },
  clearButtonText: { fontSize: 14, fontWeight: '500', color: COLORS.green },

  resultCount: { fontSize: 13, color: COLORS.muted, paddingHorizontal: 4 },

  // List items
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#9a9d96',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  miniRadarBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { fontSize: 16, fontWeight: '500', color: COLORS.ink },
  itemSub: { fontSize: 13, color: COLORS.muted },
  itemNote: { fontSize: 14, lineHeight: 20, color: COLORS.muted, marginTop: 2 },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  tagChip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLORS.greenTint,
  },
  tagText: { fontSize: 12, fontWeight: '500', color: COLORS.green },
  moreTags: { fontSize: 12, color: COLORS.muted },
  thumbnail: { width: 56, height: 56, borderRadius: 14 },
  noPhoto: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty states
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: COLORS.ink },
  emptyText: { fontSize: 15, color: COLORS.muted, textAlign: 'center' },
  outlineButton: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.green,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: { fontSize: 14, fontWeight: '500', color: COLORS.green },

  // Select-mode footer
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  footerCaption: { fontSize: 13, color: COLORS.muted, textAlign: 'center' },
  footerButtons: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '500', color: '#fff' },
  dangerButton: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.red,
    backgroundColor: COLORS.redTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: { fontSize: 16, fontWeight: '500', color: COLORS.red },
  buttonOff: {
    backgroundColor: COLORS.disabledBg,
    borderColor: COLORS.disabledBg,
  },
  buttonTextOff: { color: COLORS.disabledText },
});

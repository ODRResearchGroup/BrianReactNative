import { View, Text, StyleSheet } from 'react-native';
import { Level } from '../types';
import { levelStyles } from '../utils';
import { COLORS } from '../../../../consts';

export default function LevelBadge({ word }: { word: Level | null }) {
  const tone = levelStyles(word);
  const filled =
    word === 'High' ? 3 : word === 'Medium' ? 2 : word === 'Low' ? 1 : 0;

  return (
    <View style={[styles.levelBadge, word ? tone.pill : styles.levelBadgeOff]}>
      <View style={styles.levelBars}>
        {[1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              styles.levelBar,
              i === 1 && styles.levelBar1,
              i === 2 && styles.levelBar2,
              i === 3 && styles.levelBar3,
              i <= filled ? tone.bar : styles.levelBarOff,
            ]}
          />
        ))}
      </View>
      <Text
        style={[styles.levelBadgeText, word ? tone.text : styles.textMuted]}>
        {word ?? 'No signal'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  textMuted: { color: COLORS.muted },

  levelBadge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  levelBadgeOff: { backgroundColor: COLORS.bg },

  levelBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },

  levelBar: { width: 4, borderRadius: 1 },
  levelBar1: { height: 8 },
  levelBar2: { height: 11 },
  levelBar3: { height: 14 },
  levelBarOff: { backgroundColor: 'rgba(0,0,0,0.14)' },

  levelBadgeText: { fontSize: 13, fontWeight: '500' },
});

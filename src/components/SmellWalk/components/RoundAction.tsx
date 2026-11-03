import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../consts';

export default function RoundAction({
  icon,
  label,
  onPress,
  tone,
  muted,
  accessibilityLabel,
  accessibilityHint,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  tone: 'primary' | 'danger' | 'light';
  muted?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!muted }}
      style={({ pressed }) => [
        styles.roundActionWrap,
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          styles.roundAction,
          tone === 'primary' && styles.roundActionPrimary,
          tone === 'danger' && styles.roundActionDanger,
          tone === 'light' && styles.roundActionLight,
          muted && styles.roundActionMuted,
        ]}>
        {icon}
      </View>
      <View style={styles.roundActionLabelChip}>
        <Text style={styles.roundActionLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  roundActionWrap: {
    alignItems: 'center',
    gap: 6,
  },
  roundAction: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  roundActionPrimary: { backgroundColor: COLORS.green },
  roundActionDanger: { backgroundColor: COLORS.red },
  roundActionLight: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roundActionMuted: { opacity: 0.55 },

  roundActionLabelChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  roundActionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.ink,
  },
});

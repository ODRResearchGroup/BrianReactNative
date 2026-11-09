import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../../../consts';
import Dot from './Dot';

export default function DataRow({
  label,
  value,
  first,
  swatch,
  extra,
}: {
  label: string;
  value: string;
  first?: boolean;
  swatch?: string;
  extra?: React.ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.dataRow, !first && styles.dataRowBorder]}>
      <View style={styles.dataRowLeft}>
        {swatch ? <Dot color={swatch} /> : null}
        <Text style={styles.dataLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.dataRowRight}>
        {extra}
        <Text style={styles.dataValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 52,
    paddingVertical: 12,
  },

  dataRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },

  dataRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  dataRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  dataLabel: { flexShrink: 1, fontSize: 15, color: COLORS.ink },

  dataValue: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
});

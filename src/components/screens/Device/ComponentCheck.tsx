import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import { BoardStatusDefinition } from '../../../sensors';
import { COLORS } from '../../../consts';

export type HardwareRowData = BoardStatusDefinition & { present: boolean };

export function HardwareRow({
  board,
  divided,
}: {
  board: HardwareRowData;
  divided: boolean;
}) {
  return (
    <View style={[styles.hwRow, divided && styles.rowDivider]}>
      <View
        style={[
          styles.hwIcon,
          {
            backgroundColor: board.present
              ? COLORS.greenTint
              : COLORS.amberTint,
          },
        ]}>
        {board.present ? (
          <Check color={COLORS.green} size={16} strokeWidth={3} />
        ) : (
          <AlertTriangle color={COLORS.amber} size={16} />
        )}
      </View>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{board.label}</Text>
        <Text style={styles.caption}>
          {board.description ??
            board.sensors.map(sensor => sensor.chartLabel).join(', ')}
        </Text>

        {!board.present && (
          <Text style={styles.caption}>
            Not responding. Check the connection on the board.
          </Text>
        )}
      </View>
      <Text
        style={[
          styles.hwStatus,
          board.present ? styles.textGreen : styles.textAmber,
        ]}>
        {board.present ? 'Detected' : 'Missing'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  hwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  hwIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { fontSize: 16, fontWeight: '600', color: COLORS.ink },
  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },
  hwStatus: { fontSize: 14 },
  textGreen: { color: COLORS.green, fontWeight: '500' },
  textAmber: { color: COLORS.amber, fontWeight: '500' },
});

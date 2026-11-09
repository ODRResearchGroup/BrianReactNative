import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
} from 'lucide-react-native';
import { COLORS } from '../../consts';

type BatteryIndicatorProps = {
  percentage?: number;
};

type BatteryLifetimeProps = {
  runtimeHours?: number;
};

export function BatteryIndicator({ percentage }: BatteryIndicatorProps) {
  const hasPercentage =
    typeof percentage === 'number' && Number.isFinite(percentage);
  const boundedPercentage = hasPercentage
    ? Math.max(0, Math.min(100, percentage))
    : undefined;
  const color =
    boundedPercentage === undefined
      ? '#999'
      : boundedPercentage < 10
      ? COLORS.red
      : boundedPercentage < 30
      ? COLORS.amber
      : boundedPercentage < 70
      ? COLORS.yellow
      : COLORS.green;
  const Icon =
    boundedPercentage === undefined
      ? Battery
      : boundedPercentage < 10
      ? BatteryWarning
      : boundedPercentage < 30
      ? BatteryLow
      : boundedPercentage < 70
      ? BatteryMedium
      : BatteryFull;

  return (
    <View style={styles.indicator}>
      <Text style={[styles.percentage, { color }]}>
        {boundedPercentage && `${Math.round(boundedPercentage)}%`}
      </Text>
      <Icon color={color} size={22} />
    </View>
  );
}

export function BatteryLifetime({ runtimeHours }: BatteryLifetimeProps) {
  const hasRuntime =
    typeof runtimeHours === 'number' &&
    Number.isFinite(runtimeHours) &&
    runtimeHours >= 0;

  return (
    <Text style={styles.lifetime}>
      {hasRuntime
        ? `Estimated life: ${runtimeHours.toFixed(1)} h`
        : 'Estimated life unavailable'}
    </Text>
  );
}

const styles = StyleSheet.create({
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  percentage: {
    fontSize: 15,
    fontWeight: '600',
  },
  lifetime: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});

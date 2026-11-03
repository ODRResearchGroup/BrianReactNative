import { Pressable, View, Text, StyleSheet } from 'react-native';
import CustomRadarChart from '../../common/CustomRadarChart';
import { COLORS } from '../consts';
import { SensorAnalysis } from '../types';
import WaitIcon from './icons/WaitIcon';

export default function InlineRadar({
  sensors,
  hasData,
  onPress,
}: {
  sensors: SensorAnalysis[];
  hasData: boolean;
  onPress: () => void;
}) {
  const RADAR_SIZE = 128;

  const radarValues = sensors.map(s => ({
    x: s.label,
    y: s.current ?? 0,
  }));

  const maxVal = Math.max(1, ...radarValues.map(v => v.y));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Gas sensor radar chart. Tap to expand."
      style={({ pressed }) => [
        styles.inlineRadarWrap,
        pressed && styles.pressed,
      ]}>
      {hasData ? (
        <CustomRadarChart
          data={[
            {
              key: 'live',
              title: 'Live',
              values: radarValues,
              color: {
                fill: 'hsla(210, 100%, 50%, 0.25)',
                stroke: 'hsla(210, 100%, 40%, 1)',
              },
            },
          ]}
          size={RADAR_SIZE}
          maxValue={maxVal}
          gridLevels={3}
          zoomLevel={1}
          hideLabels
        />
      ) : (
        <View style={styles.inlineRadarEmpty}>
          <WaitIcon size={18} color={COLORS.muted} />
          <Text style={styles.caption}>No signal</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },

  inlineRadarWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    paddingBottom: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  inlineRadarEmpty: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});

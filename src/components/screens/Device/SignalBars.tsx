import { StyleSheet, View } from 'react-native';
import { COLORS } from '../../../consts';

export default function SignalBars({ bars }: { bars: number }) {
  return (
    <View style={styles.signalBars} accessibilityElementsHidden>
      {[1, 2, 3].map(i => (
        <View
          key={i}
          style={[
            styles.signalBar,
            { height: 5 + i * 4 },
            i <= bars ? styles.signalBarOn : styles.signalBarOff,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  signalBar: { width: 5, borderRadius: 2 },
  signalBarOn: { backgroundColor: COLORS.green },
  signalBarOff: { backgroundColor: COLORS.border },
});

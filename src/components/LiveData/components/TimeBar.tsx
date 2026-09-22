import React, { useEffect } from 'react';
import { View, StyleSheet, Text, Dimensions, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface TimedProgressBarProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: () => void; // <-- new callback
  duration?: number;
}

export default function TimedProgressBar({
  visible,
  onClose,
  onComplete,
  duration = 15000,
}: TimedProgressBarProps) {
  const progress = useSharedValue(0);

  // Store the window width once
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (visible) {
      progress.value = 0; // reset
      progress.value = withTiming(1, {
        duration,
        easing: Easing.linear,
      });

      const timer = setTimeout(() => {
        onClose(); // hide progress bar
        if (onComplete) {
          onComplete();
        } // notify parent
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose, onComplete, progress, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: progress.value * (screenWidth - 40), // use stored width
  }));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackground}>
        <View style={styles.container}>
          <Text style={styles.label}>Fingerprinting, stay a while...</Text>
          <View style={styles.progressBackground}>
            <Animated.View style={[styles.progressBar, animatedStyle]} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 12,
    fontWeight: '500',
  },
  progressBackground: {
    width: '100%',
    height: 30,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1e92a3ff',
    borderRadius: 10,
  },
});

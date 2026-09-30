import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface TimedProgressBarProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: () => void;
  duration?: number;
}

export default function TimedProgressBar({
  visible,
  onClose,
  onComplete,
  duration = 15000,
}: TimedProgressBarProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: false, // width animation can't use native driver
      }).start();

      const timer = setTimeout(() => {
        onClose();
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, onClose, onComplete, progress]);

  const animatedWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, screenWidth - 40],
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackground}>
        <View style={styles.container}>
          <Text style={styles.label}>Fingerprinting, stay a while...</Text>
          <View style={styles.progressBackground}>
            <Animated.View
              style={[styles.progressBar, { width: animatedWidth }]}
            />
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

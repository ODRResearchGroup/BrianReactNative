import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Volume2, Camera } from 'lucide-react-native';
import { countCaptures } from '../../services/database/db';
import { usePressAnimation } from '../../hooks/usePressAnimation';

const C = {
  black: '#1A1A1A',
  darkGray: '#4D4D4D',
  lightGray: '#B3B3B3',
  white: '#FAFAFA',
};

type Props = NativeStackScreenProps<RootStackParamList, 'AddAnnotation'>;

function NoteButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  const { scale, handlers, fireHaptic } = usePressAnimation({
    scaleTo: 0.94,
    haptic: 'medium',
  });
  return (
    <TouchableWithoutFeedback
      onPress={() => {
        fireHaptic();
        onPress();
      }}
      {...handlers}>
      <Animated.View style={[styles.button, { transform: [{ scale }] }]}>
        <Text style={styles.buttonLabel}>{label}</Text>
        {icon}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

export default function AddAnnotationScreen({ navigation, route }: Props) {
  const { sensorRecordId } = route.params ?? {};
  const [nextIndex, setNextIndex] = useState(1);

  useEffect(() => {
    countCaptures()
      .then(n => setNextIndex(n + 1))
      .catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <View style={styles.container}>
        <NoteButton
          label="Audio Note"
          icon={<Volume2 size={28} color={C.white} strokeWidth={1.75} />}
          onPress={() =>
            navigation.navigate('AudioAnnotation', {
              annotationIndex: nextIndex,
              sensorRecordId,
            })
          }
        />
        <NoteButton
          label="Photo Note"
          icon={<Camera size={28} color={C.white} strokeWidth={1.75} />}
          onPress={() =>
            navigation.navigate('ShootPic', {
              annotationIndex: nextIndex,
              sensorRecordId,
            })
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 32,
    gap: 16,
  },
  button: {
    backgroundColor: C.black,
    borderRadius: 16,
    width: 200,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.2,
  },
});

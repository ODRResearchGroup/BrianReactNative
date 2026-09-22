import React, { useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera } from 'lucide-react-native';
import { RootStackParamList } from '../../App';
import { capturePhoto } from '../../services/photos/photoCapture';
import { getOneShotLocation } from '../../services/photos/photoLocation';
import { usePressAnimation } from '../../hooks/usePressAnimation';

const C = {
  black: '#1A1A1A',
  darkGray: '#4D4D4D',
  lightGray: '#B3B3B3',
  white: '#FAFAFA',
};

const formatCoord = (lat: number, lon: number) => ({
  latitude: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`,
  longitude: `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`,
});

const formatTimestamp = (ms: number) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(v => String(v).padStart(2, '0'))
    .join(':');
};

type Props = NativeStackScreenProps<RootStackParamList, 'ShootPic'>;

export default function ShootPicScreen({ navigation, route }: Props) {
  const { annotationIndex, sensorRecordId } = route.params;
  const [loading, setLoading] = useState(false);
  const { scale, handlers, fireHaptic } = usePressAnimation({
    scaleTo: 0.9,
    haptic: 'medium',
  });

  const handleCapture = async () => {
    if (loading) {
      return;
    }
    fireHaptic();
    setLoading(true);
    try {
      const [photo, location] = await Promise.all([
        capturePhoto(),
        getOneShotLocation(),
      ]);
      const capturedAtMs = Date.now();
      const coords = location
        ? formatCoord(location.lat, location.lon)
        : { latitude: '00.0000° N', longitude: '00.0000° E' };
      navigation.navigate('PhotoAnnotation', {
        annotationIndex,
        photoUri: photo.uri,
        timestamp: formatTimestamp(capturedAtMs),
        capturedAtMs,
        ...coords,
        latitudeRaw: location?.lat ?? null,
        longitudeRaw: location?.lon ?? null,
        accuracyM: location?.accuracy_m ?? null,
        sensorRecordId,
      });
    } catch (err: any) {
      if (err.message !== 'Cancelled') {
        Alert.alert('Error', err.message ?? String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.viewfinder}>
        <Text style={styles.hint}>
          {loading ? 'Opening camera…' : 'Tap the button to take a photo'}
        </Text>
      </View>
      <View style={styles.shutterBar}>
        <TouchableWithoutFeedback
          onPress={handleCapture}
          {...handlers}
          disabled={loading}>
          <Animated.View
            style={[
              styles.shutterButton,
              loading && styles.shutterDisabled,
              { transform: [{ scale }] },
            ]}>
            {loading ? (
              <ActivityIndicator color={C.black} size="small" />
            ) : (
              <Camera size={30} color={C.black} strokeWidth={1.75} />
            )}
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  viewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: {
    fontSize: 14,
    color: C.lightGray,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  shutterBar: {
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
    backgroundColor: '#000',
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  shutterDisabled: { backgroundColor: C.lightGray },
});

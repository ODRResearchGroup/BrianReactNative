import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { AppState, ImageBackground, StatusBar, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Bluetooth,
  Bookmark,
  FingerprintPattern,
  Footprints,
  MapPinned,
} from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BLEProvider } from './BLEUniversal';
import { BaselineProvider } from './components/common/BaselineContext';
import FingerprintsHistory from './components/FingerprintsHistory/FingerprintsHistory';
import LiveData from './components/LiveData/LiveData';
import MappedFingerprints from './components/MappedFingerprints/MappedFingerprints';
import BLEScreen from './components/BLE/BLEScreen';
import SmellWalkScreen from './components/SmellWalk/SmellWalkScreen';
import { InfluxDBProvider } from './services/influx/InfluxDBService';
import { runSyncWorker } from './services/sync/syncWorker';
import { checkAndPromptForAppUpdate } from './services/updates/appUpdater';
import Mapbox from '@rnmapbox/maps';
import Config from 'react-native-config';

// ─── Navigation param types ───────────────────────────────────────────────────

export type RootStackParamList = {
  DataHome: undefined;
  LiveData: undefined;
  SmellWalk: undefined;
  History: undefined;
  Analysis: undefined;
  AnnotationFeed: undefined;
  AddAnnotation: { sensorRecordId?: string };
  AudioAnnotation: { annotationIndex: number; sensorRecordId?: string };
  ShootPic: { annotationIndex: number; sensorRecordId?: string };
  PhotoAnnotation: {
    annotationIndex: number;
    photoUri: string;
    timestamp: string;
    capturedAtMs: number;
    latitude: string;
    longitude: string;
    latitudeRaw: number | null;
    longitudeRaw: number | null;
    accuracyM: number | null;
    sensorRecordId?: string;
  };
  EditAnnotationTags: { annotationId: string };
};

const Tab = createBottomTabNavigator();

const renderDeviceIcon = ({ color, size }: { color: string; size: number }) => (
  <Bluetooth color={color} size={size} />
);
const renderMapIcon = ({ color, size }: { color: string; size: number }) => (
  <MapPinned color={color} size={size} />
);

const renderFingerprintIcon = ({
  color,
  size,
}: {
  color: string;
  size: number;
}) => <FingerprintPattern color={color} size={size} />;

const renderWalkIcon = ({ color, size }: { color: string; size: number }) => (
  <Footprints color={color} size={size} />
);

const renderSavedIcon = ({ color, size }: { color: string; size: number }) => (
  <Bookmark color={color} size={size} />
);

export default function App() {
  useEffect(() => {
    Mapbox.setAccessToken(Config.MAPBOX_PUBLIC_TOKEN ?? '');
  }, []);

  useEffect(() => {
    runSyncWorker().catch(() => {});
    checkAndPromptForAppUpdate();
    const interval = setInterval(() => {
      runSyncWorker().catch(() => {});
    }, 15_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runSyncWorker().catch(() => {});
        checkAndPromptForAppUpdate();
      }
    });
    const connectivitySub = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        runSyncWorker().catch(() => {});
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
      connectivitySub();
    };
  }, []);

  return (
    <InfluxDBProvider>
      <BLEProvider>
        <BaselineProvider>
          <GestureHandlerRootView style={styles.root}>
            <SafeAreaProvider>
              <StatusBar barStyle="light-content" />
              <SafeAreaView style={styles.safe} edges={['top']}>
                <ImageBackground
                  source={require('./pics/background.jpg')}
                  style={styles.background}
                  imageStyle={styles.backgroundImage}>
                  <NavigationContainer>
                    <Tab.Navigator
                      initialRouteName="Fingerprint"
                      screenOptions={{
                        headerShown: false,
                        sceneStyle: { backgroundColor: 'transparent' },
                      }}>
                      <Tab.Screen
                        name="Fingerprint"
                        component={LiveData}
                        options={{ tabBarIcon: renderFingerprintIcon }}
                      />
                      <Tab.Screen
                        name="Smell Walk"
                        component={SmellWalkScreen}
                        options={{ tabBarIcon: renderWalkIcon }}
                      />
                      <Tab.Screen
                        name="Saved"
                        component={FingerprintsHistory}
                        options={{ tabBarIcon: renderSavedIcon }}
                      />
                      <Tab.Screen
                        name="Map"
                        component={MappedFingerprints}
                        options={{ tabBarIcon: renderMapIcon }}
                      />
                      <Tab.Screen
                        name="Device"
                        component={BLEScreen}
                        options={{ tabBarIcon: renderDeviceIcon }}
                      />
                    </Tab.Navigator>
                  </NavigationContainer>
                </ImageBackground>
              </SafeAreaView>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </BaselineProvider>
      </BLEProvider>
    </InfluxDBProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#1f5c3f' },
  background: { flex: 1, width: '100%', height: '100%' },
  backgroundImage: { resizeMode: 'cover' },
});

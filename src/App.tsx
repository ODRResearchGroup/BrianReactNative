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
import SmellWalkScreen from './components/screens/SmellWalk/SmellWalkScreen';
import { InfluxDBProvider } from './services/influx/InfluxDBService';
import { runSyncWorker } from './services/sync/syncWorker';
import { checkAndPromptForAppUpdate } from './services/updates/appUpdater';
import Mapbox from '@rnmapbox/maps';
import Config from 'react-native-config';
import SavedFingerprintsScreen from './components/screens/SavedFingerprints/SavedFingerprintsScreen';
import DeviceScreen from './components/screens/Device/DeviceScreen';
import FingerprintLiveDataScreen from './components/screens/FingerprintLiveData/FingerprintLiveDataScreen';
import FingerprintMapScreen from './components/screens/FingerprintMap/FingerprintMapScreen';

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
                        tabBarActiveTintColor: '#1f5c3f',
                      }}>
                      <Tab.Screen
                        name="Fingerprint"
                        component={FingerprintLiveDataScreen}
                        options={{ tabBarIcon: renderFingerprintIcon }}
                      />
                      <Tab.Screen
                        name="Smell Walk"
                        component={SmellWalkScreen}
                        options={{ tabBarIcon: renderWalkIcon }}
                      />
                      <Tab.Screen
                        name="Saved"
                        component={SavedFingerprintsScreen}
                        options={{ tabBarIcon: renderSavedIcon }}
                      />
                      <Tab.Screen
                        name="Map"
                        component={FingerprintMapScreen}
                        options={{ tabBarIcon: renderMapIcon }}
                      />
                      <Tab.Screen
                        name="Device"
                        component={DeviceScreen}
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

import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { AppState, ImageBackground, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Bluetooth, Home, MapPinned } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BLEProvider } from './BLEUniversal';
import Analysis from './components/Analysis/Analysis';
import { BaselineProvider } from './components/common/BaselineContext';
import FingerprintsHistory from './components/FingerprintsHistory/FingerprintsHistory';
import LiveData from './components/LiveData/LiveData';
import MappedFingerprints from './components/MappedFingerprints/MappedFingerprints';
import AddAnnotationScreen from './components/AddAnnotation/AddAnnotationScreen';
import AnnotationFeed from './components/AnnotationFeed/AnnotationFeed';
import AudioAnnotationScreen from './components/AudioAnnotation/AudioAnnotationScreen';
import BLEScreen from './components/BLE/BLEScreen';
import DataDisplay from './components/DataDisplay/DataDisplay';
import EditAnnotationTagsScreen from './components/EditAnnotationTags/EditAnnotationTagsScreen';
import PhotoAnnotationScreen from './components/PhotoAnnotation/PhotoAnnotationScreen';
import ShootPicScreen from './components/ShootPic/ShootPicScreen';
import SmellWalkScreen from './components/SmellWalk/SmellWalkScreen';
import { runAudioProcessingPoller } from './services/audio/audioProcessingPoller';
import { InfluxDBProvider } from './services/influx/InfluxDBService';
import { runSyncWorker } from './services/sync/syncWorker';
import { checkAndPromptForAppUpdate } from './services/updates/appUpdater';

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
const Stack = createNativeStackNavigator<RootStackParamList>();

const renderHomeIcon = ({ color, size }: { color: string; size: number }) => (
  <Home color={color} size={size} />
);
const renderDeviceIcon = ({ color, size }: { color: string; size: number }) => (
  <Bluetooth color={color} size={size} />
);
const renderMapIcon = ({ color, size }: { color: string; size: number }) => (
  <MapPinned color={color} size={size} />
);

function DataStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}>
      <Stack.Screen name="DataHome" component={DataDisplay} />
      <Stack.Screen name="LiveData" component={LiveData} />
      <Stack.Screen name="SmellWalk" component={SmellWalkScreen} />
      <Stack.Screen name="History" component={FingerprintsHistory} />
      <Stack.Screen name="Analysis" component={Analysis} />
      <Stack.Screen name="AnnotationFeed" component={AnnotationFeed} />
      <Stack.Screen name="AddAnnotation" component={AddAnnotationScreen} />
      <Stack.Screen name="AudioAnnotation" component={AudioAnnotationScreen} />
      <Stack.Screen name="ShootPic" component={ShootPicScreen} />
      <Stack.Screen name="PhotoAnnotation" component={PhotoAnnotationScreen} />
      <Stack.Screen
        name="EditAnnotationTags"
        component={EditAnnotationTagsScreen}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    runSyncWorker().catch(() => {});
    runAudioProcessingPoller().catch(() => {});
    checkAndPromptForAppUpdate();
    const interval = setInterval(() => {
      runSyncWorker().catch(() => {});
      runAudioProcessingPoller().catch(() => {});
    }, 15_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runSyncWorker().catch(() => {});
        runAudioProcessingPoller().catch(() => {});
        checkAndPromptForAppUpdate();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return (
    <InfluxDBProvider>
      <BLEProvider>
        <BaselineProvider>
          <GestureHandlerRootView style={styles.root}>
            <SafeAreaProvider>
              <ImageBackground
                source={require('./pics/background.jpg')}
                style={styles.background}
                imageStyle={styles.backgroundImage}>
                <NavigationContainer>
                  <Tab.Navigator
                    initialRouteName="Home"
                    screenOptions={{
                      headerShown: false,
                      sceneStyle: { backgroundColor: 'transparent' },
                    }}>
                    <Tab.Screen
                      name="Home"
                      component={DataStack}
                      options={{ tabBarIcon: renderHomeIcon }}
                    />
                    <Tab.Screen
                      name="Device"
                      component={BLEScreen}
                      options={{ tabBarIcon: renderDeviceIcon }}
                    />
                    <Tab.Screen
                      name="Map"
                      component={MappedFingerprints}
                      options={{ tabBarIcon: renderMapIcon }}
                    />
                  </Tab.Navigator>
                </NavigationContainer>
              </ImageBackground>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </BaselineProvider>
      </BLEProvider>
    </InfluxDBProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  background: { flex: 1, width: '100%', height: '100%' },
  backgroundImage: { resizeMode: 'cover' },
});

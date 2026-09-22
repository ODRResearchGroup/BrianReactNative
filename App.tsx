import 'react-native-gesture-handler';
import React, {useEffect} from 'react';
import {AppState, ImageBackground, StyleSheet} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {BLEProvider} from './BLEUniversal';
import Analysis from './components/analysis';
import {BaselineProvider} from './components/BaselineContext';
import FingerprintsHistory from './components/FingerprintsHistory';
import LiveData from './components/LiveData';
import MappedFingerprints from './components/MappedFingerprints';
import MiniMapOverlay from './components/MiniMapOverlay';
import AddAnnotationScreen from './screens/AddAnnotationScreen';
import AnnotationFeed from './screens/AnnotationFeed';
import AudioAnnotationScreen from './screens/AudioAnnotationScreen';
import BLEScreen from './screens/BLEScreen';
import DataDisplay from './screens/DataDisplay';
import EditAnnotationTagsScreen from './screens/EditAnnotationTagsScreen';
import PhotoAnnotationScreen from './screens/PhotoAnnotationScreen';
import ShootPicScreen from './screens/ShootPicScreen';
import {runAudioProcessingPoller} from './services/audioProcessingPoller';
import {runSyncWorker} from './services/syncWorker';

// ─── Navigation param types ───────────────────────────────────────────────────

export type RootStackParamList = {
  DataHome: undefined;
  LiveData: undefined;
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

function DataStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: 'transparent'},
      }}>
      <Stack.Screen name="DataHome" component={DataDisplay} />
      <Stack.Screen name="LiveData" component={LiveData} />
      <Stack.Screen name="History" component={FingerprintsHistory} />
      <Stack.Screen name="Analysis" component={Analysis} />
      <Stack.Screen name="AnnotationFeed" component={AnnotationFeed} />
      <Stack.Screen name="AddAnnotation" component={AddAnnotationScreen} />
      <Stack.Screen name="AudioAnnotation" component={AudioAnnotationScreen} />
      <Stack.Screen name="ShootPic" component={ShootPicScreen} />
      <Stack.Screen name="PhotoAnnotation" component={PhotoAnnotationScreen} />
      <Stack.Screen name="EditAnnotationTags" component={EditAnnotationTagsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    runSyncWorker().catch(() => {});
    runAudioProcessingPoller().catch(() => {});
    const interval = setInterval(() => {
      runSyncWorker().catch(() => {});
      runAudioProcessingPoller().catch(() => {});
    }, 15_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runSyncWorker().catch(() => {});
        runAudioProcessingPoller().catch(() => {});
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return (
    <BLEProvider>
      <BaselineProvider>
        <GestureHandlerRootView style={{flex: 1}}>
          <SafeAreaProvider>
            <ImageBackground
              source={require('./pics/background.jpg')}
              style={styles.background}
              imageStyle={{resizeMode: 'cover'}}>
              <NavigationContainer>
                <Tab.Navigator
                  initialRouteName="Home"
                  screenOptions={{
                    headerShown: false,
                    sceneStyle: {backgroundColor: 'transparent'},
                  }}>
                  <Tab.Screen name="Home" component={DataStack} />
                  <Tab.Screen name="Device" component={BLEScreen} />
                  <Tab.Screen name="Map" component={MappedFingerprints} />
                </Tab.Navigator>
              </NavigationContainer>
              <MiniMapOverlay />
            </ImageBackground>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </BaselineProvider>
    </BLEProvider>
  );
}

const styles = StyleSheet.create({
  background: {flex: 1, width: '100%', height: '100%'},
});

/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-gesture-handler', () => {
  return {
    GestureHandlerRootView: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
    SafeAreaView: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('@react-navigation/native', () => {
  return {
    NavigationContainer: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({children}: {children: React.ReactNode}) => children,
    Screen: () => null,
  }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({children}: {children: React.ReactNode}) => children,
    Screen: () => null,
  }),
}));

jest.mock('../BLEUniversal', () => {
  return {
    BLEProvider: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('../components/BaselineContext', () => {
  return {
    BaselineProvider: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('../components/MiniMapOverlay', () => () => null);
jest.mock('../components/LiveData', () => () => null);
jest.mock('../components/FingerprintsHistory', () => () => null);
jest.mock('../components/analysis', () => () => null);
jest.mock('../components/MappedFingerprints', () => () => null);
jest.mock('../screens/AddAnnotationScreen', () => () => null);
jest.mock('../screens/AnnotationFeed', () => () => null);
jest.mock('../screens/AudioAnnotationScreen', () => () => null);
jest.mock('../screens/BLEScreen', () => () => null);
jest.mock('../screens/DataDisplay', () => () => null);
jest.mock('../screens/EditAnnotationTagsScreen', () => () => null);
jest.mock('../screens/PhotoAnnotationScreen', () => () => null);
jest.mock('../screens/ShootPicScreen', () => () => null);
jest.mock('../services/audioProcessingPoller', () => ({
  runAudioProcessingPoller: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/syncWorker', () => ({
  runSyncWorker: jest.fn().mockResolvedValue(undefined),
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

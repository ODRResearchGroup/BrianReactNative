/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-gesture-handler', () => {
  return {
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@react-navigation/native', () => {
  return {
    NavigationContainer: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

jest.mock('../src/BLEUniversal', () => {
  return {
    BLEProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('../src/components/common/BaselineContext', () => {
  return {
    BaselineProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('../src/services/influx/InfluxDBService', () => ({
  InfluxDBProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/components/LiveData/LiveData', () => () => null);
jest.mock(
  '../src/components/FingerprintsHistory/FingerprintsHistory',
  () => () => null,
);
jest.mock('../src/components/Analysis/Analysis', () => () => null);
jest.mock(
  '../src/components/MappedFingerprints/MappedFingerprints',
  () => () => null,
);
jest.mock(
  '../src/components/AddAnnotation/AddAnnotationScreen',
  () => () => null,
);
jest.mock('../src/components/AnnotationFeed/AnnotationFeed', () => () => null);
jest.mock(
  '../src/components/AudioAnnotation/AudioAnnotationScreen',
  () => () => null,
);
jest.mock('../src/components/BLE/BLEScreen', () => () => null);
jest.mock('../src/components/DataDisplay/DataDisplay', () => () => null);
jest.mock(
  '../src/components/EditAnnotationTags/EditAnnotationTagsScreen',
  () => () => null,
);
jest.mock(
  '../src/components/PhotoAnnotation/PhotoAnnotationScreen',
  () => () => null,
);
jest.mock('../src/components/ShootPic/ShootPicScreen', () => () => null);
jest.mock('../src/components/SmellWalk/SmellWalkScreen', () => () => null);
jest.mock('../src/services/audio/audioProcessingPoller', () => ({
  runAudioProcessingPoller: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/sync/syncWorker', () => ({
  runSyncWorker: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/tmp',
  downloadFile: jest.fn(() => ({
    promise: Promise.resolve({ statusCode: 200 }),
  })),
}));

import App from '../src/App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

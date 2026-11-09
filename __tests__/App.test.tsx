/**
 * @format
 */

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));

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

jest.mock('../src/BLEUniversal', () => ({
  BLEProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/components/common/BaselineContext', () => ({
  BaselineProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/services/influx/InfluxDBService', () => ({
  InfluxDBProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock(
  '../src/components/screens/FingerprintLiveData/FingerprintLiveDataScreen',
  () => () => null,
);

jest.mock(
  '../src/components/screens/SavedFingerprints/SavedFingerprintsScreen',
  () => () => null,
);

jest.mock(
  '../src/components/screens/FingerprintMap/FingerprintMapScreen',
  () => () => null,
);

jest.mock('../src/components/screens/Device/DeviceScreen', () => () => null);

jest.mock(
  '../src/components/screens/SmellWalk/SmellWalkScreen',
  () => () => null,
);

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

jest.mock('@rnmapbox/maps', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => jest.fn() }),
}));

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {},
  Config: {},
}));

import App from '../src/App';

test('renders correctly', async () => {
  const { unmount } = await render(<App />);

  await unmount();
});

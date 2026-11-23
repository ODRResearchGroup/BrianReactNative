import React from 'react';
import { act, render } from '@testing-library/react-native';

type MockPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  timestamp: number;
};

let mockLocationCallback: ((position: MockPosition) => void) | null = null;
const mockInsertSensorRecord = jest.fn().mockResolvedValue(undefined);
const mockWriteInfluxPoint = jest.fn().mockResolvedValue(undefined);
const mockEventEmitter = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
};

jest.mock('../src/BLEUniversal', () => ({
  eventEmitter: mockEventEmitter,
}));

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn((success: (position: MockPosition) => void) => {
      mockLocationCallback = success;
      return 1;
    }),
    clearWatch: jest.fn(),
    stopObserving: jest.fn(),
  },
}));

jest.mock('../src/services/database/db', () => ({
  completeWalk: jest.fn().mockResolvedValue(undefined),
  insertSensorRecord: mockInsertSensorRecord,
  interruptActiveWalks: jest.fn().mockResolvedValue(undefined),
  reactivateWalk: jest.fn().mockResolvedValue(undefined),
  updateWalkDevice: jest.fn().mockResolvedValue(undefined),
  upsertWalk: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/influx/client', () => ({
  InfluxClient: jest.fn().mockImplementation(() => ({
    writeTimeseriesPoint: mockWriteInfluxPoint,
  })),
}));

jest.mock('../src/services/background/SmellWalkBackgroundState', () => ({
  clearActiveWalkId: jest.fn().mockResolvedValue(undefined),
  clearPausedWalkId: jest.fn().mockResolvedValue(undefined),
  getActiveWalkId: jest.fn().mockResolvedValue(null),
  getPausedWalkId: jest.fn().mockResolvedValue(null),
  saveActiveWalkId: jest.fn().mockResolvedValue(undefined),
  savePausedWalkId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/background/SmellWalkForegroundService', () => ({
  requestForegroundServicePermission: jest.fn().mockResolvedValue(true),
  startSmellWalkForegroundService: jest.fn().mockResolvedValue(undefined),
  stopSmellWalkForegroundService: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/location/locationPermissions', () => ({
  ensureFullLocationAccess: jest.fn().mockResolvedValue({ granted: true }),
}));

const { InfluxDBProvider, useInfluxDB } =
  require('../src/services/influx/InfluxDBService') as typeof import('../src/services/influx/InfluxDBService');

let currentContext: ReturnType<typeof useInfluxDB> | null = null;

function ContextProbe() {
  currentContext = useInfluxDB();
  return null;
}

function getContext(): ReturnType<typeof useInfluxDB> {
  if (!currentContext) {
    throw new Error('InfluxDB context has not rendered');
  }
  return currentContext;
}

describe('InfluxDBProvider paused smell walks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockLocationCallback = null;
    currentContext = null;
    mockInsertSensorRecord.mockClear();
    mockWriteInfluxPoint.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores GPS-only samples during pause and resumes sensor capture', async () => {
    const { unmount } = await render(
      <InfluxDBProvider>
        <ContextProbe />
      </InfluxDBProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockLocationCallback).not.toBeNull();
    await act(async () => {
      mockLocationCallback?.({
        coords: { latitude: 55.605, longitude: 13.003, accuracy: 4 },
        timestamp: Date.now(),
      });
    });

    await act(async () => {
      await getContext().startSmellWalk(undefined, 'Brian-123456');
    });
    getContext().ingestReadings({ CH4: 1.2, TempC: 21 });

    await act(async () => {
      await getContext().pauseSmellWalk();
    });
    getContext().ingestReadings({ CH4: 9.9, TempC: 99 });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });

    expect(mockInsertSensorRecord).toHaveBeenCalledTimes(2);
    expect(mockInsertSensorRecord.mock.calls[0][0]).toEqual(
      expect.objectContaining({ ch4: 1.2, temperature: 21 }),
    );
    expect(mockInsertSensorRecord.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        latitude: 55.605,
        longitude: 13.003,
        accuracyM: 4,
        ch4: null,
        nh3: null,
        hcho: null,
        voc: null,
        odour: null,
        h2s: null,
        etoh: null,
        no2: null,
        co: null,
        smoke: null,
        h2: null,
        temperature: null,
        pressure: null,
        humidity: null,
        altitude: null,
        bme680GasResistance: null,
      }),
    );
    expect(mockWriteInfluxPoint).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fields: {
          latitude: 55.605,
          longitude: 13.003,
          accuracy_m: 4,
        },
      }),
    );

    await act(async () => {
      await getContext().resumeSmellWalk();
    });
    getContext().ingestReadings({ CH4: 3.4 });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });

    expect(mockInsertSensorRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ ch4: 3.4 }),
    );
    unmount();
  });
});

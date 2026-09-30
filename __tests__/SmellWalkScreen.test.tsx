import React from 'react';
import { render } from '@testing-library/react-native';

const mockActivateKeepAwake = jest.fn();
const mockDeactivateKeepAwake = jest.fn();
let mockIsSmellWalkActive = false;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
  useFocusEffect: jest.fn(),
}));

jest.mock('react-native-keep-awake', () => ({
  __esModule: true,
  default: {
    activate: () => mockActivateKeepAwake(),
    deactivate: () => mockDeactivateKeepAwake(),
  },
}));

jest.mock('../src/BLEUniversal', () => ({
  useBLE: () => ({
    characteristicValues: {},
    connectedDevice: null,
  }),
}));

jest.mock('../src/services/influx/InfluxDBService', () => ({
  useInfluxDB: () => ({
    location: null,
    trail: [],
    isSmellWalkActive: mockIsSmellWalkActive,
    startSmellWalk: jest.fn(),
    stopSmellWalk: jest.fn(),
  }),
}));

jest.mock('../src/components/common/LiveLocationMap', () => () => null);

jest.mock('../src/components/common/CustomRadarChart', () => () => null);

jest.mock('../src/components/common/FingerprintModal', () => () => null);

jest.mock('../src/services/sync/exportService', () => ({
  exportSmellWalkCsv: jest.fn(),
}));

import SmellWalkScreen from '../src/components/SmellWalk/SmellWalkScreen';

describe('SmellWalkScreen keep awake behavior', () => {
  beforeEach(() => {
    mockIsSmellWalkActive = false;
    jest.clearAllMocks();
  });

  it('activates keep awake and shows recording indicator during a walk', async () => {
    mockIsSmellWalkActive = true;

    const { getByText, unmount } = await render(<SmellWalkScreen />);

    expect(mockActivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(getByText('Recording')).toBeTruthy();

    await unmount();
  });

  it('does not touch keep awake when no walk is active', async () => {
    const { unmount } = await render(<SmellWalkScreen />);

    expect(mockDeactivateKeepAwake).not.toHaveBeenCalled();
    expect(mockActivateKeepAwake).not.toHaveBeenCalled();

    await unmount();
  });

  it('deactivates keep awake when an active walk ends', async () => {
    mockIsSmellWalkActive = true;

    const { rerender, unmount } = await render(<SmellWalkScreen />);

    expect(mockActivateKeepAwake).toHaveBeenCalled();

    mockIsSmellWalkActive = false;

    await rerender(<SmellWalkScreen />);

    expect(mockDeactivateKeepAwake).toHaveBeenCalled();

    await unmount();
  });

  it('deactivates keep awake when unmounting an active walk', async () => {
    mockIsSmellWalkActive = true;

    const { unmount } = await render(<SmellWalkScreen />);

    expect(mockActivateKeepAwake).toHaveBeenCalled();

    await unmount();

    expect(mockDeactivateKeepAwake).toHaveBeenCalled();
  });
});

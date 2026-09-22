import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import SmellWalkScreen from '../src/components/SmellWalk/SmellWalkScreen';

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

describe('SmellWalkScreen keep awake behavior', () => {
  beforeEach(() => {
    mockIsSmellWalkActive = false;
    jest.clearAllMocks();
  });

  it('activates keep awake and shows recording indicator during a walk', async () => {
    mockIsSmellWalkActive = true;

    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<SmellWalkScreen />);
    });

    expect(mockActivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByProps({ children: 'Recording' })).toBeTruthy();
  });

  it('deactivates keep awake when no walk is active', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<SmellWalkScreen />);
    });

    expect(mockDeactivateKeepAwake).toHaveBeenCalled();
    expect(mockActivateKeepAwake).not.toHaveBeenCalled();
  });

  it('deactivates keep awake when an active walk ends', async () => {
    mockIsSmellWalkActive = true;
    let tree: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<SmellWalkScreen />);
    });

    mockIsSmellWalkActive = false;
    await ReactTestRenderer.act(() => {
      tree!.update(<SmellWalkScreen />);
    });

    expect(mockActivateKeepAwake).toHaveBeenCalled();
    expect(mockDeactivateKeepAwake).toHaveBeenCalled();
  });

  it('deactivates keep awake when unmounting an active walk', async () => {
    mockIsSmellWalkActive = true;
    let tree: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<SmellWalkScreen />);
    });

    await ReactTestRenderer.act(() => {
      tree!.unmount();
    });

    expect(mockActivateKeepAwake).toHaveBeenCalled();
    expect(mockDeactivateKeepAwake).toHaveBeenCalled();
  });
});

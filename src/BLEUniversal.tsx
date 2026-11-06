import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import mitt from 'mitt';
import { AppEventEmitter, BLEDataUpdated } from './types/events';
import {
  BOARD_STATUS_CHARACTERISTIC_UUID,
  CUSTOM_SERVICE_UUID,
} from './sensors';

// Create a global event emitter instance
const eventEmitter: AppEventEmitter = mitt();
const ESS_SERVICE_UUID = '0000181a-0000-1000-8000-00805f9b34fb';
const CUSTOM_SERVICE_UUID_NORMALIZED = CUSTOM_SERVICE_UUID.toLowerCase();
const SCAN_DURATION_MS = 10000;
const BLUETOOTH_READY_TIMEOUT_MS = 5000;

// Export the event emitter so other components can use it
export { eventEmitter };

type BLEContextType = {
  manager: BleManager;
  devices: Device[];
  connectedDevice: Device | null;
  characteristicValues: { [key: string]: number };
  boardStatus: number | null;
  scanForDevices: () => Promise<void>;
  stopScan: () => void;
  connectToDevice: (device: Device) => Promise<Device>;
  enableNotifications: (
    device: Device,
    characteristics: {
      serviceUUID: string;
      characteristicUUID: string;
      label: string;
      format?: 'float32' | 'uint8' | 'gas-frame' | 'env-frame';
      sensorKey: string;
      emitEvent?: boolean;
    }[],
  ) => Promise<void>;
  readBoardStatus: (device: Device) => Promise<number | null>;
  eventEmitter: AppEventEmitter;
};

const BLEContext = createContext<BLEContextType | undefined>(undefined);

const waitForPoweredOn = async (manager: BleManager): Promise<boolean> => {
  if ((await manager.state()) === State.PoweredOn) {
    return true;
  }
  return new Promise<boolean>(resolve => {
    const timer = setTimeout(() => {
      subscription.remove();
      resolve(false);
    }, BLUETOOTH_READY_TIMEOUT_MS);
    const subscription = manager.onStateChange(state => {
      if (state === State.PoweredOn) {
        clearTimeout(timer);
        subscription.remove();
        resolve(true);
      }
    });
  });
};

export const BLEProvider = ({ children }: { children: React.ReactNode }) => {
  const managerRef = useRef<BleManager | null>(null);

  const getManager = useCallback((): BleManager => {
    if (!managerRef.current) {
      managerRef.current = new BleManager();
    }
    return managerRef.current;
  }, []);

  const [manager, setManager] = useState<BleManager>(() => getManager());
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [characteristicValues, setCharacteristicValues] = useState<{
    [key: string]: number;
  }>({});
  const [boardStatus, setBoardStatus] = useState<number | null>(null);

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanSettleRef = useRef<{
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null>(null);

  const endScan = useCallback((error?: unknown) => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    managerRef.current?.stopDeviceScan();

    const settle = scanSettleRef.current;
    scanSettleRef.current = null;
    if (settle) {
      if (error) {
        settle.reject(error);
      } else {
        settle.resolve();
      }
    }
  }, []);

  const stopScan = useCallback(() => {
    endScan();
  }, [endScan]);

  useEffect(() => {
    const activeManager = getManager();
    setManager(activeManager);
    setConnectedDevice(null);
    setDevices([]);

    requestPermissions();

    activeManager.stopDeviceScan();
    activeManager
      .connectedDevices([CUSTOM_SERVICE_UUID, ESS_SERVICE_UUID])
      .then(staleDevices =>
        Promise.all(
          staleDevices.map(staleDevice =>
            staleDevice.cancelConnection().catch(() => undefined),
          ),
        ),
      )
      .catch(() => undefined);

    return () => {
      endScan();
      if (managerRef.current === activeManager) {
        managerRef.current = null;
      }
      activeManager.destroy();
    };
  }, [endScan, getManager]);

  // Request Android permissions
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const permissions: string[] = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];

    if (Platform.Version >= 31) {
      permissions.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
    }

    const granted = await PermissionsAndroid.requestMultiple(
      permissions as any[],
    );

    const denied = Object.values(granted).some(
      result => result !== PermissionsAndroid.RESULTS.GRANTED,
    );

    if (denied) {
      console.warn('Required BLE permissions not granted');
    }
    return !denied;
  };

  const scanForDevices = async (): Promise<void> => {
    if (!(await requestPermissions())) {
      return;
    }

    const activeManager = getManager();

    if (!(await waitForPoweredOn(activeManager))) {
      throw new Error(
        'Bluetooth is off or not ready. Turn it on and try again.',
      );
    }

    endScan();
    setDevices([]);

    return new Promise<void>((resolve, reject) => {
      scanSettleRef.current = { resolve, reject };

      activeManager.startDeviceScan(
        null,
        { allowDuplicates: false, scanMode: 2 },
        (error, device) => {
          if (error) {
            console.error('Scan error:', error);
            endScan(error);
            return;
          }

          const advertisedName = device?.name || device?.localName;
          const advertisedServices = (device?.serviceUUIDs || []).map(uuid =>
            uuid.toLowerCase(),
          );
          const isBrianDevice =
            !!device &&
            ((!!advertisedName && /^brian(?:-|$)/i.test(advertisedName)) ||
              advertisedServices.includes(ESS_SERVICE_UUID) ||
              advertisedServices.includes(CUSTOM_SERVICE_UUID_NORMALIZED));

          if (device) {
            console.log(
              `BLE advertisement: ${advertisedName || '<unnamed>'} (${
                device.id
              })`,
              advertisedServices,
            );
          }

          if (isBrianDevice) {
            setDevices(prevDevices => {
              if (!prevDevices.find(d => d.id === device.id)) {
                return [...prevDevices, device];
              }
              return prevDevices;
            });
          }
        },
      );

      scanTimeoutRef.current = setTimeout(() => {
        endScan();
      }, SCAN_DURATION_MS);
    });
  };

  // Connect to a device
  const connectToDevice = async (device: Device): Promise<Device> => {
    endScan();

    try {
      const connected = await device.connect();
      const discovered =
        await connected.discoverAllServicesAndCharacteristics();
      await discovered.requestMTU(64);

      setConnectedDevice(discovered);
      console.log('Connected to', discovered.name || 'Unnamed Device');

      const services = await discovered.services();
      for (const service of services) {
        console.log(`Service UUID: ${service.uuid}`);
        const characteristics = await service.characteristics();
        for (const characteristic of characteristics) {
          console.log(`  Characteristic UUID: ${characteristic.uuid}`);
        }
      }
      return discovered;
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  };

  // Enable notifications
  const enableNotifications = async (
    device: Device,
    characteristics: {
      serviceUUID: string;
      characteristicUUID: string;
      label: string;
      format?: 'float32' | 'uint8' | 'gas-frame' | 'env-frame';
      sensorKey: string;
      emitEvent?: boolean;
    }[],
  ) => {
    const decodeBase64 = (base64String: string): Uint8Array => {
      if (typeof atob === 'function') {
        const binary = atob(base64String);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }
      if (typeof Buffer !== 'undefined') {
        const buffer = Buffer.from(base64String, 'base64');
        return new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        );
      }
      throw new Error('No base64 decoder available in this environment');
    };

    const updateValue = (
      sourceDevice: Device,
      serviceUUID: string,
      characteristicUUID: string,
      rawValue: string,
      label: string,
      sensorKey: string,
      decodedValue: number,
      eventTimestamp: Date,
      emitEvent: boolean,
    ) => {
      setCharacteristicValues(prev => ({
        ...prev,
        [label]: decodedValue,
        [sensorKey]: decodedValue,
      }));

      if (emitEvent) {
        const bleEvent: BLEDataUpdated = {
          type: 'ble_data_updated',
          timestamp: eventTimestamp,
          deviceId: sourceDevice.id,
          serviceUUID,
          characteristicUUID,
          rawValue,
          decodedValue,
          source: sourceDevice.name || 'Unknown Device',
        };
        eventEmitter.emit('ble_data_updated', bleEvent);
      }
    };

    const frameSlots = {
      'gas-frame': [
        ['Formaldehyde', 'HCHO'],
        ['Methane', 'CH4'],
        ['Volatile Organic Compounds', 'VOC'],
        ['Odor', 'Odour'],
        ['Ethanol', 'Etoh'],
        ['Hydrogen Sulfide', 'H2S'],
        ['Nitrogen Dioxide', 'NO2'],
        ['Ammonia', 'NH3'],
        ['Carbon Monoxide', 'CO'],
        ['Smoke', 'Smoke'],
        ['Hydrogen', 'H2'],
      ],
      'env-frame': [
        ['Temperature', 'TempC'],
        ['Pressure', 'PressureHPa'],
        ['Humidity', 'HumidityPct'],
        ['Gas Resistance', 'GasResOhm'],
        ['Altitude', 'AltitudeM'],
      ],
    } as const;

    const decodeFrame = (
      bytes: Uint8Array,
      frameFormat: 'gas-frame' | 'env-frame',
    ) => {
      const expectedLength = frameFormat === 'gas-frame' ? 58 : 29;
      if (bytes.byteLength !== expectedLength || bytes[0] !== 1) {
        throw new Error(
          `Invalid ${frameFormat}: expected ${expectedLength} bytes, received ${bytes.byteLength}`,
        );
      }
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const flags = view.getUint8(1);
      const timestamp = view.getUint32(4, true);
      const mask =
        frameFormat === 'gas-frame'
          ? view.getUint16(8, true)
          : view.getUint8(8);
      const values = frameSlots[frameFormat];
      const offset = frameFormat === 'gas-frame' ? 10 : 9;
      const eventTimestamp =
        flags % 2 === 1 ? new Date(timestamp * 1000) : new Date();

      return values.flatMap(([label, sensorKey], index) => {
        if (Math.floor(mask / Math.pow(2, index)) % 2 === 0) {
          return [];
        }
        const value = view.getFloat32(offset + index * 4, true);
        return Number.isFinite(value)
          ? [{ label, sensorKey, value, eventTimestamp }]
          : [];
      });
    };

    const processValue = (
      sourceDevice: Device,
      serviceUUID: string,
      characteristicUUID: string,
      rawValue: string,
      label: string,
      sensorKey: string,
      format: 'float32' | 'uint8' | 'gas-frame' | 'env-frame',
      emitEvent: boolean,
    ) => {
      const bytes = decodeBase64(rawValue);
      if (format === 'gas-frame' || format === 'env-frame') {
        for (const value of decodeFrame(bytes, format)) {
          updateValue(
            sourceDevice,
            serviceUUID,
            characteristicUUID,
            rawValue,
            value.label,
            value.sensorKey,
            value.value,
            value.eventTimestamp,
            emitEvent,
          );
        }
        return;
      }
      if (bytes.byteLength !== (format === 'uint8' ? 1 : 4)) {
        throw new Error(`Invalid ${format} length: ${bytes.byteLength}`);
      }
      const value =
        format === 'uint8'
          ? bytes[0]
          : new DataView(
              bytes.buffer,
              bytes.byteOffset,
              bytes.byteLength,
            ).getFloat32(0, true);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid ${label} notification value`);
      }
      updateValue(
        device,
        serviceUUID,
        characteristicUUID,
        rawValue,
        label,
        sensorKey,
        value,
        new Date(),
        emitEvent,
      );
    };

    for (const {
      serviceUUID,
      characteristicUUID,
      label,
      format = 'float32',
      sensorKey,
      emitEvent = true,
    } of characteristics) {
      console.log(
        'Enabling notification for',
        sensorKey,
        serviceUUID,
        characteristicUUID,
      );

      try {
        device.monitorCharacteristicForService(
          serviceUUID,
          characteristicUUID,
          (error, characteristic) => {
            if (error) {
              console.error('Notification error:', error);
              return;
            }

            const rawValue = characteristic?.value;
            if (!rawValue) {
              return;
            }
            try {
              processValue(
                device,
                serviceUUID,
                characteristicUUID,
                rawValue,
                label,
                sensorKey,
                format,
                emitEvent,
              );
            } catch (decodeError) {
              console.error(`Invalid ${label} notification:`, decodeError);
            }
          },
        );

        const initialValue = await device.readCharacteristicForService(
          serviceUUID,
          characteristicUUID,
        );
        if (initialValue.value) {
          processValue(
            device,
            serviceUUID,
            characteristicUUID,
            initialValue.value,
            label,
            sensorKey,
            format,
            emitEvent,
          );
        }
      } catch (error) {
        console.error('Enable notification error:', error);
      }
    }
  };

  // Read the board status bitmask (see BrianHardware CLAUDE.md). This is
  // captured once at boot on the firmware side and never changes, so a
  // single read after connecting is enough - no notification is set up.
  const readBoardStatus = async (device: Device): Promise<number | null> => {
    try {
      const characteristic = await device.readCharacteristicForService(
        CUSTOM_SERVICE_UUID,
        BOARD_STATUS_CHARACTERISTIC_UUID,
      );
      const rawValue = characteristic.value;
      if (!rawValue) {
        return null;
      }

      const binary =
        typeof atob === 'function'
          ? atob(rawValue)
          : Buffer.from(rawValue, 'base64').toString('binary');
      const byte = binary.charCodeAt(0);
      setBoardStatus(byte);
      return byte;
    } catch (error) {
      console.error('Read board status error:', error);
      return null;
    }
  };

  return (
    <BLEContext.Provider
      value={{
        manager,
        devices,
        connectedDevice,
        characteristicValues,
        boardStatus,
        scanForDevices,
        stopScan,
        connectToDevice,
        enableNotifications,
        readBoardStatus,
        eventEmitter,
      }}>
      {children}
    </BLEContext.Provider>
  );
};

export const useBLE = () => {
  const context = useContext(BLEContext);
  if (!context) {
    throw new Error('useBLE must be used inside a BLEProvider');
  }
  return context;
};

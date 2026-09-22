import React, { createContext, useContext, useEffect, useState } from 'react';
import { BleManager, Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import mitt from 'mitt';
import { AppEventEmitter, BLEDataUpdated } from './types/events';

// Create a global event emitter instance
const eventEmitter: AppEventEmitter = mitt();

// Export the event emitter so other components can use it
export { eventEmitter };

type BLEContextType = {
  manager: BleManager;
  devices: Device[];
  connectedDevice: Device | null;
  characteristicValues: { [key: string]: number };
  scanForDevices: () => void;
  connectToDevice: (device: Device) => Promise<void>;
  enableNotifications: (
    device: Device,
    characteristics: {
      serviceUUID: string;
      characteristicUUID: string;
      label: string;
    }[],
  ) => Promise<void>;
  eventEmitter: AppEventEmitter;
};

const BLEContext = createContext<BLEContextType | undefined>(undefined);

export const BLEProvider = ({ children }: { children: React.ReactNode }) => {
  const [manager] = useState(() => new BleManager());
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [characteristicValues, setCharacteristicValues] = useState<{
    [key: string]: number;
  }>({});

  useEffect(() => {
    requestPermissions();

    return () => {
      manager.destroy();
    };
  }, [manager]);

  // Request Android permissions
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ];

      if (Platform.Version >= 31) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      if (
        Object.values(granted).some(
          result => result !== PermissionsAndroid.RESULTS.GRANTED,
        )
      ) {
        console.warn('Required BLE permissions not granted');
      }
    }
  };

  // Scan for devices
  const scanForDevices = () => {
    setDevices([]);

    manager.startDeviceScan(
      null,
      { allowDuplicates: false, scanMode: 2 },
      (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          return;
        }

        if (device && device.name) {
          setDevices(prevDevices => {
            if (!prevDevices.find(d => d.id === device.id)) {
              return [...prevDevices, device];
            }
            return prevDevices;
          });
        }
      },
    );

    setTimeout(() => {
      manager.stopDeviceScan();
    }, 5000);
  };

  // Connect to a device
  const connectToDevice = async (device: Device) => {
    try {
      await device.connect();
      await device.discoverAllServicesAndCharacteristics();
      await device.requestMTU(256);

      setConnectedDevice(device);
      console.log('Connected to', device.name || 'Unnamed Device');

      const services = await device.services();
      for (const service of services) {
        console.log(`Service UUID: ${service.uuid}`);
        const characteristics = await service.characteristics();
        for (const characteristic of characteristics) {
          console.log(`  Characteristic UUID: ${characteristic.uuid}`);
        }
      }
    } catch (error) {
      console.error('Connection error:', error);
    }
  };

  // Enable notifications
  const enableNotifications = async (
    device: Device,
    characteristics: {
      serviceUUID: string;
      characteristicUUID: string;
      label: string;
    }[],
  ) => {
    for (const { serviceUUID, characteristicUUID, label } of characteristics) {
      console.log(
        'Enabling notification for',
        label,
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

            const rawValue = characteristic?.value ?? '';

            // Decode base64 -> float32 (ESP32 sends 4-byte float little-endian)
            const base64ToFloat32 = (base64String: string): number => {
              try {
                let bytes: Uint8Array;

                if (typeof atob === 'function') {
                  const binary = atob(base64String);
                  bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                  }
                } else if (typeof Buffer !== 'undefined') {
                  const buf = Buffer.from(base64String, 'base64');
                  // create a Uint8Array view over the buffer
                  bytes = new Uint8Array(
                    buf.buffer,
                    buf.byteOffset,
                    buf.byteLength,
                  );
                } else {
                  console.warn(
                    'No base64 decoder available in this environment',
                  );
                  return 0;
                }

                const view = new DataView(
                  bytes.buffer,
                  bytes.byteOffset || 0,
                  bytes.byteLength,
                );
                return view.getFloat32(0, true);
              } catch (err) {
                console.error('Base64->float decode error:', err);
                return 0;
              }
            };

            const voltageValue = base64ToFloat32(rawValue);

            // Update local state for UI - store raw value directly
            setCharacteristicValues(prev => ({
              ...prev,
              [label]: voltageValue,
            }));

            // Emit BLE data updated event for InfluxDB integration
            const bleEvent: BLEDataUpdated = {
              type: 'ble_data_updated',
              timestamp: new Date(),
              deviceId: device.id,
              serviceUUID,
              characteristicUUID,
              rawValue,
              decodedValue: voltageValue,
              source: device.name || 'Unknown Device',
            };

            eventEmitter.emit('ble_data_updated', bleEvent);

            console.log(`${label}: ${voltageValue}`);
          },
        );
      } catch (error) {
        console.error('Enable notification error:', error);
      }
    }
  };

  return (
    <BLEContext.Provider
      value={{
        manager,
        devices,
        connectedDevice,
        characteristicValues,
        scanForDevices,
        connectToDevice,
        enableNotifications,
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

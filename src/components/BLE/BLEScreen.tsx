import React, { useState } from 'react';
import {
  Text,
  SafeAreaView,
  StyleSheet,
  View,
  Pressable,
  Alert,
  ScrollView,
} from 'react-native';
import KeepAwake from 'react-native-keep-awake';
import {BatteryIndicator, BatteryLifetime} from '../components/BatteryStatus';
import { useBLE } from '../../BLEUniversal';
import {
  BOARD_STATUS_DEFINITIONS,
  SENSOR_DEFINITIONS,
  isBoardStatusBitSet,
} from '../../sensors';

const BLELoggerApp = () => {
  const {
    devices,
    connectedDevice,
    characteristicValues,
    boardStatus,
    scanForDevices,
    connectToDevice,
    enableNotifications,
    readBoardStatus,
  } = useBLE();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const notificationSpecs = [
    {
      serviceUUID: '0000181a-0000-1000-8000-00805f9b34fb',
      characteristicUUID: '00002bd1-0000-1000-8000-00805f9b34fb',
      label: 'Methane',
    },
    {
      serviceUUID: '0000181a-0000-1000-8000-00805f9b34fb',
      characteristicUUID: '00002bd2-0000-1000-8000-00805f9b34fb',
      label: 'Nitrogen Dioxide',
    },
    {
      serviceUUID: '0000181a-0000-1000-8000-00805f9b34fb',
      characteristicUUID: '00002bd3-0000-1000-8000-00805f9b34fb',
      label: 'Voletile Organic Compounds',
    },
    {
      serviceUUID: '0000181a-0000-1000-8000-00805f9b34fb',
      characteristicUUID: '00002bcf-0000-1000-8000-00805f9b34fb',
      label: 'Ammonia',
    },
    {
      serviceUUID: 'de664a17-7db4-449f-97ba-5514e19a9d94',
      characteristicUUID: '6a135b89-f360-4f64-86fc-5a14092034b4',
      label: 'Formaldehyde',
    },
    {
      serviceUUID: 'de664a17-7db4-449f-97ba-5514e19a9d94',
      characteristicUUID: '4c28fcb8-d69b-404a-8668-41655d814e7f',
      label: 'Odor',
    },
    {
      serviceUUID: 'de664a17-7db4-449f-97ba-5514e19a9d94',
      characteristicUUID: 'f8156843-6d98-4ba2-8014-1cf03d7dedb8',
      label: 'Ethanol',
    },
    {
      serviceUUID: 'de664a17-7db4-449f-97ba-5514e19a9d94',
      characteristicUUID: '87dc71bd-29a4-4218-a2a7-83fd2a69cc40',
      label: 'Hydrogen Sulfide',
    },
    {
      serviceUUID: '0000180f-0000-1000-8000-00805f9b34fb',
      characteristicUUID: '00002a19-0000-1000-8000-00805f9b34fb',
      label: 'Battery Percentage',
      format: 'uint8' as const,
    },
    {
      serviceUUID: 'de664a17-7db4-449f-97ba-5514e19a9d94',
      characteristicUUID: 'd5e4f3a2-b1c0-4d9e-8f7a-6b5c4d3e2f10',
      label: 'Battery Runtime',
      format: 'float32' as const,
    },
  ];

  const handleConnect = async () => {
    const selectedDevice = devices.find(
      device => device.id === selectedDeviceId,
    );
    if (!selectedDevice) {
      return;
    }

    try {
      const connectedDeviceInstance = await connectToDevice(selectedDevice);
      const discoveredPairs = new Set<string>();
      const services = await connectedDeviceInstance.services();
      for (const service of services) {
        const characteristics = await service.characteristics();
        for (const characteristic of characteristics) {
          discoveredPairs.add(
            `${service.uuid.toLowerCase()}:${characteristic.uuid.toLowerCase()}`,
          );
        }
      }
      const notificationSpecs = SENSOR_DEFINITIONS.filter(sensor =>
        discoveredPairs.has(
          `${sensor.serviceUUID.toLowerCase()}:${sensor.characteristicUUID.toLowerCase()}`,
        ),
      ).map(sensor => ({
        serviceUUID: sensor.serviceUUID,
        characteristicUUID: sensor.characteristicUUID,
        sensorKey: sensor.key,
      }));
      await enableNotifications(connectedDeviceInstance, notificationSpecs);
      await readBoardStatus(connectedDeviceInstance);
      setSelectedDeviceId(null);
      Alert.alert(
        'Connected',
        `${selectedDevice.name || 'Device'} connected successfully.`,
      );
    } catch (err: any) {
      console.error('Connect+notify error:', err);
      Alert.alert('Connection failed', err?.message || String(err));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeepAwake />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>eNose Connection</Text>
        </View>

        {/* Scan Button */}
        <Pressable style={styles.scanButton} onPress={scanForDevices}>
          <Text style={styles.scanButtonText}>Scan</Text>
        </Pressable>

        {/* My Devices Section */}
        <View style={styles.devicesSection}>
          <Text style={styles.sectionLabel}>MY DEVICES</Text>

          <View style={styles.devicesList}>
            {devices.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No devices found. Press Scan to discover devices.
                </Text>
              </View>
            ) : (
              devices.map((device) => {
                const isConnected = connectedDevice?.id === device.id;
                const isSelected = selectedDeviceId === device.id;
                const batteryPercentage = isConnected
                  ? characteristicValues['Battery Percentage']
                  : undefined;
                const batteryRuntime = isConnected
                  ? characteristicValues['Battery Runtime']
                  : undefined;

                return (
                  <Pressable
                    key={device.id}
                    onPress={() => !isConnected && setSelectedDeviceId(device.id)}
                    style={[
                      styles.deviceItem,
                      isSelected && styles.deviceItemSelected,
                    ]}
                    disabled={isConnected}
                  >
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>
                        {device.name || 'Unnamed Device'}
                      </Text>
                      <Text
                        style={[
                          styles.deviceStatus,
                          isConnected && styles.deviceStatusConnected,
                        ]}
                      >
                        {isConnected ? 'Connected' : 'Not connected'}
                      </Text>
                      {isConnected && (
                        <BatteryLifetime runtimeHours={batteryRuntime} />
                      )}
                    </View>
                    {isConnected && (
                      <BatteryIndicator percentage={batteryPercentage} />
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        {/* Connect Button (shown when device selected) */}
        {selectedDeviceId && !connectedDevice && (
          <Pressable style={styles.connectButton} onPress={handleConnect}>
            <Text style={styles.connectButtonText}>Connect</Text>
          </Pressable>
        )}

        {/* Board Status Section (shown once connected) */}
        {connectedDevice && boardStatus !== null && (
          <View style={styles.devicesSection}>
            <Text style={styles.sectionLabel}>HARDWARE STATUS</Text>
            <View style={styles.devicesList}>
              {BOARD_STATUS_DEFINITIONS.map(board => {
                const present = isBoardStatusBitSet(boardStatus, board.bit);
                return (
                  <View key={board.bit} style={styles.deviceItem}>
                    <Text style={styles.deviceName}>{board.label}</Text>
                    <Text
                      style={[
                        styles.deviceStatus,
                        present && styles.deviceStatusConnected,
                      ]}>
                      {present ? 'Detected' : 'Missing'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#141414ff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  scanButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#141414ff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignSelf: 'flex-start',
    marginBottom: 32,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#141414ff',
  },
  devicesSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  devicesList: {
    backgroundColor: '#fff8f0ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  deviceInfo: {
    flex: 1,
    marginRight: 12,
  },
  deviceItemSelected: {
    backgroundColor: '#f0f8ff',
    borderLeftWidth: 4,
    borderLeftColor: '#007aff',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#141414ff',
  },
  deviceStatus: {
    fontSize: 14,
    color: '#999',
  },
  deviceStatusConnected: {
    color: '#34C759',
    fontWeight: '500',
  },
  connectButton: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  valuesSection: {
    marginTop: 24,
  },
  valuesList: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  valueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  valueLabel: {
    fontSize: 14,
    color: '#666',
  },
  valueNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#141414ff',
    fontFamily: 'monospace',
  },
});

export default BLELoggerApp;

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
import { useBLE } from '../../BLEUniversal';
import { SENSOR_DEFINITIONS } from '../../sensors';

const BLELoggerApp = () => {
  const {
    devices,
    connectedDevice,
    scanForDevices,
    connectToDevice,
    enableNotifications,
  } = useBLE();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

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
        label: sensor.key,
      }));
      await enableNotifications(connectedDeviceInstance, notificationSpecs);
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
              devices
                .filter(device => device.name?.startsWith('Brian'))
                .map(device => {
                  const isConnected = connectedDevice?.id === device.id;
                  const isSelected = selectedDeviceId === device.id;

                  return (
                    <Pressable
                      key={device.id}
                      onPress={() =>
                        !isConnected && setSelectedDeviceId(device.id)
                      }
                      style={[
                        styles.deviceItem,
                        isSelected && styles.deviceItemSelected,
                      ]}
                      disabled={isConnected}>
                      <Text style={styles.deviceName}>
                        {device.name || 'Unnamed Device'}
                      </Text>
                      <Text
                        style={[
                          styles.deviceStatus,
                          isConnected && styles.deviceStatusConnected,
                        ]}>
                        {isConnected ? 'Connected' : 'Not connected'}
                      </Text>
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

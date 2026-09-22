import React, { useEffect, useState } from 'react';
import { View, Text, PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import Geolocation from 'react-native-geolocation-service';

const BLEGPSComponent = () => {
  const [location, setLocation] = useState(null);
  const [bleDevices, setBleDevices] = useState([]);
  const manager = React.useMemo(() => new BleManager(), []);

  useEffect(() => {
    requestPermissions();
    startBLEScan();
    startLocationUpdates();
  }, [startBLEScan]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      );
    }
  };

  const startBLEScan = React.useCallback(() => {
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error(error);
        return;
      }
      setBleDevices(prevDevices => [...prevDevices, device]);
    });
  }, [manager]);

  const startLocationUpdates = () => {
    Geolocation.watchPosition(
      position => {
        setLocation(position);
      },
      error => {
        console.error(error);
      },
      { enableHighAccuracy: true, distanceFilter: 0 },
    );
  };

  return (
    <View>
      <Text>BLE Devices:</Text>
      {bleDevices.map(device => (
        <Text key={device.id}>{device.name}</Text>
      ))}
      <Text>Location:</Text>
      {location && (
        <Text>
          Latitude: {location.coords.latitude}, Longitude:{' '}
          {location.coords.longitude}
        </Text>
      )}
    </View>
  );
};

export default BLEGPSComponent;

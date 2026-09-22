import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {InfluxDBClient} from '../influxdb';
import {CONFIG} from '../config';
import {eventEmitter} from '../BLEUniversal';
import {BLEDataUpdated, SensorEvent} from '../types';

type InfluxDBContextType = {
  client: InfluxDBClient | null;
  isConnected: boolean;
  testConnection: () => Promise<void>;
};

const InfluxDBContext = createContext<InfluxDBContextType | undefined>(
  undefined,
);

export const InfluxDBProvider = ({children}: {children: React.ReactNode}) => {
  const [client, setClient] = useState<InfluxDBClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize InfluxDB client
  useEffect(() => {
    const token = CONFIG.INFLUX_TOKEN || '';
    const url = CONFIG.INFLUX_URL || '';
    const org = CONFIG.INFLUX_ORG || '';
    const bucket = CONFIG.INFLUX_BUCKET || '';

    if (token && url && org && bucket) {
      const influxClient = new InfluxDBClient(url, token, org, bucket);
      setClient(influxClient);
      setIsConnected(true);
      console.log('InfluxDB client initialized successfully');
    } else {
      console.warn('InfluxDB configuration incomplete');
    }
  }, []);

  // Upload sensor data immediately to InfluxDB
  const uploadSensorData = useCallback(
    async (
      deviceId: string,
      sensorType: string,
      value: number, // Already a number
      unit: string,
      timestamp?: Date,
    ) => {
      if (!client) {
        console.warn('InfluxDB client not available');
        return;
      }

      try {
        await client.writeData(
          'sensor_readings',
          {
            device_id: deviceId,
            sensor_type: sensorType,
            unit: unit,
          },
          {
            value: value, // Direct number, no conversion needed
          },
          timestamp || new Date(),
        );
        console.log(
          `Uploaded sensor data: ${sensorType}=${value} from ${deviceId}`,
        );
      } catch (error) {
        console.error('Error uploading sensor data to InfluxDB:', error);
      }
    },
    [client],
  );

  // Set up event listeners for pub/sub system
  useEffect(() => {
    if (!client) {
      return;
    }

    const handleBLEUpdate = (event: BLEDataUpdated) => {
      console.log('InfluxDB Service: BLE data updated:', event);

      // Create a SensorEvent for each BLE update
      const sensorEvent: SensorEvent = {
        type: 'sensor_reading',
        timestamp: new Date(),
        source: event.source,
        olfactoryData: {
          readings: {
            [event.characteristicUUID]:
              typeof event.decodedValue === 'number' ? event.decodedValue : 0,
          },
          units: {
            [event.characteristicUUID]: 'ppm', // Adjust based on your sensor
          },
        },
      };

      // Emit sensor event
      eventEmitter.emit('sensor_reading', sensorEvent);
    };

    const handleSensorReading = async (event: SensorEvent) => {
      console.log('InfluxDB Service: Sensor reading:', event);

      // Upload sensor data immediately to InfluxDB
      if (event.olfactoryData && event.olfactoryData.readings) {
        for (const [sensorType, value] of Object.entries(
          event.olfactoryData.readings,
        )) {
          const unit = event.olfactoryData.units?.[sensorType] || 'unknown';

          await uploadSensorData(
            event.source || 'unknown',
            sensorType,
            value, // Already a number
            unit,
            event.timestamp,
          );
        }
      }
    };

    // Subscribe to events
    eventEmitter.on('ble_data_updated', handleBLEUpdate);
    eventEmitter.on('sensor_reading', handleSensorReading);

    // Cleanup subscriptions
    return () => {
      eventEmitter.off('ble_data_updated', handleBLEUpdate);
      eventEmitter.off('sensor_reading', handleSensorReading);
    };
  }, [client, uploadSensorData]);

  const testConnection = async () => {
    if (!client) {
      console.error('InfluxDB client not initialized');
      return;
    }

    try {
      console.log('Testing InfluxDB connection...');
      await client.writeData(
        'test_measurement',
        {source: 'debug_test'},
        {test_value: 123.45}, // Direct number
        new Date(),
      );
      console.log('InfluxDB test successful!');
    } catch (error) {
      console.error('InfluxDB test failed:', error);
    }
  };

  return (
    <InfluxDBContext.Provider
      value={{
        client,
        isConnected,
        testConnection,
      }}>
      {children}
    </InfluxDBContext.Provider>
  );
};

export const useInfluxDB = () => {
  const context = useContext(InfluxDBContext);
  if (!context) {
    throw new Error('useInfluxDB must be used inside an InfluxDBProvider');
  }
  return context;
};

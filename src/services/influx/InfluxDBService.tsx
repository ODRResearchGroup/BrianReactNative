import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation, { GeoPosition } from 'react-native-geolocation-service';
import { eventEmitter } from '../../BLEUniversal';
import { BLEDataUpdated, SensorEvent } from '../../types/events';
import { insertSensorRecord } from '../database/db';
import { INFLUX_CONFIG } from './config';
import { InfluxClient } from './client';
import { InfluxPoint } from './types';

export type LiveLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: number;
};

type InfluxDBContextType = {
  isConnected: boolean;
  location: LiveLocation | null;
  trail: LiveLocation[];
  isSmellWalkActive: boolean;
  walkId: string | null;
  startSmellWalk: () => void;
  stopSmellWalk: () => Promise<string | null>;
};

const InfluxDBContext = createContext<InfluxDBContextType | undefined>(
  undefined,
);

const sensorLabelByCharacteristic: Record<string, string> = {
  '00002bd1-0000-1000-8000-00805f9b34fb': 'Methane',
  '00002bd2-0000-1000-8000-00805f9b34fb': 'Nitrogen Dioxide',
  '00002bd3-0000-1000-8000-00805f9b34fb': 'Voletile Organic Compounds',
  '00002bcf-0000-1000-8000-00805f9b34fb': 'Ammonia',
  '6a135b89-f360-4f64-86fc-5a14092034b4': 'Formaldehyde',
  '4c28fcb8-d69b-404a-8668-41655d814e7f': 'Odor',
  'f8156843-6d98-4ba2-8014-1cf03d7dedb8': 'Ethanol',
  '87dc71bd-29a4-4218-a2a7-83fd2a69cc40': 'Hydrogen Sulfide',
};

export const InfluxDBProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [trail, setTrail] = useState<LiveLocation[]>([]);
  const [isSmellWalkActive, setIsSmellWalkActive] = useState(false);
  const [walkId, setWalkId] = useState<string | null>(null);
  const latestLocationRef = useRef<LiveLocation | null>(null);
  const isSmellWalkActiveRef = useRef(false);
  const walkIdRef = useRef<string | null>(null);
  const walkReadingsRef = useRef<Record<string, number>>({});
  const walkDeviceIdRef = useRef('unknown');
  const walkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const influxClient = useRef(new InfluxClient(INFLUX_CONFIG));

  useEffect(() => {
    let watchId: number | null = null;
    let active = true;

    const startLocationWatch = async () => {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('Location permission denied; sensor data will omit GPS');
          return;
        }
      } else {
        const authorization = await Geolocation.requestAuthorization(
          'whenInUse',
        );
        if (authorization !== 'granted') {
          console.warn('Location permission denied; sensor data will omit GPS');
          return;
        }
      }

      if (!active) {
        return;
      }

      watchId = Geolocation.watchPosition(
        (position: GeoPosition) => {
          const nextLocation: LiveLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy ?? null,
            recordedAt: position.timestamp,
          };
          latestLocationRef.current = nextLocation;
          setLocation(nextLocation);

          if (isSmellWalkActiveRef.current) {
            setTrail(previous => [...previous, nextLocation]);
          }
        },
        error =>
          console.warn(
            `[Location] watchPosition error (code ${error.code}): ${error.message}`,
          ),
        {
          enableHighAccuracy: true,
          distanceFilter: 0,
          interval: 2000,
          fastestInterval: 1000,
          forceRequestLocation: true,
          showLocationDialog: true,
        },
      );
    };

    startLocationWatch().catch(error => {
      console.warn(
        '[Location] Unexpected error starting location watch:',
        error,
      );
    });

    return () => {
      active = false;
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
        Geolocation.stopObserving();
      }
    };
  }, []);

  const flushWalkData = useCallback(async () => {
    const currentWalkId = walkIdRef.current;
    const readings = { ...walkReadingsRef.current };
    const currentLocation = latestLocationRef.current;

    if (!currentWalkId || Object.keys(readings).length === 0) {
      return;
    }

    walkReadingsRef.current = {};

    const valueFor = (names: string[]) => {
      const entry = Object.entries(readings).find(([name]) =>
        names.includes(name.toLowerCase()),
      );
      return entry?.[1] ?? 0;
    };

    const timestamp = Date.now();

    const point: InfluxPoint = {
      measurement: 'smell_walk_point',
      tags: {
        walk_id: currentWalkId,
        device_id: walkDeviceIdRef.current,
      },
      fields: {
        ch4: valueFor(['methane', 'ch4']),
        nh3: valueFor(['ammonia', 'nh3']),
        hcho: valueFor(['formaldehyde', 'hcho']),
        voc: valueFor([
          'voletile organic compounds',
          'volatile organic compounds',
          'voc',
        ]),
        odour: valueFor(['odor', 'odour']),
        h2s: valueFor(['hydrogen sulfide', 'hydrogen sulphide', 'h2s']),
        etoh: valueFor(['ethanol', 'etoh']),
        no2: valueFor(['nitrogen dioxide', 'no2']),
        ...(currentLocation && {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy_m: currentLocation.accuracyM ?? 0,
        }),
      },
      timestamp: timestamp * 1_000_000,
    };

    try {
      // Save locally
      await insertSensorRecord({
        id: `${currentWalkId}-${timestamp}`,
        title: currentWalkId,
        description: walkDeviceIdRef.current,
        tagsJson: null,
        photoPath: null,
        recordedAt: timestamp,
        latitude: currentLocation?.latitude ?? null,
        longitude: currentLocation?.longitude ?? null,
        accuracyM: currentLocation?.accuracyM ?? null,
        ch4: valueFor(['methane', 'ch4']),
        nh3: valueFor(['ammonia', 'nh3']),
        hcho: valueFor(['formaldehyde', 'hcho']),
        voc: valueFor([
          'voletile organic compounds',
          'volatile organic compounds',
          'voc',
        ]),
        odour: valueFor(['odor', 'odour']),
        h2s: valueFor(['hydrogen sulfide', 'hydrogen sulphide', 'h2s']),
        etoh: valueFor(['ethanol', 'etoh']),
        no2: valueFor(['nitrogen dioxide', 'no2']),
        deltaCh4: null,
        deltaNh3: null,
        deltaHcho: null,
        deltaVoc: null,
        deltaOdour: null,
        deltaH2s: null,
        deltaEtoh: null,
        deltaNo2: null,
      });

      // Upload to InfluxDB Cloud
      await influxClient.current.writeTimeseriesPoint(point);
    } catch (error) {
      // Restore readings so the next flush retries them
      walkReadingsRef.current = { ...readings, ...walkReadingsRef.current };
      console.error('[InfluxDB] Flush failed — readings restored for retry:', {
        walkId: currentWalkId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        restoredReadings: walkReadingsRef.current,
      });
      throw error;
    }
  }, []);

  const startSmellWalk = useCallback(() => {
    if (isSmellWalkActiveRef.current) {
      console.warn(
        '[SmellWalk] startSmellWalk called but a walk is already active — ignoring',
      );
      return;
    }

    const nextWalkId = `walk-${Date.now()}`;
    walkIdRef.current = nextWalkId;
    walkReadingsRef.current = {};
    walkDeviceIdRef.current = 'unknown';
    isSmellWalkActiveRef.current = true;
    setWalkId(nextWalkId);
    setTrail(latestLocationRef.current ? [latestLocationRef.current] : []);
    setIsSmellWalkActive(true);

    walkTimerRef.current = setInterval(() => {
      flushWalkData().catch(error => {
        console.error('[SmellWalk] Interval flush error:', error);
      });
    }, 5000);
  }, [flushWalkData]);

  const stopSmellWalk = useCallback(async (): Promise<string | null> => {
    if (!isSmellWalkActiveRef.current) {
      console.warn(
        '[SmellWalk] stopSmellWalk called but no walk is active — ignoring',
      );
      return null;
    }

    const completedWalkId = walkIdRef.current;

    isSmellWalkActiveRef.current = false;
    setIsSmellWalkActive(false);

    if (walkTimerRef.current !== null) {
      clearInterval(walkTimerRef.current);
      walkTimerRef.current = null;
    }

    await flushWalkData();

    walkIdRef.current = null;
    setWalkId(null);

    return completedWalkId;
  }, [flushWalkData]);

  useEffect(
    () => () => {
      if (walkTimerRef.current !== null) {
        clearInterval(walkTimerRef.current);
      }
    },
    [],
  );

  // Set up event listeners for pub/sub system
  useEffect(() => {
    const handleBLEUpdate = (event: BLEDataUpdated) => {
      const label =
        sensorLabelByCharacteristic[event.characteristicUUID.toLowerCase()] ??
        event.characteristicUUID;

      const sensorEvent: SensorEvent = {
        type: 'sensor_reading',
        timestamp: event.timestamp,
        source: event.source,
        deviceId: event.deviceId,
        olfactoryData: {
          readings: {
            [label]:
              typeof event.decodedValue === 'number' ? event.decodedValue : 0,
          },
          units: {
            [event.characteristicUUID]: 'ppm',
          },
        },
      };

      // Emit sensor event
      eventEmitter.emit('sensor_reading', sensorEvent);
    };

    const handleSensorReading = async (event: SensorEvent) => {
      if (!isSmellWalkActiveRef.current) {
        return;
      }

      if (!event.olfactoryData?.readings) {
        console.warn(
          '[Sensor] Reading event has no olfactoryData.readings — skipping:',
          event,
        );
        return;
      }

      const incomingReadings = event.olfactoryData.readings;
      walkDeviceIdRef.current = event.deviceId || event.source || 'unknown';

      Object.assign(walkReadingsRef.current, incomingReadings);
    };

    eventEmitter.on('ble_data_updated', handleBLEUpdate);
    eventEmitter.on('sensor_reading', handleSensorReading);

    return () => {
      eventEmitter.off('ble_data_updated', handleBLEUpdate);
      eventEmitter.off('sensor_reading', handleSensorReading);
    };
  }, []);

  return (
    <InfluxDBContext.Provider
      value={{
        isConnected: true,
        location,
        trail,
        isSmellWalkActive,
        walkId,
        startSmellWalk,
        stopSmellWalk,
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

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
import { SENSOR_BY_CHARACTERISTIC_UUID } from '../../sensors';
import { BLEDataUpdated, SensorEvent } from '../../types/events';

import {
  completeWalk,
  insertSensorRecord,
  interruptActiveWalks,
  reactivateWalk,
  updateWalkDevice,
  upsertWalk,
} from '../database/db';

import { INFLUX_CONFIG } from './config';
import { InfluxClient } from './client';
import { InfluxPoint } from './types';
import {
  clearActiveWalkId,
  getActiveWalkId,
  saveActiveWalkId,
} from '../background/SmellWalkBackgroundState';

import {
  requestForegroundServicePermission,
  startSmellWalkForegroundService,
  stopSmellWalkForegroundService,
} from '../background/SmellWalkForegroundService';

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
  startSmellWalk: (existingWalkId?: string) => Promise<void>;
  stopSmellWalk: () => Promise<string | null>;
};

const InfluxDBContext = createContext<InfluxDBContextType | undefined>(
  undefined,
);

/**
 * Maps the canonical sensor registry keys to the field names used by
 * SQLite and InfluxDB.
 */
const INFLUX_FIELD_BY_SENSOR_KEY: Record<string, string> = {
  CH4: 'ch4',
  NH3: 'nh3',
  HCHO: 'hcho',
  VOC: 'voc',
  Odour: 'odour',
  H2S: 'h2s',
  Etoh: 'etoh',
  NO2: 'no2',
  CO: 'co',
  Smoke: 'smoke',
  H2: 'h2',
  TempC: 'temperature',
  PressureHPa: 'pressure',
  HumidityPct: 'humidity',
  AltitudeM: 'altitude',
  GasResOhm: 'bme680_gas_resistance',
};

let influxClient: InfluxClient | null = null;

function getInfluxClient(): InfluxClient {
  if (!influxClient) {
    influxClient = new InfluxClient(INFLUX_CONFIG);
  }

  return influxClient;
}

function buildInfluxPoint(
  walkId: string,
  deviceId: string,
  readings: Record<string, number>,
  location: LiveLocation | null,
  recordedAt: number,
): InfluxPoint {
  const fields: Record<string, string | number | boolean> = {};

  Object.entries(readings).forEach(([sensorKey, value]) => {
    const fieldName = INFLUX_FIELD_BY_SENSOR_KEY[sensorKey];

    if (!fieldName) {
      return;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }

    fields[fieldName] = value;
  });

  if (location) {
    fields.latitude = location.latitude;
    fields.longitude = location.longitude;

    if (location.accuracyM !== null && Number.isFinite(location.accuracyM)) {
      fields.accuracy_m = location.accuracyM;
    }
  }

  return {
    measurement: 'smell_walk_point',
    tags: {
      walk_id: walkId,
      device_id: deviceId || 'unknown',
    },
    fields,
    timestamp: recordedAt * 1_000_000,
  };
}

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
        const authorization = await Geolocation.requestAuthorization('always');

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
        error => {
          console.warn('Live location error:', error.message);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 0,
          interval: 2000,
          fastestInterval: 1000,
          forceRequestLocation: true,
          showLocationDialog: true,
          showsBackgroundLocationIndicator: true,
        },
      );
    };

    startLocationWatch().catch(error => {
      console.warn('Unable to start live location:', error);
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

    if (!currentWalkId || Object.keys(readings).length === 0) {
      return;
    }

    /*
     * Clear the in-memory readings immediately so the same sample is not
     * written twice if another flush is triggered later.
     *
     * If SQLite fails, the readings are restored below.
     */
    walkReadingsRef.current = {};

    const currentLocation = latestLocationRef.current;
    const recordedAt = Date.now();
    const deviceId = walkDeviceIdRef.current || 'unknown';

    const valueFor = (sensorKey: string): number | null => {
      const value = readings[sensorKey];

      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    };

    try {
      /*
       * SQLite remains the local source of truth.
       *
       * InfluxDB is an additional remote destination. This means that a
       * temporary network failure does not cause the local sensor sample
       * to disappear.
       */
      await insertSensorRecord({
        id: `${currentWalkId}-${recordedAt}`,
        title: currentWalkId,
        description: deviceId,
        walkId: currentWalkId,
        recordType: 'walk_sample',
        tagsJson: null,
        photoPath: null,
        recordedAt,
        latitude: currentLocation?.latitude ?? null,
        longitude: currentLocation?.longitude ?? null,
        accuracyM: currentLocation?.accuracyM ?? null,

        ch4: valueFor('CH4'),
        nh3: valueFor('NH3'),
        hcho: valueFor('HCHO'),
        voc: valueFor('VOC'),
        odour: valueFor('Odour'),
        h2s: valueFor('H2S'),
        etoh: valueFor('Etoh'),
        no2: valueFor('NO2'),
        co: valueFor('CO'),
        smoke: valueFor('Smoke'),
        h2: valueFor('H2'),
        temperature: valueFor('TempC'),
        pressure: valueFor('PressureHPa'),
        humidity: valueFor('HumidityPct'),
        altitude: valueFor('AltitudeM'),
        bme680GasResistance: valueFor('GasResOhm'),

        deltaCh4: null,
        deltaNh3: null,
        deltaHcho: null,
        deltaVoc: null,
        deltaOdour: null,
        deltaH2s: null,
        deltaEtoh: null,
        deltaNo2: null,

        /*
         * These are required by the current SensorRecord type.
         *
         * SQLite is still responsible for its normal syncStatus/syncedAt
         * fields. These three fields describe the Influx side of the
         * record.
         */
        influxStatus: 'pending',
        influxSyncedAt: null,
        influxLastError: null,
      });

      console.log(`Stored smell walk sample ${currentWalkId}`);

      /*
       * Send the same sample to InfluxDB after local persistence succeeds.
       */
      try {
        const point = buildInfluxPoint(
          currentWalkId,
          deviceId,
          readings,
          currentLocation,
          recordedAt,
        );

        if (Object.keys(point.fields).length > 0) {
          await getInfluxClient().writeTimeseriesPoint(point);

          console.log(
            `Uploaded smell walk sample ${currentWalkId} to InfluxDB`,
          );
        } else {
          console.warn(
            `Skipping InfluxDB write for ${currentWalkId}: no valid sensor fields`,
          );
        }
      } catch (influxError) {
        /*
         * Do not restore the readings here.
         *
         * The sample is already safely stored in SQLite. Restoring it would
         * cause the same local sample to be inserted again on the next
         * flush.
         */
        console.error(
          `Failed to upload smell walk sample ${currentWalkId} to InfluxDB:`,
          influxError,
        );
      }
    } catch (error) {
      /*
       * SQLite failed, so restore the readings so the next flush can try
       * again instead of silently losing sensor data.
       */
      walkReadingsRef.current = {
        ...readings,
        ...walkReadingsRef.current,
      };

      console.error('Error storing smell walk data locally:', error);

      throw error;
    }
  }, []);

  const startWalkFlushTimer = useCallback(() => {
    if (walkTimerRef.current !== null) {
      return;
    }

    walkTimerRef.current = setInterval(() => {
      flushWalkData().catch(error => {
        console.error('Error flushing smell walk data:', error);
      });
    }, 5000);
  }, [flushWalkData]);

  useEffect(() => {
    let cancelled = false;

    const restoreRecordingState = async () => {
      try {
        const activeWalkId = await getActiveWalkId();

        if (cancelled) {
          return;
        }

        if (!activeWalkId) {
          await interruptActiveWalks(Date.now());
          return;
        }

        console.log(
          `Restoring active smell walk from background: ${activeWalkId}`,
        );

        walkIdRef.current = activeWalkId;
        isSmellWalkActiveRef.current = true;

        setWalkId(activeWalkId);
        setIsSmellWalkActive(true);

        await reactivateWalk(activeWalkId);

        if (Platform.OS === 'android') {
          await startSmellWalkForegroundService(activeWalkId);
        }

        startWalkFlushTimer();
      } catch (error) {
        console.error('Unable to restore background smell walk:', error);
      }
    };

    restoreRecordingState();

    return () => {
      cancelled = true;
    };
  }, [startWalkFlushTimer]);

  const startSmellWalk = useCallback(
    async (existingWalkId?: string): Promise<void> => {
      if (isSmellWalkActiveRef.current) {
        return;
      }

      if (Platform.OS === 'android') {
        const notificationsAllowed = await requestForegroundServicePermission();

        if (!notificationsAllowed) {
          console.warn(
            'Notification permission denied. Background recording may not be visible to the user.',
          );
        }
      }

      const nextWalkId = existingWalkId ?? `walk-${Date.now()}`;

      walkIdRef.current = nextWalkId;
      walkReadingsRef.current = {};
      walkDeviceIdRef.current = 'unknown';

      const now = Date.now();

      if (existingWalkId) {
        await reactivateWalk(nextWalkId);
      } else {
        await upsertWalk({
          id: nextWalkId,
          deviceId: 'unknown',
          deviceName: null,
          startedAt: now,
          resumedAt: null,
          endedAt: null,
          status: 'active',
          appVersion: null,
          notes: null,
        });
      }

      await saveActiveWalkId(nextWalkId);

      isSmellWalkActiveRef.current = true;

      setWalkId(nextWalkId);
      setTrail(latestLocationRef.current ? [latestLocationRef.current] : []);
      setIsSmellWalkActive(true);

      try {
        await startSmellWalkForegroundService(nextWalkId);
      } catch (error) {
        console.error('Unable to start smell walk foreground service:', error);
      }

      startWalkFlushTimer();
    },
    [startWalkFlushTimer],
  );

  const stopSmellWalk = useCallback(async (): Promise<string | null> => {
    if (!isSmellWalkActiveRef.current) {
      return null;
    }

    const completedWalkId = walkIdRef.current;

    isSmellWalkActiveRef.current = false;
    setIsSmellWalkActive(false);

    if (walkTimerRef.current !== null) {
      clearInterval(walkTimerRef.current);
      walkTimerRef.current = null;
    }

    try {
      await flushWalkData();

      if (completedWalkId) {
        await completeWalk(completedWalkId, Date.now());
      }
    } finally {
      await clearActiveWalkId().catch(error => {
        console.warn('Unable to clear active smell walk state:', error);
      });

      await stopSmellWalkForegroundService().catch(error => {
        console.warn('Unable to stop smell walk foreground service:', error);
      });

      walkIdRef.current = null;

      setWalkId(null);
      setTrail([]);
    }

    return completedWalkId;
  }, [flushWalkData]);

  /*
   * BLE -> SensorEvent
   *
   * The shared sensor registry is the only source of truth for mapping
   * characteristic UUIDs to sensor keys.
   */
  useEffect(() => {
    const handleBLEUpdate = (event: BLEDataUpdated) => {
      const characteristicUUID = event.characteristicUUID.toLowerCase();

      const sensor = SENSOR_BY_CHARACTERISTIC_UUID[characteristicUUID];

      if (!sensor) {
        console.warn(
          `Ignoring unregistered sensor characteristic: ${characteristicUUID}`,
        );
        return;
      }

      const decodedValue =
        typeof event.decodedValue === 'number'
          ? event.decodedValue
          : Number(event.decodedValue);

      if (!Number.isFinite(decodedValue)) {
        console.warn(
          `Ignoring non-numeric sensor value for ${sensor.key}:`,
          event.decodedValue,
        );
        return;
      }

      const sensorEvent: SensorEvent = {
        type: 'sensor_reading',
        timestamp: event.timestamp,
        source: event.source,
        deviceId: event.deviceId,
        olfactoryData: {
          readings: {
            [sensor.key]: decodedValue,
          },
          units: {
            [sensor.key]: sensor.unit,
          },
        },
      };

      eventEmitter.emit('sensor_reading', sensorEvent);
    };

    const handleSensorReading = async (event: SensorEvent) => {
      console.log('InfluxDB Service: Sensor reading:', event);

      if (!isSmellWalkActiveRef.current || !event.olfactoryData?.readings) {
        return;
      }

      walkDeviceIdRef.current = event.deviceId || event.source || 'unknown';

      if (walkIdRef.current && walkDeviceIdRef.current !== 'unknown') {
        updateWalkDevice(
          walkIdRef.current,
          walkDeviceIdRef.current,
          walkDeviceIdRef.current,
        ).catch(error => {
          console.warn('Failed to update walk device metadata:', error);
        });
      }

      Object.entries(event.olfactoryData.readings).forEach(
        ([sensorKey, value]) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            walkReadingsRef.current[sensorKey] = value;
          }
        },
      );
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

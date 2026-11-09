import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { Platform } from 'react-native';
import Geolocation, { GeoPosition } from 'react-native-geolocation-service';

import { eventEmitter } from '../../BLEUniversal';
import {
  ENV_FRAME_CHARACTERISTIC_UUID,
  ENV_SENSOR_DEFINITIONS,
  GAS_FRAME_CHARACTERISTIC_UUID,
  GAS_SENSOR_DEFINITIONS,
  SENSOR_BY_CHARACTERISTIC_UUID,
  SENSOR_DEFINITIONS,
} from '../../sensors';
import { BLEDataUpdated, SensorEvent } from '../../types/events';

import {
  completeWalk,
  insertSensorRecord,
  interruptActiveWalks,
  reactivateWalk,
  updateWalkDevice,
  upsertWalk,
} from '../database/db';

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
import { ensureFullLocationAccess } from '../location/locationPermissions';
import { DateTime } from 'luxon';

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
  startSmellWalk: (
    existingWalkId?: string,
    deviceName?: string | null,
  ) => Promise<void>;
  stopSmellWalk: () => Promise<string | null>;
  ingestReadings: (
    values: Record<string, unknown>,
    deviceId?: string | null,
  ) => void;
};

const InfluxDBContext = createContext<InfluxDBContextType | undefined>(
  undefined,
);

const LOCATION_INTERVAL_MS = 500;
const TRAIL_MIN_DISTANCE_M = 1;
const TRAIL_MAX_ACCURACY_M = 30;
const TRAIL_MAX_POINTS = 7200;

function distanceM(a: LiveLocation, b: LiveLocation): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toLiveLocation(position: GeoPosition): LiveLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? null,
    recordedAt: position.timestamp,
  };
}

const VALID_SENSOR_KEYS = new Set<string>(
  SENSOR_DEFINITIONS.map(sensor => sensor.key),
);

let influxClient: InfluxClient | null = null;

function getInfluxClient(): InfluxClient {
  if (!influxClient) {
    influxClient = new InfluxClient();
  }

  return influxClient;
}

function buildInfluxPoints(
  walkId: string,
  deviceName: string,
  readings: Record<string, number>,
  location: LiveLocation | null,
  recordedAt: number,
): InfluxPoint[] {
  const tags = {
    device_name: deviceName || 'unknown',
    walk_id: walkId,
    date: DateTime.fromMillis(recordedAt).toFormat('yyyy-MM-dd'),
  };

  const timestamp = recordedAt * 1_000_000;
  const points: InfluxPoint[] = [];

  Object.entries(readings).forEach(([sensorKey, value]) => {
    if (!VALID_SENSOR_KEYS.has(sensorKey)) {
      return;
    }

    const measurement = sensorKey;

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }

    const fields: Record<string, string | number | boolean> = { value };

    if (location) {
      fields.latitude = location.latitude;
      fields.longitude = location.longitude;

      if (location.accuracyM !== null && Number.isFinite(location.accuracyM)) {
        fields.accuracy_m = location.accuracyM;
      }
    }

    points.push({
      measurement,
      tags,
      fields,
      timestamp,
    });
  });

  return points;
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
  const walkDeviceNameRef = useRef('unknown');
  const lastWalkFlushAtRef = useRef(0);
  const lastSyncedDeviceIdRef = useRef<string | null>(null);
  const lastEmptyFlushWarnAtRef = useRef(0);

  const walkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    interruptActiveWalks(Date.now()).catch(error => {
      console.warn(
        'Failed to mark previously active walks as interrupted:',
        error,
      );
    });
  }, []);

  useEffect(() => {
    let watchId: number | null = null;
    let active = true;

    const startLocationWatch = async () => {
      const access = await ensureFullLocationAccess();

      if (!access.granted) {
        console.warn(
          `Full location access is required for smell walks (${access.reason})`,
        );
        return;
      }

      if (!active) {
        return;
      }

      Geolocation.getCurrentPosition(
        (position: GeoPosition) => {
          if (!active || latestLocationRef.current) {
            return;
          }
          const seeded = toLiveLocation(position);
          latestLocationRef.current = seeded;
          setLocation(seeded);
        },
        error => {
          console.warn('Initial location error:', error.message);
        },
        {
          enableHighAccuracy: false,
          maximumAge: 60000,
          timeout: 10000,
        },
      );

      watchId = Geolocation.watchPosition(
        (position: GeoPosition) => {
          const nextLocation = toLiveLocation(position);

          const previousLocation = latestLocationRef.current;
          if (
            previousLocation &&
            previousLocation.recordedAt === nextLocation.recordedAt
          ) {
            return;
          }

          latestLocationRef.current = nextLocation;
          setLocation(nextLocation);

          if (isSmellWalkActiveRef.current) {
            const accurateEnough =
              nextLocation.accuracyM === null ||
              nextLocation.accuracyM <= TRAIL_MAX_ACCURACY_M;

            if (accurateEnough) {
              setTrail(previous => {
                const last = previous[previous.length - 1];
                if (
                  last &&
                  distanceM(last, nextLocation) < TRAIL_MIN_DISTANCE_M
                ) {
                  return previous;
                }
                const next = [...previous, nextLocation];
                return next.length > TRAIL_MAX_POINTS
                  ? next.slice(-TRAIL_MAX_POINTS)
                  : next;
              });
            }
          }
        },
        error => {
          console.warn('Live location error:', error.message);
        },
        {
          accuracy: { android: 'high', ios: 'best' },
          enableHighAccuracy: true,
          distanceFilter: 0,
          interval: LOCATION_INTERVAL_MS,
          fastestInterval: LOCATION_INTERVAL_MS,
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

    if (!currentWalkId) {
      return;
    }

    if (Object.keys(readings).length === 0) {
      const now = Date.now();
      if (now - lastEmptyFlushWarnAtRef.current > 15000) {
        lastEmptyFlushWarnAtRef.current = now;
        console.warn(
          `Smell walk ${currentWalkId} is active but no sensor readings have been received yet, so nothing is saved or uploaded.`,
        );
      }
      return;
    }

    const valueFor = (sensorKey: string): number | null => {
      const value = readings[sensorKey];

      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    };

    const currentLocation = latestLocationRef.current;
    const recordedAt = Date.now();
    const deviceId = walkDeviceIdRef.current || 'unknown';
    const deviceName = walkDeviceNameRef.current || 'unknown';

    try {
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

        influxStatus: 'pending',
        influxSyncedAt: null,
        influxLastError: null,
      });

      console.log(`Stored smell walk sample ${currentWalkId}`);

      try {
        const points = buildInfluxPoints(
          currentWalkId,
          deviceName,
          readings,
          currentLocation,
          recordedAt,
        );

        if (points.length > 0) {
          await Promise.all(
            points.map(point => getInfluxClient().writeTimeseriesPoint(point)),
          );

          console.log(
            `Uploaded ${points.length} readings for ${currentWalkId} to InfluxDB`,
          );
        } else {
          console.warn(
            `Skipping InfluxDB write for ${currentWalkId}: no valid sensor readings`,
          );
        }
      } catch (influxError) {
        console.error(
          `Failed to upload smell walk sample ${currentWalkId} to InfluxDB:`,
          influxError,
        );
      }
    } catch (error) {
      walkReadingsRef.current = {
        ...readings,
        ...walkReadingsRef.current,
      };

      console.error('Error storing smell walk data locally:', error);

      throw error;
    }
  }, []);

  const applyReadings = useCallback(
    (readings: Record<string, unknown>, deviceId?: string | null) => {
      if (!isSmellWalkActiveRef.current) {
        return;
      }

      const validReadings: Record<string, number> = {};
      Object.entries(readings).forEach(([sensorKey, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          validReadings[sensorKey] = value;
        }
      });

      if (Object.keys(validReadings).length === 0) {
        return;
      }

      const resolvedDeviceId = deviceId || walkDeviceIdRef.current || 'unknown';
      walkDeviceIdRef.current = resolvedDeviceId;

      if (walkDeviceNameRef.current === 'unknown') {
        walkDeviceNameRef.current = resolvedDeviceId;
      }

      if (
        walkIdRef.current &&
        resolvedDeviceId !== 'unknown' &&
        lastSyncedDeviceIdRef.current !== resolvedDeviceId
      ) {
        lastSyncedDeviceIdRef.current = resolvedDeviceId;
        updateWalkDevice(
          walkIdRef.current,
          resolvedDeviceId,
          resolvedDeviceId,
        ).catch(error => {
          console.warn('Failed to update walk device metadata:', error);
        });
      }

      Object.assign(walkReadingsRef.current, validReadings);

      const now = Date.now();
      if (now - lastWalkFlushAtRef.current >= 5000) {
        lastWalkFlushAtRef.current = now;
        flushWalkData().catch(error => {
          console.error('Error flushing background smell walk data:', error);
        });
      }
    },
    [flushWalkData],
  );

  const ingestReadings = useCallback(
    (values: Record<string, unknown>, deviceId?: string | null) => {
      const readings: Record<string, unknown> = {};

      SENSOR_DEFINITIONS.forEach(sensor => {
        const raw = values[sensor.key] ?? values[sensor.label];
        if (raw !== undefined && raw !== null) {
          readings[sensor.key] = raw;
        }
      });

      applyReadings(readings, deviceId);
    },
    [applyReadings],
  );

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
        walkDeviceNameRef.current = 'unknown';
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
    async (
      existingWalkId?: string,
      deviceName?: string | null,
    ): Promise<void> => {
      if (isSmellWalkActiveRef.current) {
        return;
      }

      const locationAccess = await ensureFullLocationAccess();
      if (!locationAccess.granted) {
        throw new Error(
          'Full location access is required to start a smell walk',
        );
      }

      if (Platform.OS === 'android') {
        const notificationsAllowed = await requestForegroundServicePermission();

        if (!notificationsAllowed) {
          console.warn(
            'Notification permission denied. Background recording may not be visible to the user.',
          );
        }
      }

      const time = `${DateTime.now().toFormat('dd-MM-yy-HH-mm-ss')}`;
      const nextWalkId =
        existingWalkId ?? `walk-${time}-${deviceName ?? 'unknown'}`;

      walkIdRef.current = nextWalkId;
      walkReadingsRef.current = {};
      walkDeviceIdRef.current = 'unknown';
      walkDeviceNameRef.current = deviceName ?? 'unknown';
      lastSyncedDeviceIdRef.current = null;
      lastWalkFlushAtRef.current = Date.now();

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
      walkDeviceNameRef.current = 'unknown';
      lastWalkFlushAtRef.current = 0;

      setWalkId(null);
      setTrail([]);
    }

    return completedWalkId;
  }, [flushWalkData]);

  useEffect(() => {
    const unrecognisedFrameWarned = new Set<string>();

    const handleFrameUpdate = (
      event: BLEDataUpdated,
      characteristicUUID: string,
    ) => {
      const expectedSensors =
        characteristicUUID === GAS_FRAME_CHARACTERISTIC_UUID
          ? GAS_SENSOR_DEFINITIONS
          : ENV_SENSOR_DEFINITIONS;

      const decoded = event.decodedValue as unknown;
      const readings: Record<string, number> = {};
      const units: Record<string, string> = {};

      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        const values = decoded as Record<string, unknown>;

        expectedSensors.forEach(sensor => {
          const raw = values[sensor.key] ?? values[sensor.label];
          const value = typeof raw === 'number' ? raw : Number(raw);

          if (raw !== undefined && raw !== null && Number.isFinite(value)) {
            readings[sensor.key] = value;
            units[sensor.key] = sensor.unit;
          }
        });
      }

      if (Object.keys(readings).length === 0) {
        if (!unrecognisedFrameWarned.has(characteristicUUID)) {
          unrecognisedFrameWarned.add(characteristicUUID);
          console.warn(
            `Unrecognised frame format for ${characteristicUUID}. Expected an object keyed by sensor key. Received:`,
            JSON.stringify(event),
          );
        }
        return;
      }

      const sensorEvent: SensorEvent = {
        type: 'sensor_reading',
        timestamp: event.timestamp,
        source: event.source,
        deviceId: event.deviceId,
        olfactoryData: {
          readings,
          units,
        },
      };

      eventEmitter.emit('sensor_reading', sensorEvent);
    };

    const handleBLEUpdate = (event: BLEDataUpdated) => {
      const characteristicUUID = event.characteristicUUID.toLowerCase();

      if (
        characteristicUUID === GAS_FRAME_CHARACTERISTIC_UUID ||
        characteristicUUID === ENV_FRAME_CHARACTERISTIC_UUID
      ) {
        handleFrameUpdate(event, characteristicUUID);
        return;
      }

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

    const handleSensorReading = (event: SensorEvent) => {
      if (!isSmellWalkActiveRef.current || !event.olfactoryData?.readings) {
        return;
      }

      applyReadings(
        event.olfactoryData.readings,
        event.deviceId || event.source || null,
      );
    };

    eventEmitter.on('ble_data_updated', handleBLEUpdate);

    eventEmitter.on('sensor_reading', handleSensorReading);

    return () => {
      eventEmitter.off('ble_data_updated', handleBLEUpdate);

      eventEmitter.off('sensor_reading', handleSensorReading);
    };
  }, [applyReadings]);

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
        ingestReadings,
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

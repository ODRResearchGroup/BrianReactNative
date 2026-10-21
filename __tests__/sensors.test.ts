import {
  BATTERY_CHARACTERISTIC_DEFINITIONS,
  BATTERY_SERVICE_UUID,
  ENV_SENSOR_DEFINITIONS,
  GAS_SENSOR_DEFINITIONS,
  SENSOR_BY_CHARACTERISTIC_UUID,
  SENSOR_DEFINITIONS,
} from '../src/sensors';

describe('sensor registry', () => {
  it('contains all expected gas and environmental channels', () => {
    expect(GAS_SENSOR_DEFINITIONS).toHaveLength(11);
    expect(ENV_SENSOR_DEFINITIONS).toHaveLength(5);
    expect(SENSOR_DEFINITIONS).toHaveLength(16);
  });

  it('indexes every sensor by characteristic UUID', () => {
    for (const sensor of SENSOR_DEFINITIONS) {
      expect(SENSOR_BY_CHARACTERISTIC_UUID[sensor.characteristicUUID]).toEqual(
        sensor,
      );
    }
  });

  it('defines the battery values using their firmware BLE formats', () => {
    expect(BATTERY_SERVICE_UUID).toBe('0000180f-0000-1000-8000-00805f9b34fb');
    expect(BATTERY_CHARACTERISTIC_DEFINITIONS).toEqual([
      {
        label: 'Battery Percentage',
        sensorKey: 'Battery Percentage',
        serviceUUID: BATTERY_SERVICE_UUID,
        characteristicUUID: '00002a19-0000-1000-8000-00805f9b34fb',
        format: 'uint8',
        emitEvent: false,
      },
      {
        label: 'Battery Runtime',
        sensorKey: 'Battery Runtime',
        serviceUUID: 'de664a17-7db4-449f-97ba-5514e19a9d94',
        characteristicUUID: 'd5e4f3a2-b1c0-4d9e-8f7a-6b5c4d3e2f10',
        format: 'float32',
        emitEvent: false,
      },
    ]);
  });
});

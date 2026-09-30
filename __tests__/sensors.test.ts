import {
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
});

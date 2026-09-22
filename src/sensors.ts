export const ESS_SERVICE_UUID = '0000181a-0000-1000-8000-00805f9b34fb';
export const CUSTOM_SERVICE_UUID = 'de664a17-7db4-449f-97ba-5514e19a9d94';

export type SensorKind = 'gas' | 'env';

export type SensorDefinition = {
  key: string;
  label: string;
  chartLabel: string;
  serviceUUID: string;
  characteristicUUID: string;
  unit: string;
  kind: SensorKind;
};

export const SENSOR_DEFINITIONS = [
  {
    key: 'CH4',
    label: 'Methane',
    chartLabel: 'Ch4',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002bd1-0000-1000-8000-00805f9b34fb',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'NO2',
    label: 'Nitrogen Dioxide',
    chartLabel: 'No2',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002bd2-0000-1000-8000-00805f9b34fb',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'VOC',
    label: 'Voletile Organic Compounds',
    chartLabel: 'VOC',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002bd3-0000-1000-8000-00805f9b34fb',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'NH3',
    label: 'Ammonia',
    chartLabel: 'NH3',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002bcf-0000-1000-8000-00805f9b34fb',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'HCHO',
    label: 'Formaldehyde',
    chartLabel: 'HCHO',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: '6a135b89-f360-4f64-86fc-5a14092034b4',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'Odour',
    label: 'Odor',
    chartLabel: 'Odour',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: '4c28fcb8-d69b-404a-8668-41655d814e7f',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'Etoh',
    label: 'Ethanol',
    chartLabel: 'Etoh',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: 'f8156843-6d98-4ba2-8014-1cf03d7dedb8',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'H2S',
    label: 'Hydrogen Sulfide',
    chartLabel: 'H2S',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: '87dc71bd-29a4-4218-a2a7-83fd2a69cc40',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'CO',
    label: 'Carbon Monoxide',
    chartLabel: 'CO',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: '88f6fa6c-c4e0-4a3d-ba72-f435641251c4',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'Smoke',
    label: 'Smoke',
    chartLabel: 'Smoke',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: 'cafb955e-6e7b-424b-9e03-6d8d003aa286',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'H2',
    label: 'Hydrogen',
    chartLabel: 'H2',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: '0176655b-0007-4e02-abc1-e9f2d6815f46',
    unit: 'V',
    kind: 'gas',
  },
  {
    key: 'TempC',
    label: 'Temperature',
    chartLabel: 'Temp',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002a6e-0000-1000-8000-00805f9b34fb',
    unit: '°C',
    kind: 'env',
  },
  {
    key: 'PressureHPa',
    label: 'Pressure',
    chartLabel: 'Pressure',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002a6d-0000-1000-8000-00805f9b34fb',
    unit: 'hPa',
    kind: 'env',
  },
  {
    key: 'HumidityPct',
    label: 'Humidity',
    chartLabel: 'Humidity',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002a6f-0000-1000-8000-00805f9b34fb',
    unit: '%',
    kind: 'env',
  },
  {
    key: 'AltitudeM',
    label: 'Altitude',
    chartLabel: 'Altitude',
    serviceUUID: ESS_SERVICE_UUID,
    characteristicUUID: '00002a69-0000-1000-8000-00805f9b34fb',
    unit: 'm',
    kind: 'env',
  },
  {
    key: 'GasResOhm',
    label: 'Gas Resistance',
    chartLabel: 'Gas Ω',
    serviceUUID: CUSTOM_SERVICE_UUID,
    characteristicUUID: '5b0e3c0b-1a44-4b76-82ee-8c2adc2dd8e9',
    unit: 'Ω',
    kind: 'env',
  },
] as const satisfies readonly SensorDefinition[];

export type SensorKey = (typeof SENSOR_DEFINITIONS)[number]['key'];
type SensorEntry = (typeof SENSOR_DEFINITIONS)[number];

export const GAS_SENSOR_DEFINITIONS = SENSOR_DEFINITIONS.filter(
  (sensor): sensor is Extract<SensorEntry, { kind: 'gas' }> =>
    sensor.kind === 'gas',
);
export const ENV_SENSOR_DEFINITIONS = SENSOR_DEFINITIONS.filter(
  (sensor): sensor is Extract<SensorEntry, { kind: 'env' }> =>
    sensor.kind === 'env',
);

export type GasSensorKey = (typeof GAS_SENSOR_DEFINITIONS)[number]['key'];
export type EnvSensorKey = (typeof ENV_SENSOR_DEFINITIONS)[number]['key'];

export const SENSOR_BY_CHARACTERISTIC_UUID = Object.fromEntries(
  SENSOR_DEFINITIONS.map(sensor => [sensor.characteristicUUID, sensor]),
) as Record<string, (typeof SENSOR_DEFINITIONS)[number]>;

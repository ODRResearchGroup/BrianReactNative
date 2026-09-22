import Config from 'react-native-config';
import { SensorRecord } from './db';

function getConfig() {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_SAVE_SENSOR_RECORD_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error(
      'Missing AZURE_FUNCTION_BASE_URL or AZURE_SAVE_SENSOR_RECORD_KEY',
    );
  }
  return { baseUrl, functionKey };
}

export async function uploadSensorRecord(record: SensorRecord): Promise<void> {
  const { baseUrl, functionKey } = getConfig();
  const url = `${baseUrl}/api/save-sensor-record?code=${encodeURIComponent(
    functionKey,
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: record.id,
      title: record.title,
      description: record.description,
      recordedAt: record.recordedAt,
      latitude: record.latitude,
      longitude: record.longitude,
      ch4: record.ch4,
      nh3: record.nh3,
      hcho: record.hcho,
      voc: record.voc,
      odour: record.odour,
      h2s: record.h2s,
      etoh: record.etoh,
      no2: record.no2,
      deltaCh4: record.deltaCh4,
      deltaNh3: record.deltaNh3,
      deltaHcho: record.deltaHcho,
      deltaVoc: record.deltaVoc,
      deltaOdour: record.deltaOdour,
      deltaH2s: record.deltaH2s,
      deltaEtoh: record.deltaEtoh,
      deltaNo2: record.deltaNo2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`save-sensor-record ${res.status}: ${text}`);
  }
}

import { SensorRecord } from './db';
import { backendFetch } from '../backendClient';

export async function uploadSensorRecord(record: SensorRecord): Promise<void> {
  const res = await backendFetch('/api/mobile/sensor-record', {
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
      co: record.co,
      smoke: record.smoke,
      h2: record.h2,
      temperature: record.temperature,
      pressure: record.pressure,
      humidity: record.humidity,
      altitude: record.altitude,
      bme680GasResistance: record.bme680GasResistance,
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

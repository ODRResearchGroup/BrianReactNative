import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { zip } from 'react-native-zip-archive';
import Share from 'react-native-share';
import {
  listAnnotationsByWalkId,
  listAllSensorRecords,
  listCapturesByWalkId,
  listFingerprintsByWalkId,
  listCaptures,
  listSensorRecordsByWalkId,
} from '../database/db';

const EXPORT_DIR = `${RNFS.DocumentDirectoryPath}/SmellwalkExports`;

export type ExportManifest = {
  exportedAt: string;
  appVersion: string;
  schema: 'smellwalk_export_v1';
  counts: {
    sensorRecords: number;
    captures: number;
  };
  relationships: Array<{ sensorRecordId: string; captureIds: string[] }>;
};

export async function exportAllData(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = `${EXPORT_DIR}/export_${timestamp}`;

  await RNFS.mkdir(stagingDir);

  const [sensorRecords, captures] = await Promise.all([
    listAllSensorRecords(10000),
    listCaptures(10000),
  ]);

  const manifest: ExportManifest = {
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    schema: 'smellwalk_export_v1',
    counts: { sensorRecords: sensorRecords.length, captures: captures.length },
    relationships: sensorRecords.map(sr => ({
      sensorRecordId: sr.id,
      captureIds: captures
        .filter(c => c.sensorRecordId === sr.id)
        .map(c => c.id),
    })),
  };

  await Promise.all([
    RNFS.writeFile(
      `${stagingDir}/manifest.json`,
      JSON.stringify(manifest, null, 2),
      'utf8',
    ),
    RNFS.writeFile(
      `${stagingDir}/sensor_records.json`,
      JSON.stringify(sensorRecords, null, 2),
      'utf8',
    ),
    RNFS.writeFile(
      `${stagingDir}/captures.json`,
      JSON.stringify(captures, null, 2),
      'utf8',
    ),
  ]);

  const mediaDir = `${stagingDir}/media`;
  await RNFS.mkdir(mediaDir);

  await Promise.all(
    captures
      .filter(c => c.localPath)
      .map(async c => {
        const src = c.localPath!.replace(/^file:\/\//, '');
        const ext = c.type === 'audio' ? 'm4a' : 'jpg';
        const dest = `${mediaDir}/${c.id}.${ext}`;
        const exists = await RNFS.exists(src);
        if (exists) {
          await RNFS.copyFile(src, dest);
        }
      }),
  );

  const zipPath = `${EXPORT_DIR}/smellwalk_${timestamp}.zip`;
  await zip(stagingDir, zipPath);

  await RNFS.unlink(stagingDir).catch(() => {});

  await Share.open({
    title: 'Export Smellwalk Data',
    url: `file://${zipPath}`,
    type: 'application/zip',
    saveToFiles: true,
    failOnCancel: false,
  });
}

function csvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportSmellWalkCsv(walkId: string): Promise<string> {
  const records = await listSensorRecordsByWalkId(walkId);
  const headers = [
    'walk_id',
    'recorded_at',
    'latitude',
    'longitude',
    'accuracy_m',
    'ch4',
    'nh3',
    'hcho',
    'voc',
    'odour',
    'h2s',
    'etoh',
    'no2',
    'co',
    'smoke',
    'h2',
    'temperature',
    'pressure',
    'humidity',
    'altitude',
    'bme680_gas_resistance',
  ];
  const lines = [
    headers.join(','),
    ...records.map(record =>
      [
        walkId,
        new Date(record.recordedAt).toISOString(),
        record.latitude,
        record.longitude,
        record.accuracyM,
        record.ch4,
        record.nh3,
        record.hcho,
        record.voc,
        record.odour,
        record.h2s,
        record.etoh,
        record.no2,
        record.co,
        record.smoke,
        record.h2,
        record.temperature,
        record.pressure,
        record.humidity,
        record.altitude,
        record.bme680GasResistance,
      ]
        .map(csvValue)
        .join(','),
    ),
  ];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `smellwalk_${walkId}_${timestamp}.csv`;
  const csvPath = `${EXPORT_DIR}/${fileName}`;

  await RNFS.mkdir(EXPORT_DIR);
  await RNFS.writeFile(csvPath, `\ufeff${lines.join('\n')}\n`, 'utf8');
  if (Platform.OS === 'android') {
    return ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      { name: fileName, parentFolder: 'SmellWalk', mimeType: 'text/csv' },
      'Download',
      csvPath,
    );
  }

  await Share.open({
    title: 'Save Smell Walk CSV',
    url: `file://${csvPath}`,
    type: 'text/csv',
    saveToFiles: true,
    failOnCancel: false,
  });
  return csvPath;
}

export async function exportSmellWalkZip(walkId: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = `${EXPORT_DIR}/walk_${walkId}_${timestamp}`;
  const mediaDir = `${stagingDir}/media`;
  const csvPath = await exportSmellWalkCsv(walkId);
  const csvContents = await RNFS.readFile(csvPath, 'utf8');
  const [samples, fingerprints, captures, annotations] = await Promise.all([
    listSensorRecordsByWalkId(walkId),
    listFingerprintsByWalkId(walkId),
    listCapturesByWalkId(walkId),
    listAnnotationsByWalkId(walkId),
  ]);

  await RNFS.mkdir(stagingDir);
  await RNFS.mkdir(mediaDir);

  await Promise.all([
    RNFS.writeFile(`${stagingDir}/samples.csv`, csvContents, 'utf8'),
    RNFS.writeFile(
      `${stagingDir}/walk_samples.json`,
      JSON.stringify(samples, null, 2),
      'utf8',
    ),
    RNFS.writeFile(
      `${stagingDir}/fingerprints.json`,
      JSON.stringify(fingerprints, null, 2),
      'utf8',
    ),
    RNFS.writeFile(
      `${stagingDir}/captures.json`,
      JSON.stringify(captures, null, 2),
      'utf8',
    ),
    RNFS.writeFile(
      `${stagingDir}/annotations.json`,
      JSON.stringify(annotations, null, 2),
      'utf8',
    ),
  ]);

  await Promise.all(
    captures
      .filter(c => c.localPath)
      .map(async capture => {
        const source = capture.localPath!.replace(/^file:\/\//, '');
        const extension = capture.type === 'audio' ? 'm4a' : 'jpg';
        const destination = `${mediaDir}/${capture.type}_${capture.id}.${extension}`;
        if (await RNFS.exists(source)) {
          await RNFS.copyFile(source, destination);
        }
      }),
  );

  const zipPath = `${EXPORT_DIR}/smellwalk_${walkId}_${timestamp}.zip`;
  await zip(stagingDir, zipPath);
  await RNFS.unlink(stagingDir).catch(() => {});
  await Share.open({
    title: 'Save Smell Walk Export',
    url: `file://${zipPath}`,
    type: 'application/zip',
    saveToFiles: true,
    failOnCancel: false,
  });
  return zipPath;
}

import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

const DB_NAME = 'smellwalk.db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SensorRecord = {
  id: string;
  title: string;
  description: string;
  tagsJson: string | null;
  photoPath: string | null;
  recordedAt: number; // Unix ms
  latitude: number | null;
  longitude: number | null;
  accuracyM?: number | null;
  ch4: number;
  nh3: number;
  hcho: number;
  voc: number;
  odour: number;
  h2s: number;
  etoh: number;
  no2: number;
  deltaCh4: number | null;
  deltaNh3: number | null;
  deltaHcho: number | null;
  deltaVoc: number | null;
  deltaOdour: number | null;
  deltaH2s: number | null;
  deltaEtoh: number | null;
  deltaNo2: number | null;
  syncStatus: 'pending' | 'synced' | 'failed';
  syncedAt: number | null;
};

export type CaptureRow = {
  id: string;
  sensorRecordId: string | null; // FK → sensor_records.id (nullable = freestanding)
  type: 'audio' | 'photo';
  localPath: string | null;
  bundleBlobName: string | null;
  imageBlobName: string | null;
  imageContainer: string | null;
  status:
    | 'local'
    | 'pending'
    | 'uploading'
    | 'uploaded'
    | 'processing'
    | 'transcribed'
    | 'failed';
  transcriptJson: string | null;
  selectedTagsJson: string | null;
  suggestedTagsJson: string | null;
  description: string;
  latitudeDisplay: string | null;
  longitudeDisplay: string | null;
  latitudeRaw: number | null;
  longitudeRaw: number | null;
  capturedAt: number;
  annotationIndex: number | null;
  syncStatus: 'pending' | 'synced' | 'failed';
};

export type AnnotationRow = {
  id: string;
  captureId: string | null;
  sensorRecordId: string | null;
  strokesJson: string | null;
  selectedTagsJson: string | null;
  savedAt: number;
  syncStatus: 'pending' | 'synced' | 'failed';
  azureBlobName: string | null;
};

export type SyncQueueRow = {
  id: string;
  entityType: 'sensor_record' | 'capture' | 'annotation';
  entityId: string;
  operation: 'create' | 'update';
  payloadJson: string;
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

// ─── DB singleton ─────────────────────────────────────────────────────────────

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = (async () => {
    const db = await SQLite.openDatabase({
      name: DB_NAME,
      location: 'default',
    });

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS sensor_records (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL DEFAULT '',
        description   TEXT NOT NULL DEFAULT '',
        recordedAt    INTEGER NOT NULL,
        latitude      REAL,
        longitude     REAL,
        accuracy_m    REAL,
        ch4           REAL NOT NULL DEFAULT 0,
        nh3           REAL NOT NULL DEFAULT 0,
        hcho          REAL NOT NULL DEFAULT 0,
        voc           REAL NOT NULL DEFAULT 0,
        odour         REAL NOT NULL DEFAULT 0,
        h2s           REAL NOT NULL DEFAULT 0,
        etoh          REAL NOT NULL DEFAULT 0,
        no2           REAL NOT NULL DEFAULT 0,
        delta_ch4     REAL,
        delta_nh3     REAL,
        delta_hcho    REAL,
        delta_voc     REAL,
        delta_odour   REAL,
        delta_h2s     REAL,
        delta_etoh    REAL,
        delta_no2     REAL,
        sync_status   TEXT NOT NULL DEFAULT 'pending',
        synced_at     INTEGER
      );
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS captures (
        id                  TEXT PRIMARY KEY,
        sensor_record_id    TEXT REFERENCES sensor_records(id),
        type                TEXT NOT NULL,
        local_path          TEXT,
        bundle_blob_name    TEXT,
        image_blob_name     TEXT,
        image_container     TEXT,
        status              TEXT NOT NULL DEFAULT 'local',
        transcript_json     TEXT,
        selected_tags_json  TEXT,
        suggested_tags_json TEXT,
        description         TEXT NOT NULL DEFAULT '',
        latitude_display    TEXT,
        longitude_display   TEXT,
        latitude_raw        REAL,
        longitude_raw       REAL,
        captured_at         INTEGER NOT NULL,
        annotation_index    INTEGER,
        sync_status         TEXT NOT NULL DEFAULT 'pending'
      );
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS annotations (
        id               TEXT PRIMARY KEY,
        capture_id       TEXT REFERENCES captures(id),
        sensor_record_id TEXT REFERENCES sensor_records(id),
        strokes_json     TEXT,
        selected_tags_json TEXT,
        saved_at         INTEGER NOT NULL,
        sync_status      TEXT NOT NULL DEFAULT 'pending',
        azure_blob_name  TEXT
      );
    `);

    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN tags_json TEXT;',
      );
    } catch {}
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN photo_path TEXT;',
      );
    } catch {}
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN accuracy_m REAL;',
      );
    } catch {}

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id           TEXT PRIMARY KEY,
        entity_type  TEXT NOT NULL,
        entity_id    TEXT NOT NULL,
        operation    TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        attempts     INTEGER NOT NULL DEFAULT 0,
        last_error   TEXT
      );
    `);

    return db;
  })();

  return dbPromise;
}

// ─── sensor_records ───────────────────────────────────────────────────────────

export async function insertSensorRecord(
  row: Omit<SensorRecord, 'syncStatus' | 'syncedAt'>,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    `INSERT OR REPLACE INTO sensor_records (
      id, title, description, photo_path, recordedAt, latitude, longitude, accuracy_m,
      ch4, nh3, hcho, voc, odour, h2s, etoh, no2,
      delta_ch4, delta_nh3, delta_hcho, delta_voc,
      delta_odour, delta_h2s, delta_etoh, delta_no2,
      sync_status, synced_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',NULL);`,
    [
      row.id,
      row.title,
      row.description,
      row.photoPath ?? null,
      row.recordedAt,
      row.latitude ?? null,
      row.longitude ?? null,
      row.accuracyM ?? null,
      row.ch4,
      row.nh3,
      row.hcho,
      row.voc,
      row.odour,
      row.h2s,
      row.etoh,
      row.no2,
      row.deltaCh4 ?? null,
      row.deltaNh3 ?? null,
      row.deltaHcho ?? null,
      row.deltaVoc ?? null,
      row.deltaOdour ?? null,
      row.deltaH2s ?? null,
      row.deltaEtoh ?? null,
      row.deltaNo2 ?? null,
    ],
  );
}

export async function listSensorRecords(limit = 100): Promise<SensorRecord[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM sensor_records ORDER BY recordedAt DESC LIMIT ?;',
    [limit],
  );
  const rows: SensorRecord[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    rows.push(mapSensorRecord(r));
  }
  return rows;
}

export async function listSensorRecordsByWalkId(
  walkId: string,
): Promise<SensorRecord[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM sensor_records WHERE title = ? ORDER BY recordedAt ASC;',
    [walkId],
  );
  const rows: SensorRecord[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapSensorRecord(res.rows.item(i)));
  }
  return rows;
}

export async function getSensorRecord(
  id: string,
): Promise<SensorRecord | null> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM sensor_records WHERE id = ? LIMIT 1;',
    [id],
  );
  if (res.rows.length === 0) {
    return null;
  }
  return mapSensorRecord(res.rows.item(0));
}

export async function deleteSensorRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.executeSql(
    `DELETE FROM sensor_records WHERE id IN (${placeholders});`,
    ids,
  );
  await db.executeSql(
    `DELETE FROM captures WHERE sensor_record_id IN (${placeholders});`,
    ids,
  );
}

export async function updateSensorRecordDescription(
  id: string,
  description: string,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    'UPDATE sensor_records SET description = ?, sync_status = ? WHERE id = ?;',
    [description, 'pending', id],
  );
}

export async function updateSensorRecord(
  id: string,
  title: string,
  description: string,
  tagsJson: string | null,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    'UPDATE sensor_records SET title = ?, description = ?, tags_json = ?, sync_status = ? WHERE id = ?;',
    [title, description, tagsJson, 'pending', id],
  );
}

function mapSensorRecord(r: any): SensorRecord {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    tagsJson: r.tags_json ?? null,
    photoPath: r.photo_path ?? null,
    recordedAt: r.recordedAt,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    accuracyM: r.accuracy_m ?? null,
    ch4: r.ch4,
    nh3: r.nh3,
    hcho: r.hcho,
    voc: r.voc,
    odour: r.odour,
    h2s: r.h2s,
    etoh: r.etoh,
    no2: r.no2,
    deltaCh4: r.delta_ch4 ?? null,
    deltaNh3: r.delta_nh3 ?? null,
    deltaHcho: r.delta_hcho ?? null,
    deltaVoc: r.delta_voc ?? null,
    deltaOdour: r.delta_odour ?? null,
    deltaH2s: r.delta_h2s ?? null,
    deltaEtoh: r.delta_etoh ?? null,
    deltaNo2: r.delta_no2 ?? null,
    syncStatus: r.sync_status,
    syncedAt: r.synced_at ?? null,
  };
}

// ─── captures ─────────────────────────────────────────────────────────────────

export async function insertCapture(
  row: Omit<CaptureRow, 'syncStatus'>,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    `INSERT OR REPLACE INTO captures (
      id, sensor_record_id, type, local_path, bundle_blob_name,
      image_blob_name, image_container, status,
      transcript_json, selected_tags_json, suggested_tags_json, description,
      latitude_display, longitude_display, latitude_raw, longitude_raw,
      captured_at, annotation_index, sync_status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending');`,
    [
      row.id,
      row.sensorRecordId ?? null,
      row.type,
      row.localPath ?? null,
      row.bundleBlobName ?? null,
      row.imageBlobName ?? null,
      row.imageContainer ?? null,
      row.status,
      row.transcriptJson ?? null,
      row.selectedTagsJson ?? null,
      row.suggestedTagsJson ?? null,
      row.description,
      row.latitudeDisplay ?? null,
      row.longitudeDisplay ?? null,
      row.latitudeRaw ?? null,
      row.longitudeRaw ?? null,
      row.capturedAt,
      row.annotationIndex ?? null,
    ],
  );
}

export async function updateCaptureStatus(
  id: string,
  status: CaptureRow['status'],
): Promise<void> {
  const db = await getDb();
  await db.executeSql('UPDATE captures SET status = ? WHERE id = ?;', [
    status,
    id,
  ]);
}

export async function updateCaptureTranscript(
  id: string,
  transcriptJson: string,
): Promise<void> {
  const db = await getDb();
  await db.executeSql('UPDATE captures SET transcript_json = ? WHERE id = ?;', [
    transcriptJson,
    id,
  ]);
}

export async function updateCaptureTags(
  id: string,
  selected: string[],
  suggested: string[],
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    'UPDATE captures SET selected_tags_json = ?, suggested_tags_json = ? WHERE id = ?;',
    [JSON.stringify(selected), JSON.stringify(suggested), id],
  );
}

export async function updateCaptureDescription(
  id: string,
  description: string,
): Promise<void> {
  const db = await getDb();
  await db.executeSql('UPDATE captures SET description = ? WHERE id = ?;', [
    description,
    id,
  ]);
}

export async function getCapture(id: string): Promise<CaptureRow | null> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM captures WHERE id = ? LIMIT 1;',
    [id],
  );
  if (res.rows.length === 0) {
    return null;
  }
  return mapCapture(res.rows.item(0));
}

export async function listCaptures(limit = 200): Promise<CaptureRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM captures ORDER BY captured_at DESC LIMIT ?;',
    [limit],
  );
  const rows: CaptureRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapCapture(res.rows.item(i)));
  }
  return rows;
}

export async function listCapturesForSensorRecord(
  sensorRecordId: string,
): Promise<CaptureRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM captures WHERE sensor_record_id = ? ORDER BY captured_at DESC;',
    [sensorRecordId],
  );
  const rows: CaptureRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapCapture(res.rows.item(i)));
  }
  return rows;
}

export async function countCaptures(): Promise<number> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT COUNT(*) as cnt FROM captures;',
    [],
  );
  return res.rows.item(0).cnt as number;
}

function mapCapture(r: any): CaptureRow {
  return {
    id: r.id,
    sensorRecordId: r.sensor_record_id ?? null,
    type: r.type,
    localPath: r.local_path ?? null,
    bundleBlobName: r.bundle_blob_name ?? null,
    imageBlobName: r.image_blob_name ?? null,
    imageContainer: r.image_container ?? null,
    status: r.status,
    transcriptJson: r.transcript_json ?? null,
    selectedTagsJson: r.selected_tags_json ?? null,
    suggestedTagsJson: r.suggested_tags_json ?? null,
    description: r.description ?? '',
    latitudeDisplay: r.latitude_display ?? null,
    longitudeDisplay: r.longitude_display ?? null,
    latitudeRaw: r.latitude_raw ?? null,
    longitudeRaw: r.longitude_raw ?? null,
    capturedAt: r.captured_at,
    annotationIndex: r.annotation_index ?? null,
    syncStatus: r.sync_status,
  };
}

// ─── annotations ─────────────────────────────────────────────────────────────

export async function upsertAnnotation(
  row: Omit<AnnotationRow, 'syncStatus'>,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    `INSERT OR REPLACE INTO annotations (
      id, capture_id, sensor_record_id, strokes_json,
      selected_tags_json, saved_at, sync_status, azure_blob_name
    ) VALUES (?,?,?,?,?,?,'pending',?);`,
    [
      row.id,
      row.captureId ?? null,
      row.sensorRecordId ?? null,
      row.strokesJson ?? null,
      row.selectedTagsJson ?? null,
      row.savedAt,
      row.azureBlobName ?? null,
    ],
  );
}

export async function getAnnotation(id: string): Promise<AnnotationRow | null> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM annotations WHERE id = ? LIMIT 1;',
    [id],
  );
  if (res.rows.length === 0) {
    return null;
  }
  return mapAnnotation(res.rows.item(0));
}

export async function listAnnotationsForSensorRecord(
  sensorRecordId: string,
): Promise<AnnotationRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM annotations WHERE sensor_record_id = ? ORDER BY saved_at DESC;',
    [sensorRecordId],
  );
  const rows: AnnotationRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapAnnotation(res.rows.item(i)));
  }
  return rows;
}

function mapAnnotation(r: any): AnnotationRow {
  return {
    id: r.id,
    captureId: r.capture_id ?? null,
    sensorRecordId: r.sensor_record_id ?? null,
    strokesJson: r.strokes_json ?? null,
    selectedTagsJson: r.selected_tags_json ?? null,
    savedAt: r.saved_at,
    syncStatus: r.sync_status,
    azureBlobName: r.azure_blob_name ?? null,
  };
}

// ─── sync_queue ───────────────────────────────────────────────────────────────

export async function enqueueSync(
  row: Omit<SyncQueueRow, 'attempts' | 'lastError'>,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    `INSERT OR REPLACE INTO sync_queue (id, entity_type, entity_id, operation, payload_json, created_at, attempts, last_error)
     VALUES (?,?,?,?,?,?,0,NULL);`,
    [
      row.id,
      row.entityType,
      row.entityId,
      row.operation,
      row.payloadJson,
      row.createdAt,
    ],
  );
}

export async function dequeueSyncBatch(limit = 10): Promise<SyncQueueRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM sync_queue WHERE attempts < 5 ORDER BY created_at ASC LIMIT ?;',
    [limit],
  );
  const rows: SyncQueueRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    rows.push({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      operation: r.operation,
      payloadJson: r.payload_json,
      createdAt: r.created_at,
      attempts: r.attempts,
      lastError: r.last_error ?? null,
    });
  }
  return rows;
}

export async function markSyncSuccess(id: string): Promise<void> {
  const db = await getDb();
  await db.executeSql('DELETE FROM sync_queue WHERE id = ?;', [id]);
}

export async function markSyncFailure(
  id: string,
  error: string,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?;',
    [error, id],
  );
}

export async function listPendingAudioCaptures(): Promise<CaptureRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    "SELECT * FROM captures WHERE type = 'audio' AND status = 'uploaded' ORDER BY captured_at ASC LIMIT 20;",
    [],
  );
  const rows: CaptureRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapCapture(res.rows.item(i)));
  }
  return rows;
}

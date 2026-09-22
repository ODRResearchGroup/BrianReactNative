import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

const DB_NAME = 'smellwalk.db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SensorRecord = {
  id: string;
  title: string;
  description: string;
  walkId?: string | null;
  recordType?: 'walk_sample' | 'fingerprint';
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
  co: number | null;
  smoke: number | null;
  h2: number | null;
  temperature: number | null;
  pressure: number | null;
  humidity: number | null;
  altitude: number | null;
  bme680GasResistance: number | null;
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
  walkId?: string | null;
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
  walkId?: string | null;
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

export type WalkRow = {
  id: string;
  deviceId: string;
  deviceName: string | null;
  startedAt: number;
  endedAt: number | null;
  status: 'active' | 'completed' | 'interrupted';
  appVersion: string | null;
  notes: string | null;
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
    await db.executeSql('PRAGMA journal_mode = WAL;');

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS sensor_records (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL DEFAULT '',
        description   TEXT NOT NULL DEFAULT '',
        walk_id       TEXT,
        record_type   TEXT NOT NULL DEFAULT 'fingerprint',
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
        co            REAL,
        smoke         REAL,
        h2            REAL,
        temperature   REAL,
        pressure      REAL,
        humidity      REAL,
        altitude      REAL,
        bme680_gas_resistance REAL,
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
      CREATE TABLE IF NOT EXISTS walks (
        id          TEXT PRIMARY KEY,
        device_id   TEXT NOT NULL DEFAULT 'unknown',
        device_name TEXT,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER,
        status      TEXT NOT NULL DEFAULT 'active',
        app_version TEXT,
        notes       TEXT
      );
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS captures (
        id                  TEXT PRIMARY KEY,
        sensor_record_id    TEXT REFERENCES sensor_records(id),
        walk_id             TEXT REFERENCES walks(id),
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
        walk_id          TEXT REFERENCES walks(id),
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
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN walk_id TEXT;',
      );
    } catch {}
    try {
      await db.executeSql(
        "ALTER TABLE sensor_records ADD COLUMN record_type TEXT NOT NULL DEFAULT 'fingerprint';",
      );
    } catch {}
    try {
      await db.executeSql('ALTER TABLE captures ADD COLUMN walk_id TEXT;');
    } catch {}
    try {
      await db.executeSql('ALTER TABLE annotations ADD COLUMN walk_id TEXT;');
    } catch {}
    try {
      await db.executeSql('ALTER TABLE sensor_records ADD COLUMN co REAL;');
    } catch {}
    try {
      await db.executeSql('ALTER TABLE sensor_records ADD COLUMN smoke REAL;');
    } catch {}
    try {
      await db.executeSql('ALTER TABLE sensor_records ADD COLUMN h2 REAL;');
    } catch {}
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN temperature REAL;',
      );
    } catch {}
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN pressure REAL;',
      );
    } catch {}
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN humidity REAL;',
      );
    } catch {}
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN altitude REAL;',
      );
    } catch {}
    try {
      await db.executeSql(
        'ALTER TABLE sensor_records ADD COLUMN bme680_gas_resistance REAL;',
      );
    } catch {}
    await db.executeSql(`
      UPDATE sensor_records
      SET walk_id = title
      WHERE walk_id IS NULL
        AND title LIKE 'walk-%';
    `);
    await db.executeSql(`
      UPDATE sensor_records
      SET record_type = CASE
        WHEN walk_id IS NOT NULL OR title LIKE 'walk-%' THEN 'walk_sample'
        ELSE 'fingerprint'
      END
      WHERE record_type IS NULL OR record_type NOT IN ('walk_sample', 'fingerprint');
    `);
    await db.executeSql(`
      INSERT OR IGNORE INTO walks (id, device_id, device_name, started_at, ended_at, status)
      SELECT
        walk_id,
        COALESCE(NULLIF(MIN(description), ''), 'unknown'),
        COALESCE(NULLIF(MIN(description), ''), 'unknown'),
        MIN(recordedAt),
        MAX(recordedAt),
        'completed'
      FROM sensor_records
      WHERE walk_id IS NOT NULL
      GROUP BY walk_id;
    `);
    await db.executeSql(`
      UPDATE captures
      SET walk_id = (
        SELECT walk_id
        FROM sensor_records
        WHERE sensor_records.id = captures.sensor_record_id
      )
      WHERE walk_id IS NULL
        AND sensor_record_id IS NOT NULL;
    `);
    await db.executeSql(`
      UPDATE annotations
      SET walk_id = COALESCE(
        (
          SELECT walk_id
          FROM sensor_records
          WHERE sensor_records.id = annotations.sensor_record_id
        ),
        (
          SELECT walk_id
          FROM captures
          WHERE captures.id = annotations.capture_id
        )
      )
      WHERE walk_id IS NULL;
    `);

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
    await db.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_walks_status ON walks(status);',
    );
    await db.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_sensor_records_walk_id ON sensor_records(walk_id, recordedAt);',
    );
    await db.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_sensor_records_record_type ON sensor_records(record_type, recordedAt);',
    );
    await db.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_captures_walk_id ON captures(walk_id, captured_at);',
    );
    await db.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_annotations_walk_id ON annotations(walk_id, saved_at);',
    );

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
      id, title, description, walk_id, record_type, photo_path, recordedAt, latitude, longitude, accuracy_m,
      ch4, nh3, hcho, voc, odour, h2s, etoh, no2, co, smoke, h2, temperature, pressure, humidity, altitude, bme680_gas_resistance,
      delta_ch4, delta_nh3, delta_hcho, delta_voc,
      delta_odour, delta_h2s, delta_etoh, delta_no2,
      sync_status, synced_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',NULL);`,
    [
      row.id,
      row.title,
      row.description,
      row.walkId ?? null,
      row.recordType ?? 'fingerprint',
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
      row.co ?? null,
      row.smoke ?? null,
      row.h2 ?? null,
      row.temperature ?? null,
      row.pressure ?? null,
      row.humidity ?? null,
      row.altitude ?? null,
      row.bme680GasResistance ?? null,
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
    "SELECT * FROM sensor_records WHERE record_type = 'fingerprint' ORDER BY recordedAt DESC LIMIT ?;",
    [limit],
  );
  const rows: SensorRecord[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    rows.push(mapSensorRecord(r));
  }
  return rows;
}

export async function listAllSensorRecords(
  limit = 100,
): Promise<SensorRecord[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM sensor_records ORDER BY recordedAt DESC LIMIT ?;',
    [limit],
  );
  const rows: SensorRecord[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapSensorRecord(res.rows.item(i)));
  }
  return rows;
}

export async function listSensorRecordsByWalkId(
  walkId: string,
): Promise<SensorRecord[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    `SELECT * FROM sensor_records
     WHERE (walk_id = ? OR (walk_id IS NULL AND title = ?))
       AND record_type = 'walk_sample'
     ORDER BY recordedAt ASC;`,
    [walkId, walkId],
  );
  const rows: SensorRecord[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapSensorRecord(res.rows.item(i)));
  }
  return rows;
}

export async function listFingerprintsByWalkId(
  walkId: string,
): Promise<SensorRecord[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    "SELECT * FROM sensor_records WHERE walk_id = ? AND record_type = 'fingerprint' ORDER BY recordedAt ASC;",
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
    walkId: r.walk_id ?? null,
    recordType: r.record_type === 'walk_sample' ? 'walk_sample' : 'fingerprint',
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
    co: r.co ?? null,
    smoke: r.smoke ?? null,
    h2: r.h2 ?? null,
    temperature: r.temperature ?? null,
    pressure: r.pressure ?? null,
    humidity: r.humidity ?? null,
    altitude: r.altitude ?? null,
    bme680GasResistance: r.bme680_gas_resistance ?? null,
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
      id, sensor_record_id, walk_id, type, local_path, bundle_blob_name,
      image_blob_name, image_container, status,
      transcript_json, selected_tags_json, suggested_tags_json, description,
      latitude_display, longitude_display, latitude_raw, longitude_raw,
      captured_at, annotation_index, sync_status
    ) VALUES (?,?,COALESCE(?, (SELECT walk_id FROM sensor_records WHERE id = ?)),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending');`,
    [
      row.id,
      row.sensorRecordId ?? null,
      row.walkId ?? null,
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

export async function listCapturesByWalkId(
  walkId: string,
): Promise<CaptureRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM captures WHERE walk_id = ? ORDER BY captured_at ASC;',
    [walkId],
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
    walkId: r.walk_id ?? null,
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
      id, capture_id, sensor_record_id, walk_id, strokes_json,
      selected_tags_json, saved_at, sync_status, azure_blob_name
    ) VALUES (
      ?, ?, ?,
      COALESCE(
        ?,
        (SELECT walk_id FROM sensor_records WHERE id = ?),
        (SELECT walk_id FROM captures WHERE id = ?)
      ),
      ?, ?, 'pending', ?
    );`,
    [
      row.id,
      row.captureId ?? null,
      row.sensorRecordId ?? null,
      row.walkId ?? null,
      row.sensorRecordId ?? null,
      row.captureId ?? null,
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

export async function listAnnotationsByWalkId(
  walkId: string,
): Promise<AnnotationRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    'SELECT * FROM annotations WHERE walk_id = ? ORDER BY saved_at ASC;',
    [walkId],
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
    walkId: r.walk_id ?? null,
    strokesJson: r.strokes_json ?? null,
    selectedTagsJson: r.selected_tags_json ?? null,
    savedAt: r.saved_at,
    syncStatus: r.sync_status,
    azureBlobName: r.azure_blob_name ?? null,
  };
}

// ─── walks ──────────────────────────────────────────────────────────────────────

export async function upsertWalk(row: WalkRow): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    `INSERT OR REPLACE INTO walks (
      id, device_id, device_name, started_at, ended_at, status, app_version, notes
    ) VALUES (?,?,?,?,?,?,?,?);`,
    [
      row.id,
      row.deviceId,
      row.deviceName ?? null,
      row.startedAt,
      row.endedAt ?? null,
      row.status,
      row.appVersion ?? null,
      row.notes ?? null,
    ],
  );
}

export async function completeWalk(id: string, endedAt: number): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    "UPDATE walks SET ended_at = ?, status = 'completed' WHERE id = ?;",
    [endedAt, id],
  );
}

export async function updateWalkDevice(
  id: string,
  deviceId: string,
  deviceName: string | null,
): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    'UPDATE walks SET device_id = ?, device_name = COALESCE(?, device_name) WHERE id = ?;',
    [deviceId, deviceName, id],
  );
}

export async function reactivateWalk(id: string): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    "UPDATE walks SET ended_at = NULL, status = 'active' WHERE id = ?;",
    [id],
  );
}

export async function interruptActiveWalks(endedAt: number): Promise<void> {
  const db = await getDb();
  await db.executeSql(
    "UPDATE walks SET ended_at = COALESCE(ended_at, ?), status = 'interrupted' WHERE status = 'active';",
    [endedAt],
  );
}

export async function listInterruptedWalks(): Promise<WalkRow[]> {
  const db = await getDb();
  const [res] = await db.executeSql(
    "SELECT * FROM walks WHERE status = 'interrupted' ORDER BY started_at DESC;",
  );
  const rows: WalkRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(mapWalk(res.rows.item(i)));
  }
  return rows;
}

function mapWalk(r: any): WalkRow {
  return {
    id: r.id,
    deviceId: r.device_id ?? 'unknown',
    deviceName: r.device_name ?? null,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? null,
    status:
      r.status === 'active' || r.status === 'interrupted'
        ? r.status
        : 'completed',
    appVersion: r.app_version ?? null,
    notes: r.notes ?? null,
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

# CLAUDE.md — BrianReactNative

Guidance for Claude Code when working in this repository.

## What this repo is

The mobile app for **BRIAN**, an electronic nose (e-nose) built by the ODR research group at Malmö University. The app connects to a BRIAN device over Bluetooth Low Energy (BLE), shows live sensor data, and records **smell walks**: GPS-tagged sensor data plus "fingerprints" (a sensor snapshot with a title, description, photo, audio note and olfactory tags).

Related repos:

- **BrianHardware** (https://github.com/ODRResearchGroup/BrianHardware) — ESP32 firmware; defines the BLE contract below
- **BrianWeb** (https://github.com/ODRResearchGroup/BrianWeb) — Web Bluetooth dashboard

All app/software issues are tracked here; hardware and firmware issues go in BrianHardware.

## Platforms

**Android is used in the field, but iOS compatibility must be kept in every change.** Guard platform-specific code with `Platform.OS`, add iOS equivalents (Info.plist keys, background modes, permission strings) when adding Android permissions or native behaviour, and say in the PR what could not be tested on iOS.

## Commands

```bash
npm start                  # Metro
npm run android            # debug build (needs Metro)
npm run android:release    # standalone release build, no Metro needed
npm run ios                # after: bundle install && bundle exec pod install (in ios/)
npm run lint               # ESLint (@react-native config)
npm run typecheck          # tsc --noEmit
npm run format:check       # Prettier 2.8.8 (npm run format to fix)
npm test                   # Jest (only __tests__/App.test.tsx so far)
```

Before opening a PR, run **lint, typecheck and format:check** (these are what CI runs in `.github/workflows/quality.yml`) and `npm test`. Add Jest tests for new pure logic (parsers, aggregators, line protocol, migrations). BLE, GPS and camera behaviour must be tested on a real phone by a person; list what to test in the PR.

## Stack

React Native 0.79.2 (New Architecture), React 19, TypeScript 5.0, React Navigation 7 (bottom tabs + native stack), Reanimated 4 + worklets, `react-native-ble-plx`, `react-native-geolocation-service`, `react-native-sqlite-storage`, `@react-native-async-storage/async-storage`, `react-native-vision-camera`, `react-native-audio-recorder-player`, MapLibre, Skia, Victory, `mitt` for events, `react-native-config` for env vars.

Code style: Prettier with single quotes, trailing commas, `arrowParens: 'avoid'`, `bracketSameLine: true`. Functional components with hooks.

## Architecture

```
src/
  App.tsx                     providers + navigation (tabs and stack; RootStackParamList)
  BLEUniversal.tsx            BLEProvider: scan, connect, subscribe, float32 decode; exports eventEmitter
  config.ts                   Influx config from react-native-config
  influxdb.ts                 InfluxDBClient + line-protocol builder (posts to /api/v3/write_lp)
  types/events.ts             event types; ALSO exports a second mitt instance `emitter` (see gotchas)
  types/fingerprintTypes.ts   SensorReadings, SavedFingerprintData (AsyncStorage format)
  hooks/                      useLiveLocation, usePressAnimation
  components/
    BLE/BLEScreen             device list, connect, enables notifications
    LiveData/                 live radar + mini plots; 15 s averaged fingerprint (saves to AsyncStorage)
    SmellWalk/                start/stop walk, live map, fingerprint button
    common/FingerprintModal   fingerprint form: title, description, photo, audio; saves to SQLite + sync queue
    ...                       annotation, photo, history, map, analysis screens
  services/
    influx/InfluxDBService    InfluxDBProvider: GPS watch, walk state, 5 s walk flush to SQLite
    database/db.ts            SQLite (smellwalk.db): sensor_records, captures, annotations, sync_queue
    sync/syncWorker.ts        uploads queued items to Azure Functions
    sync/exportService.ts     zip export and per-walk CSV export
    audio/, photos/, annotations/   Azure upload/transcription/descriptor services
    updates/appUpdater.ts     Android-only self-update from GitHub Releases
```

Data flow: BLE notification → `BLEUniversal` decodes float32 → updates `characteristicValues[label]` and emits `ble_data_updated` on `eventEmitter` → `InfluxDBService` maps it to a `sensor_reading` event → during a walk, readings are merged and flushed every 5 s to SQLite.

## BLE contract (defined by BrianHardware firmware)

Don't change these without a coordinated firmware change.

- Device name `Brian-XXXXXX` (unique per device). On Android, `device.id` is the MAC address; prefer the name as a human-readable device ID.
- Every value is a **4-byte little-endian float32**. Gas channels are **volts** (not ppm, despite some `units: 'ppm'` labels in the code).
- The firmware only creates characteristics for sensor boards it detects, so **subscribe only to characteristics that exist after discovery**, and don't let one missing characteristic break the rest.
- Firmware notifies each channel in turn, then waits 5 s; values arrive one at a time and must be **combined into snapshots** in the app.
- ESS service `0000181a-0000-1000-8000-00805f9b34fb`; custom service `de664a17-7db4-449f-97ba-5514e19a9d94`.

| Channel               | Characteristic                         | Unit                                             |
| --------------------- | -------------------------------------- | ------------------------------------------------ |
| CH₄                   | `00002bd1-…` (ESS)                     | V                                                |
| VOC                   | `00002bd3-…` (ESS)                     | V                                                |
| NH₃                   | `00002bcf-…` (ESS)                     | V                                                |
| NO₂                   | `00002bd2-…` (ESS)                     | V                                                |
| HCHO                  | `6a135b89-f360-4f64-86fc-5a14092034b4` | V                                                |
| Odor                  | `4c28fcb8-d69b-404a-8668-41655d814e7f` | V                                                |
| EtOH                  | `f8156843-6d98-4ba2-8014-1cf03d7dedb8` | V                                                |
| H₂S                   | `87dc71bd-29a4-4218-a2a7-83fd2a69cc40` | V                                                |
| CO                    | `88f6fa6c-c4e0-4a3d-ba72-f435641251c4` | V                                                |
| Smoke                 | `cafb955e-6e7b-424b-9e03-6d8d003aa286` | V                                                |
| H₂                    | `0176655b-0007-4e02-abc1-e9f2d6815f46` | V                                                |
| Temperature           | `00002a6e-…` (ESS)                     | °C                                               |
| Pressure              | `00002a6d-…` (ESS)                     | hPa                                              |
| Humidity              | `00002a6f-…` (ESS)                     | %                                                |
| Altitude              | `00002a69-…` (ESS)                     | m                                                |
| BME680 gas resistance | `5b0e3c0b-1a44-4b76-82ee-8c2adc2dd8e9` | Ω                                                |
| Time sync (write)     | `a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d` | Unix seconds, 8 bytes LE, encrypted link         |
| Board status          | `407fd299-d6ed-45ed-ab21-437f101c8acd` | 1-byte bitmask, read-only, captured once at boot |

(16-bit UUIDs expand to `0000XXXX-0000-1000-8000-00805f9b34fb`.)

**Board status** (`sensors.ts` → `BOARD_STATUS_CHARACTERISTIC_UUID`/`BOARD_STATUS_DEFINITIONS`): bit _n_ set = that I2C board was detected at boot (bit 0/1/2 = ADS1/ADS2/ADS3, bit 3 = BME680). Not live — the firmware never re-checks after boot, so this won't catch a board failing mid-walk. Read once via `readBoardStatus()` right after connecting (see `BLEScreen.tsx`); it is not a `SENSOR_DEFINITIONS` entry since it isn't a notified sensor value. Battery monitor status is not implemented (separate issue).

## Known problems and gotchas

- **Only 8 of the 11 gas channels and none of the environmental channels are used** (#26). The 8-sensor list is hard-coded in `BLEScreen.tsx`, `InfluxDBService.tsx`, `fingerprintTypes.ts`, `LiveData.tsx`, `SmellWalkScreen.tsx`, `FingerprintModal.tsx`, `db.ts`, `exportService.ts` and `sensorRecordUpload.ts`. Prefer a single sensor registry over adding to each list.
- Live values are looked up by **display label**, including the misspelling `'Voletile Organic Compounds'`. Don't "fix" the spelling in one place only.
- **Influx writes were removed** in commit 32d4e58; `InfluxDBClient` is unused (#27).
- **Missing readings are stored as `0`** (`valueFor()` in `InfluxDBService`). Missing must be `null`/omitted.
- **Two event emitters:** `eventEmitter` (BLEUniversal) and `emitter` (types/events). Fingerprints emitted on `emitter` are never heard by `InfluxDBService`.
- Walk rows reuse `sensor_records.title` for the walk ID and `description` for the device ID (#28).
- Fingerprint capture timing is inconsistent between Live Data and Smell Walk; time and location are taken at save time (#29).
- `react-native-keep-awake` is installed but unused; nothing keeps recording alive in the background (#24).
- SQLite migrations are done with `ALTER TABLE … ADD COLUMN` in `try/catch` inside `getDb()`. Keep migrations additive and safe to run repeatedly; never drop user data.
- `__DEV__` shortcuts exist (treat as connected, fake readings). Don't let them leak into release behaviour.
- Windows: keep the project in a short path (e.g. `C:/ODR/BrianReactNative`); long paths break the New Architecture build.

## Configuration and secrets

`react-native-config` reads `.env` (never commit it; `.env.example` is the template).

- Influx: `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_DATABASE` (a fingerprint database variable is planned, see #25/#27).
- Azure Functions (annotations, audio transcription, photos, sensor record upload): `AZURE_FUNCTION_BASE_URL`, `AZURE_FUNCTION_KEY`, `AZURE_UPLOADS_PREPARE_KEY`, `AZURE_UPLOAD_COMPLETE_KEY`, `AZURE_PROCESSED_STATUS_KEY`, `AZURE_PROCESSED_TRANSCRIPT_KEY`, `AZURE_SAVE_ANNOTATION_KEY`, `AZURE_SAVE_SENSOR_RECORD_KEY`, `AZURE_SUGGEST_DESCRIPTORS_KEY`, `AZURE_GET_PHOTO_URL_KEY`, `AZURE_PHOTO_UPLOAD_COMPLETE_KEY`, `AZURE_STT_LOCALE`. These are **not yet in `.env.example`** (see #16).
- Values in `.env` are bundled into the APK and can be extracted: only use write-scoped tokens, and never log them.
- When adding a variable: update `.env.example`, `src/config.ts` (if used there), and the `.env` step in `.github/workflows/release.yml` plus the matching GitHub Actions secret.

## Releases

Merging to `main` runs `.github/workflows/release.yml`: builds a signed Android APK (versionCode = run number), publishes it with `version.json` to GitHub Releases, and the app's updater (`appUpdater.ts`) offers the update on launch. Don't change the keystore handling or version scheme without discussion. Work normally goes through feature branches and PRs.

## Data backends

- **InfluxDB** (hosted free tier for now, self-hosted later; keep the URL configurable): one combined point every 5 s during walks (GPS + all sensor channels) in the timeseries database; one point per fingerprint (GPS + readings + annotation text + media IDs) in a fingerprints database.
- **SQLite on the phone** is the local source of truth; remote uploads should be queued and retried, never the only copy.
- **Azure Functions/Blob storage** for annotations, audio and photos (via `sync_queue` and `syncWorker`).

## Other agent files

`.github/agents/` contains docs, lint and test agent descriptions, and `.claude/settings.json` holds local permission allowances; follow them where relevant.

## Current priorities (September 2026)

An outdoor smell walk with several e-noses is planned for **25 Sept 2026** on Android phones. The checklist is **#30**. App blockers: #25 (Influx setup, done by a person), #26 (all sensors), #27 (Influx writes + 5 s snapshots), #24 (keep recording; step 1 keep-awake is enough for the walk). Then #28 (continuous local storage). Lower priority: #29, #16. Issues labelled `claude-code` are scoped for an agent to attempt; #26 and #27 touch the same files and are best done together.

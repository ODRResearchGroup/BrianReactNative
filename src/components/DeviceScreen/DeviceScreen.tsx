import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import KeepAwake from 'react-native-keep-awake';
import {
  NavigationProp,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleCheck,
  PowerOff,
  RefreshCw,
} from 'lucide-react-native';
import { BatteryIndicator, BatteryLifetime } from '../common/BatteryStatus';
import { useBLE } from '../../BLEUniversal';
import {
  BATTERY_CHARACTERISTIC_DEFINITIONS,
  BOARD_STATUS_DEFINITIONS,
  CUSTOM_SERVICE_UUID,
  GAS_FRAME_CHARACTERISTIC_UUID,
  ENV_FRAME_CHARACTERISTIC_UUID,
  isBoardStatusBitSet,
} from '../../sensors';

import { COLORS } from '../SmellWalk/consts';
import SignalBars from './SignalBars';
import Dot from '../SmellWalk/components/icons/Dot';

const NEXT_SCREEN = 'Smell Walk';

const MIN_SCAN_FEEDBACK_MS = 4000;

const BLUETOOTH_BASE_UUID = '-0000-1000-8000-00805f9b34fb';

function normalizeUuid(uuid: string): string {
  const value = uuid.toLowerCase().replace(/^0x/, '');
  if (/^[0-9a-f]{4}$/.test(value)) {
    return `0000${value}${BLUETOOTH_BASE_UUID}`;
  }
  if (/^[0-9a-f]{8}$/.test(value)) {
    return `${value}${BLUETOOTH_BASE_UUID}`;
  }
  return value;
}

type Phase =
  | 'idle'
  | 'connecting'
  | 'discovering'
  | 'subscribing'
  | 'reading'
  | 'disconnecting';

const PHASE_LABEL: Record<Exclude<Phase, 'idle'>, string> = {
  connecting: 'Connecting to device…',
  discovering: 'Finding sensors…',
  subscribing: 'Starting live readings…',
  reading: 'Checking hardware…',
  disconnecting: 'Disconnecting…',
};

const PHASE_STEP: Record<Exclude<Phase, 'idle'>, string> = {
  connecting: 'Step 1 of 4',
  discovering: 'Step 2 of 4',
  subscribing: 'Step 3 of 4',
  reading: 'Step 4 of 4',
  disconnecting: 'Closing the connection',
};

function signalFromRssi(rssi?: number | null): {
  bars: 0 | 1 | 2 | 3;
  label: string;
} {
  if (typeof rssi !== 'number') {
    return { bars: 0, label: 'Signal unknown' };
  }
  if (rssi >= -60) {
    return { bars: 3, label: 'Strong signal' };
  }
  if (rssi >= -75) {
    return { bars: 2, label: 'Fair signal' };
  }
  return { bars: 1, label: 'Weak signal, move closer' };
}

export default function DeviceScreen() {
  const {
    devices,
    connectedDevice,
    characteristicValues,
    boardStatus,
    scanForDevices,
    stopScan,
    connectToDevice,
    enableNotifications,
    readBoardStatus,
  } = useBLE();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [linkAlive, setLinkAlive] = useState(true);
  const [justConnectedName, setJustConnectedName] = useState<string | null>(
    null,
  );
  const scanToken = useRef(0);
  const manualDisconnect = useRef(false);

  const isBusy = phase !== 'idle';
  const isConnected = connectedDevice !== null && linkAlive;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const check = async () => {
        if (connectedDevice === null) {
          if (active) {
            setLinkAlive(true);
          }
          return;
        }
        const alive = await connectedDevice.isConnected().catch(() => false);
        if (active) {
          setLinkAlive(alive);
          if (!alive && !manualDisconnect.current) {
            setError(
              'The connection to the e-Nose was lost. Make sure it is on and nearby, then scan again.',
            );
          }
        }
      };
      check().catch(() => active && setLinkAlive(false));
      return () => {
        active = false;
      };
    }, [connectedDevice]),
  );

  const handleScan = async () => {
    if (isScanning || isBusy) {
      return;
    }
    const token = ++scanToken.current;
    const started = Date.now();
    setError(null);
    setJustConnectedName(null);
    setSelectedDeviceId(null);
    setIsScanning(true);
    try {
      await scanForDevices();
    } catch (err: any) {
      console.error('Scan error:', err);
      if (token === scanToken.current) {
        setError(
          err?.message ||
            'Could not scan. Check that Bluetooth is on and the app has permission.',
        );
      }
    }
    const remaining = MIN_SCAN_FEEDBACK_MS - (Date.now() - started);
    if (remaining > 0 && token === scanToken.current) {
      await new Promise<void>(resolve =>
        setTimeout(() => resolve(), remaining),
      );
    }

    if (token === scanToken.current) {
      setIsScanning(false);
      setHasScanned(true);
    }
  };

  const selectedDevice = useMemo(
    () => devices.find(d => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const handleConnect = async () => {
    if (!selectedDevice || isBusy) {
      return;
    }

    if (isScanning) {
      scanToken.current++;
      setIsScanning(false);
      setHasScanned(true);
      try {
        stopScan();
      } catch (scanErr) {
        console.warn('Could not stop scan:', scanErr);
      }
    }

    manualDisconnect.current = false;
    setError(null);
    setPhase('connecting');

    try {
      const connectedDeviceInstance = await connectToDevice(selectedDevice);

      setPhase('discovering');
      const discoveredSpecifications = new Map(
        [
          {
            serviceUUID: CUSTOM_SERVICE_UUID,
            characteristicUUID: GAS_FRAME_CHARACTERISTIC_UUID,
            label: 'Gas frame',
            sensorKey: 'Gas frame',
            format: 'gas-frame' as const,
            emitEvent: true,
          },
          {
            serviceUUID: CUSTOM_SERVICE_UUID,
            characteristicUUID: ENV_FRAME_CHARACTERISTIC_UUID,
            label: 'Environmental frame',
            sensorKey: 'Environmental frame',
            format: 'env-frame' as const,
            emitEvent: true,
          },
          ...BATTERY_CHARACTERISTIC_DEFINITIONS,
        ].map(definition => [
          `${normalizeUuid(definition.serviceUUID)}:${normalizeUuid(
            definition.characteristicUUID,
          )}`,
          definition,
        ]),
      );
      const notificationSpecs: {
        serviceUUID: string;
        characteristicUUID: string;
        label: string;
        sensorKey: string;
        format?: 'float32' | 'uint8' | 'gas-frame' | 'env-frame';
        emitEvent?: boolean;
      }[] = [];

      for (const service of await connectedDeviceInstance.services()) {
        for (const characteristic of await service.characteristics()) {
          const definition = discoveredSpecifications.get(
            `${normalizeUuid(service.uuid)}:${normalizeUuid(
              characteristic.uuid,
            )}`,
          );
          if (definition) {
            notificationSpecs.push({
              serviceUUID: service.uuid,
              characteristicUUID: characteristic.uuid,
              label: definition.label,
              sensorKey: definition.sensorKey,
              format: definition.format,
              emitEvent: definition.emitEvent,
            });
          }
        }
      }

      if (notificationSpecs.length === 0) {
        throw new Error(
          'This device does not look like a BRIAN e-Nose (no known sensors found). Pick another device.',
        );
      }

      setPhase('subscribing');
      await enableNotifications(connectedDeviceInstance, notificationSpecs);

      setPhase('reading');
      await readBoardStatus(connectedDeviceInstance);

      setLinkAlive(true);
      setJustConnectedName(
        selectedDevice.name || selectedDevice.localName || 'Your e-Nose',
      );
      setSelectedDeviceId(null);
    } catch (err: any) {
      console.error('Connect+notify error:', err);
      setError(
        err?.message ||
          'Could not connect. Make sure the e-Nose is on and nearby, then try again.',
      );
    } finally {
      setPhase('idle');
    }
  };

  const performDisconnect = async () => {
    if (!connectedDevice || isBusy) {
      return;
    }
    manualDisconnect.current = true;
    setError(null);
    setPhase('disconnecting');
    try {
      await connectedDevice.cancelConnection();
    } catch (err: any) {
      const stillConnected = await connectedDevice
        .isConnected()
        .catch(() => false);
      if (stillConnected) {
        console.error('Disconnect error:', err);
        manualDisconnect.current = false;
        setError(
          err?.message ||
            'Could not disconnect. Try again, or switch the e-Nose off.',
        );
        setPhase('idle');
        return;
      }
    }
    setLinkAlive(false);
    setJustConnectedName(null);
    setSelectedDeviceId(null);
    setPhase('idle');
  };

  const confirmDisconnect = () => {
    Alert.alert(
      'Disconnect e-Nose?',
      'Live readings will stop. If a smell walk is recording, it will stop receiving sensor data.',
      [
        { text: 'Stay connected', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            performDisconnect().catch(() => setPhase('idle'));
          },
        },
      ],
    );
  };

  const goToNext = () => {
    try {
      navigation.navigate(NEXT_SCREEN as never);
    } catch (e) {
      Alert.alert('Ready', 'Open the Smell Walk tab to start a walk.');
    }
  };

  const sortedDevices = useMemo(
    () =>
      [...devices].sort((a, b) => {
        if (connectedDevice?.id === a.id) {
          return -1;
        }
        if (connectedDevice?.id === b.id) {
          return 1;
        }
        return (b.rssi ?? -999) - (a.rssi ?? -999);
      }),
    [devices, connectedDevice?.id],
  );

  const boardRows = useMemo(
    () =>
      boardStatus === null || boardStatus === undefined
        ? []
        : BOARD_STATUS_DEFINITIONS.map(board => ({
            bit: board.bit,
            label: board.label,
            present: isBoardStatusBitSet(boardStatus, board.bit),
            sensors: board.sensors,
          })),
    [boardStatus],
  );
  const missingBoards = boardRows.filter(b => !b.present);

  const stepState = (i: number): 'done' | 'active' | 'todo' => {
    const current = isConnected
      ? 3
      : isBusy || selectedDevice
      ? 2
      : devices.length > 0 && !isScanning
      ? 1
      : 0;
    if (i < current) {
      return 'done';
    }
    return i === current ? 'active' : 'todo';
  };

  const guidance = (() => {
    if (error) {
      return {
        tone: 'red' as const,
        title: 'Something went wrong',
        body: error,
      };
    }
    if (phase === 'disconnecting') {
      return {
        tone: 'neutral' as const,
        title: PHASE_LABEL.disconnecting,
        body: 'Closing the connection to the e-Nose.',
      };
    }
    if (isBusy) {
      return {
        tone: 'neutral' as const,
        title: PHASE_LABEL[phase as Exclude<Phase, 'idle'>],
        body: 'Keep the e-Nose close and stay on this screen.',
      };
    }
    if (isConnected) {
      return missingBoards.length > 0
        ? {
            tone: 'amber' as const,
            title: `${justConnectedName ?? 'e-Nose'} connected, with warnings`,
            body: `${missingBoards.length} hardware ${
              missingBoards.length === 1 ? 'part is' : 'parts are'
            } missing. Some readings will be empty.`,
          }
        : {
            tone: 'green' as const,
            title: `${justConnectedName ?? 'e-Nose'} is ready`,
            body: 'All hardware detected.',
          };
    }

    if (selectedDevice) {
      return {
        tone: 'neutral' as const,
        title: 'Ready to connect',
        body: isScanning
          ? `Tap Connect to pair with ${
              selectedDevice.name || selectedDevice.localName || 'this device'
            }. This will stop the scan.`
          : `Tap Connect to pair with ${
              selectedDevice.name || selectedDevice.localName || 'this device'
            }.`,
      };
    }
    if (isScanning) {
      return {
        tone: 'neutral' as const,
        title: 'Looking for e-Noses…',
        body:
          devices.length > 0
            ? 'Tap a device below to connect, or wait for the scan to finish.'
            : 'Switch the device on and keep it within a few metres.',
      };
    }
    if (devices.length > 0) {
      return {
        tone: 'neutral' as const,
        title: 'Choose your e-Nose',
        body: 'Tap a device below. Devices with a stronger signal are closer.',
      };
    }
    return {
      tone: 'neutral' as const,
      title: hasScanned ? 'No e-Nose found' : 'Connect your e-Nose',
      body: hasScanned
        ? 'Check that it is switched on and nearby, then scan again.'
        : 'Switch it on, keep it close, then tap Scan.',
    };
  })();

  const primary = (() => {
    if (isBusy) {
      return {
        label: PHASE_LABEL[phase as Exclude<Phase, 'idle'>],
        onPress: undefined,
        disabled: true,
        loading: true,
        hint: PHASE_STEP[phase as Exclude<Phase, 'idle'>],
      };
    }
    if (isConnected) {
      return {
        label: 'Start a smell walk',
        onPress: goToNext,
        disabled: false,
        loading: false,
        arrow: true,
      };
    }

    if (selectedDevice) {
      return {
        label: `Connect to ${
          selectedDevice.name || selectedDevice.localName || 'device'
        }`,
        onPress: handleConnect,
        disabled: false,
        loading: false,
        hint: isScanning
          ? 'Stops scanning and pairs with the selected e-Nose'
          : 'Pairs with the selected e-Nose',
      };
    }
    if (isScanning) {
      return {
        label: 'Scanning…',
        onPress: undefined,
        disabled: true,
        loading: true,
        hint:
          devices.length > 0
            ? 'Tap a device in the list to connect now'
            : 'Looking for nearby devices',
      };
    }
    if (devices.length > 0) {
      return {
        label: 'Select a device',
        onPress: undefined,
        disabled: true,
        loading: false,
        hint: 'Tap a device in the list first',
      };
    }
    return {
      label: hasScanned ? 'Scan again' : 'Scan for e-Nose',
      onPress: handleScan,
      disabled: false,
      loading: false,
      hint: 'Searches for nearby devices',
    };
  })();

  const showSecondaryScan =
    !isBusy && !isScanning && !isConnected && devices.length > 0;
  const showDisconnect = isConnected && !isBusy;

  const statusPill = isConnected
    ? phase === 'disconnecting'
      ? { text: 'Disconnecting', color: COLORS.amber, bg: COLORS.amberTint }
      : { text: 'Connected', color: COLORS.green, bg: COLORS.greenTint }
    : isBusy
    ? { text: 'Connecting', color: COLORS.amber, bg: COLORS.amberTint }
    : isScanning
    ? { text: 'Scanning', color: COLORS.amber, bg: COLORS.amberTint }
    : { text: 'Not connected', color: COLORS.muted, bg: COLORS.bg };

  const toneStyles = {
    neutral: { bg: COLORS.bg, fg: COLORS.ink },
    green: { bg: COLORS.greenTint, fg: COLORS.green },
    amber: { bg: COLORS.amberTint, fg: COLORS.amber },
    red: { bg: COLORS.redTint, fg: COLORS.red },
  }[guidance.tone];

  return (
    <SafeAreaView style={styles.screen}>
      {isConnected || isBusy ? <KeepAwake /> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title} accessibilityRole="header">
            BRIAN e-Nose
          </Text>
          <View
            style={[styles.pill, { backgroundColor: statusPill.bg }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Status: ${statusPill.text}`}>
            <Dot color={statusPill.color} />
            <Text style={[styles.pillText, { color: statusPill.color }]}>
              {statusPill.text}
            </Text>
          </View>
        </View>

        <View style={styles.stepper} accessibilityRole="progressbar">
          {['Scan', 'Choose', 'Connect'].map((label, i) => {
            const s = stepState(i);
            return (
              <React.Fragment key={label}>
                {i > 0 && (
                  <View
                    style={[styles.stepLine, s !== 'todo' && styles.stepLineOn]}
                  />
                )}
                <View style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      s === 'active' && styles.stepCircleActive,
                      s === 'done' && styles.stepCircleDone,
                    ]}>
                    {s === 'done' ? (
                      <Check color="#fff" size={14} strokeWidth={3} />
                    ) : (
                      <Text
                        style={[
                          styles.stepNumber,
                          s === 'active' && styles.stepNumberActive,
                        ]}>
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      s !== 'todo' && styles.stepLabelOn,
                    ]}>
                    {label}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>

        <View
          style={[styles.guidance, { backgroundColor: toneStyles.bg }]}
          accessibilityLiveRegion="polite">
          <View style={styles.guidanceIcon}>
            {isBusy || (isScanning && !selectedDevice) ? (
              <ActivityIndicator color={COLORS.amber} />
            ) : guidance.tone === 'red' || guidance.tone === 'amber' ? (
              <AlertTriangle color={toneStyles.fg} size={22} />
            ) : guidance.tone === 'green' ? (
              <CircleCheck color={toneStyles.fg} size={22} />
            ) : null}
          </View>
          <View style={styles.guidanceText}>
            <Text style={[styles.guidanceTitle, { color: toneStyles.fg }]}>
              {guidance.title}
            </Text>
            <Text style={styles.bodyMuted}>{guidance.body}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Devices
            </Text>
            {devices.length > 0 && (
              <Text style={styles.caption}>{devices.length} found</Text>
            )}
          </View>

          <View style={styles.card}>
            {devices.length === 0 ? (
              <View style={styles.empty}>
                {isScanning ? <ActivityIndicator color={COLORS.muted} /> : null}
                <Text style={styles.bodyMuted}>
                  {isScanning
                    ? 'Searching…'
                    : hasScanned
                    ? 'Nothing nearby yet.'
                    : 'Nothing scanned yet. Tap “Scan for e-Nose” below.'}
                </Text>
              </View>
            ) : (
              sortedDevices.map((device, index) => {
                const connectedHere =
                  isConnected && connectedDevice?.id === device.id;
                const selected = selectedDeviceId === device.id;
                const name = device.name || device.localName || 'BRIAN device';
                const signal = signalFromRssi(device.rssi);
                const connectingHere =
                  isBusy &&
                  phase !== 'disconnecting' &&
                  selectedDevice?.id === device.id;
                const disabled = connectedHere || isBusy || isConnected;

                return (
                  <Pressable
                    key={device.id}
                    disabled={disabled}
                    onPress={() => {
                      setError(null);
                      setSelectedDeviceId(device.id);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected,
                      disabled,
                    }}
                    accessibilityLabel={`${name}. ${
                      connectedHere ? 'Connected' : signal.label
                    }`}
                    accessibilityHint={
                      disabled ? undefined : 'Selects this device to connect'
                    }
                    style={({ pressed }) => [
                      styles.deviceRow,
                      index > 0 && styles.rowDivider,
                      selected && styles.deviceRowSelected,
                      isConnected && !connectedHere && styles.dimmed,
                      pressed && styles.pressed,
                    ]}>
                    <View
                      style={[
                        styles.radio,
                        (selected || connectedHere) && styles.radioOn,
                      ]}>
                      {(selected || connectedHere) && (
                        <View style={styles.radioDot} />
                      )}
                    </View>

                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>{name}</Text>
                      {connectedHere ? (
                        <>
                          <Text style={[styles.caption, styles.textGreen]}>
                            Connected
                          </Text>
                          <BatteryLifetime
                            runtimeHours={
                              characteristicValues['Battery Runtime']
                            }
                          />
                        </>
                      ) : connectingHere ? (
                        <Text style={styles.caption}>
                          {PHASE_LABEL[phase as Exclude<Phase, 'idle'>]}
                        </Text>
                      ) : (
                        <Text style={styles.caption}>{signal.label}</Text>
                      )}
                    </View>

                    {connectedHere ? (
                      <BatteryIndicator
                        percentage={characteristicValues['Battery Percentage']}
                      />
                    ) : connectingHere ? (
                      <ActivityIndicator color={COLORS.green} />
                    ) : (
                      <SignalBars bars={signal.bars} />
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        {isConnected && boardRows.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Hardware
              </Text>
              <Text
                style={[
                  styles.caption,
                  missingBoards.length === 0
                    ? styles.textGreen
                    : styles.textAmber,
                ]}>
                {boardRows.length - missingBoards.length} of {boardRows.length}{' '}
                detected
              </Text>
            </View>
            <View style={styles.card}>
              {boardRows.map((board, i) => (
                <View
                  key={board.bit}
                  style={[styles.hwRow, i > 0 && styles.rowDivider]}>
                  <View
                    style={[
                      styles.hwIcon,
                      {
                        backgroundColor: board.present
                          ? COLORS.greenTint
                          : COLORS.amberTint,
                      },
                    ]}>
                    {board.present ? (
                      <Check color={COLORS.green} size={16} strokeWidth={3} />
                    ) : (
                      <AlertTriangle color={COLORS.amber} size={16} />
                    )}
                  </View>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{board.label}</Text>
                    <Text style={styles.caption}>
                      {board.sensors
                        .map(sensor => sensor.chartLabel)
                        .join(', ')}
                    </Text>

                    {!board.present && (
                      <Text style={styles.caption}>
                        Not responding. Check the connection on the board.
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.hwStatus,
                      board.present ? styles.textGreen : styles.textAmber,
                    ]}>
                    {board.present ? 'Detected' : 'Missing'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.panel}>
        <View style={styles.panelHandle} />
        <Pressable
          disabled={primary.disabled || !primary.onPress}
          onPress={primary.onPress}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          accessibilityHint={primary.hint}
          accessibilityState={{
            disabled: primary.disabled,
            busy: primary.loading,
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            primary.disabled && !primary.loading && styles.primaryDisabled,
            primary.loading && styles.primaryLoading,
            isConnected && styles.primaryGo,
            pressed && styles.pressed,
          ]}>
          {primary.loading ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.primaryText} numberOfLines={1}>
            {primary.label}
          </Text>
          {'arrow' in primary && primary.arrow ? (
            <ArrowRight color="#fff" size={20} strokeWidth={2.5} />
          ) : null}
        </Pressable>
        {!showDisconnect && (
          <Text style={styles.panelHint}>{primary.hint}</Text>
        )}

        {showSecondaryScan && (
          <Pressable
            onPress={handleScan}
            accessibilityRole="button"
            accessibilityLabel="Scan again"
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}>
            <RefreshCw color={COLORS.ink} size={16} strokeWidth={2.25} />
            <Text style={styles.secondaryText}>Scan again</Text>
          </Pressable>
        )}

        {showDisconnect && (
          <Pressable
            onPress={confirmDisconnect}
            accessibilityRole="button"
            accessibilityLabel="Disconnect e-Nose"
            accessibilityHint="Asks to confirm, then closes the connection"
            style={({ pressed }) => [
              styles.dangerButton,
              pressed && styles.pressed,
            ]}>
            <PowerOff color={COLORS.red} size={16} strokeWidth={2.25} />
            <Text style={styles.dangerText}>Disconnect</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.45 },

  content: { padding: 20, paddingBottom: 24, gap: 24 },

  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: COLORS.muted },
  textGreen: { color: COLORS.green, fontWeight: '500' },
  textAmber: { color: COLORS.amber, fontWeight: '500' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: '600', color: COLORS.ink },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillText: { fontSize: 14, fontWeight: '500' },

  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { alignItems: 'center', gap: 6 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  stepCircleActive: {
    borderColor: COLORS.green,
    backgroundColor: COLORS.greenTint,
  },
  stepCircleDone: { borderColor: COLORS.green, backgroundColor: COLORS.green },
  stepNumber: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  stepNumberActive: { color: COLORS.green },
  stepLabel: { fontSize: 13, color: COLORS.muted },
  stepLabelOn: { color: COLORS.ink, fontWeight: '500' },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    marginBottom: 20,
    backgroundColor: COLORS.border,
  },
  stepLineOn: { backgroundColor: COLORS.green },

  guidance: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'flex-start',
  },
  guidanceIcon: { minWidth: 22, minHeight: 22, justifyContent: 'center' },
  guidanceText: { flex: 1, gap: 2 },
  guidanceTitle: { fontSize: 16, fontWeight: '600' },

  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  empty: {
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  deviceRowSelected: { backgroundColor: COLORS.greenTint },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { fontSize: 16, fontWeight: '600', color: COLORS.ink },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: COLORS.green },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.green,
  },

  hwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  hwIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hwStatus: { fontSize: 14 },

  panel: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d6d8d2',
    marginBottom: 8,
  },
  panelHint: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.muted,
  },

  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: COLORS.green,
  },
  primaryDisabled: { backgroundColor: COLORS.border },
  primaryLoading: { backgroundColor: COLORS.green, opacity: 0.85 },
  primaryGo: { backgroundColor: COLORS.green },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '500' },

  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryText: { fontSize: 15, fontWeight: '500', color: COLORS.ink },

  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.red,
    backgroundColor: COLORS.redTint,
  },
  dangerText: { fontSize: 15, fontWeight: '500', color: COLORS.red },
});

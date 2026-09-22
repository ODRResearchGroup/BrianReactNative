import { Alert, NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const VERSION_URL =
  'https://github.com/ODRResearchGroup/BrianReactNative/releases/latest/download/version.json';

type AppUpdaterNativeModule = {
  versionCode: number;
  canInstallPackages(): Promise<boolean>;
  openInstallSettings(): Promise<void>;
  installApk(apkPath: string): Promise<void>;
};

type ReleaseInfo = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  changelog?: string;
};

const nativeUpdater = NativeModules.AppUpdater as
  | AppUpdaterNativeModule
  | undefined;

export async function checkForAppUpdate(): Promise<ReleaseInfo | null> {
  if (Platform.OS !== 'android' || !nativeUpdater) {
    return null;
  }

  const response = await fetch(VERSION_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Update check failed with ${response.status}`);
  }

  const release = (await response.json()) as ReleaseInfo;
  if (
    !release.versionCode ||
    release.versionCode <= nativeUpdater.versionCode
  ) {
    return null;
  }
  return release;
}

async function installUpdate(release: ReleaseInfo): Promise<void> {
  if (!nativeUpdater) {
    return;
  }

  const apkPath = `${RNFS.CachesDirectoryPath}/blegpsapp-update.apk`;
  await RNFS.downloadFile({
    fromUrl: release.apkUrl,
    toFile: apkPath,
    background: true,
    discretionary: false,
  }).promise;
  await nativeUpdater.installApk(apkPath);
}

export async function checkAndPromptForAppUpdate(): Promise<void> {
  try {
    const release = await checkForAppUpdate();
    if (!release || __DEV__) {
      return;
    }

    Alert.alert(
      'Update available',
      release.changelog
        ? `${release.versionName}\n\n${release.changelog}`
        : `Version ${release.versionName} is ready to install.`,
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              const canInstall = await nativeUpdater?.canInstallPackages();
              if (!canInstall) {
                Alert.alert(
                  'Allow app updates',
                  'Enable installation permission for Brian e-Nose, then return and tap Update again.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Open settings',
                      onPress: () => nativeUpdater?.openInstallSettings(),
                    },
                  ],
                );
                return;
              }
              await installUpdate(release);
            } catch {
              Alert.alert(
                'Update failed',
                'The update could not be downloaded. Please try again later.',
              );
            }
          },
        },
      ],
    );
  } catch {
    // An update check must never block the app when offline.
  }
}

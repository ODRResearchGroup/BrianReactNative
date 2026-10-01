/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import notifee from '@notifee/react-native';

import App from './src/App';
import { name as appName } from './app.json';

notifee.registerForegroundService(() => {
  return new Promise(() => {
    // The actual BLE/location listeners already live in the app providers.
    //
    // Keeping this foreground task alive gives Android a foreground-service
    // reason to keep the app process running while the user backgrounds
    // or locks the phone.
  });
});

LogBox.ignoreAllLogs();

AppRegistry.registerComponent(appName, () => App);

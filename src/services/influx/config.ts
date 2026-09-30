import Config from 'react-native-config';

export const INFLUX_CONFIG = {
  url: Config.INFLUX_URL ?? '',
  token: Config.INFLUX_TOKEN ?? '',
  org: Config.INFLUX_ORG ?? '',
  timeseriesBucket: Config.INFLUX_TIMESERIES_BUCKET ?? '',
  fingerprintsBucket: Config.INFLUX_FINGERPRINTS_BUCKET ?? '',
};

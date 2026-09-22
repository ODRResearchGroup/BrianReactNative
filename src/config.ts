import Config from 'react-native-config';

export const CONFIG = {
  INFLUX_TOKEN: Config.INFLUX_TOKEN ?? '',
  INFLUX_URL: Config.INFLUX_URL ?? '',
  INFLUX_DATABASE: Config.INFLUX_DATABASE ?? '',
};

export default CONFIG;

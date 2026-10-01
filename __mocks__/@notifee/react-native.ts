const notifee = {
  registerForegroundService: jest.fn(),
  requestPermission: jest.fn().mockResolvedValue({
    authorizationStatus: 1,
  }),
  createChannel: jest.fn().mockResolvedValue('smell-walk-recording'),
  displayNotification: jest.fn().mockResolvedValue(undefined),
  stopForegroundService: jest.fn().mockResolvedValue(undefined),
};

export const AndroidImportance = {
  LOW: 2,
};

export const AuthorizationStatus = {
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  NOT_DETERMINED: -1,
};

export default notifee;

/// Build-time configuration. Override per build, e.g.:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000/api/v1
/// The default targets the Android emulator's view of the host machine.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://stimpylb.com/api/v1',
);

/// OneSignal app id (public; it ships in the app). Empty means push is off.
///   flutter run --dart-define=ONESIGNAL_APP_ID=your-app-uuid
const String oneSignalAppId = String.fromEnvironment(
  'ONESIGNAL_APP_ID',
  defaultValue: 'eb4fd26f-da5b-4434-8d0c-2cb6a48227fd',
);

/// Sentry DSN for crash reporting. Empty means crash reporting is off (the default).
///   flutter build apk --dart-define=SENTRY_DSN=https://KEY@ORG.ingest.sentry.io/PROJECT
const String sentryDsn = String.fromEnvironment('SENTRY_DSN', defaultValue: '');

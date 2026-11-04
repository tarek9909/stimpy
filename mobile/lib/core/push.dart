import 'package:flutter/foundation.dart';
import 'package:onesignal_flutter/onesignal_flutter.dart';

import 'config.dart';

/// OneSignal push for the admin app. The backend sends to External ID = 'admin-<user id>' (see backend services/push.ts),
/// so after sign-in this device is linked to that id, and unlinked on sign-out.
/// Does nothing when ONESIGNAL_APP_ID is not set at build time, so the app runs without push.
class PushService {
  PushService._();

  static bool _initialized = false;

  static bool get enabled => oneSignalAppId.isNotEmpty;

  /// Call once before runApp.
  static void init() {
    if (!enabled || _initialized) return;
    _initialized = true;
    OneSignal.Debug.setLogLevel(kDebugMode ? OSLogLevel.warn : OSLogLevel.none);
    OneSignal.initialize(oneSignalAppId);
    // Ask for permission at a sensible time: here at launch is fine for an internal admin app.
    OneSignal.Notifications.requestPermission(true);
  }

  /// Links this device to the signed-in admin user, so pushes addressed to that user arrive here.
  static Future<void> identify(int userId) async {
    if (!enabled || !_initialized) return;
    try {
      // OneSignal blocks guessable ids like "1"; the backend uses the same prefix (services/push.ts pushExternalId).
      await OneSignal.login('admin-$userId');
    } catch (e) {
      debugPrint('OneSignal login failed: $e');
    }
  }

  /// Unlinks this device from the user on sign-out, so the next person on the phone gets no alerts.
  static Future<void> forget() async {
    if (!enabled || !_initialized) return;
    try {
      await OneSignal.logout();
    } catch (e) {
      debugPrint('OneSignal logout failed: $e');
    }
  }
}

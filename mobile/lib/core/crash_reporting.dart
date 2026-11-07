import 'package:sentry_flutter/sentry_flutter.dart';

import 'config.dart';

/// Thin wrapper over Sentry. Everything is a no-op unless a SENTRY_DSN was compiled in.
class CrashReporting {
  static bool get enabled => sentryDsn.isNotEmpty;

  static void configure(SentryFlutterOptions o) {
    o.dsn = sentryDsn;
    o.sendDefaultPii = false; // no IPs, no user details by default
    o.attachScreenshot = false; // screens show customer data
    o.attachViewHierarchy = false;
    o.maxRequestBodySize = MaxRequestBodySize.never;
    o.beforeSend = (event, hint) => scrub(event);
    o.beforeBreadcrumb = (crumb, hint) => scrubBreadcrumb(crumb);
  }

  /// Removes anything that could carry customer data or credentials from an event.
  static SentryEvent scrub(SentryEvent event) {
    final user = event.user;
    event.request = null;
    // Keep only the opaque id: never email, name, username or IP.
    event.user = user?.id == null ? null : SentryUser(id: user!.id);
    return event;
  }

  /// Drops network and navigation breadcrumbs, whose data (URLs, params) may include customer details.
  static Breadcrumb? scrubBreadcrumb(Breadcrumb? crumb) {
    if (crumb == null) return null;
    final type = crumb.type;
    if (type == 'http' || type == 'navigation') return null;
    crumb.data = null;
    return crumb;
  }

  static void setUser(String id) {
    if (!enabled) return;
    Sentry.configureScope((s) => s.setUser(SentryUser(id: id)));
  }

  static void clearUser() {
    if (!enabled) return;
    Sentry.configureScope((s) => s.setUser(null));
  }
}

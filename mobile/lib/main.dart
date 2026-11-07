import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app/router.dart';
import 'core/app_lock.dart';
import 'core/crash_reporting.dart';
import 'core/push.dart';
import 'theme/app_theme.dart';
import 'ui/brand_logo.dart';

Future<void> main() async {
  if (CrashReporting.enabled) {
    // SentryFlutter.init installs the FlutterError / PlatformDispatcher handlers itself (and chains the previous ones).
    await SentryFlutter.init(CrashReporting.configure, appRunner: _start);
  } else {
    _start();
  }
}

void _start() {
  WidgetsFlutterBinding.ensureInitialized();
  // Without Sentry, at least keep errors visible in logs instead of silently swallowed.
  if (!CrashReporting.enabled) _installLogHandlers();
  SystemChrome.setSystemUIOverlayStyle(kAppOverlay);
  PushService.init();
  runApp(const ProviderScope(child: StimpyAdminApp()));
}

void _installLogHandlers() {
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    debugPrint('FlutterError: ${details.exceptionAsString()}');
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('Uncaught: $error\n$stack');
    return true;
  };
}

class StimpyAdminApp extends ConsumerWidget {
  const StimpyAdminApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Stimpy Admin',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      themeMode: ThemeMode.light,
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) => _BrandAssets(child: AppLock(child: child ?? const SizedBox.shrink())),
    );
  }
}

/// Loads the logo files once, as soon as the app has a MediaQuery, so logos are ready on the first frames.
class _BrandAssets extends StatefulWidget {
  const _BrandAssets({required this.child});
  final Widget child;

  @override
  State<_BrandAssets> createState() => _BrandAssetsState();
}

class _BrandAssetsState extends State<_BrandAssets> {
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    BrandLogo.precacheAll(context);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

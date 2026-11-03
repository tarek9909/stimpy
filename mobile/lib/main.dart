import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/router.dart';
import 'core/push.dart';
import 'theme/app_theme.dart';
import 'ui/brand_logo.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(kAppOverlay);
  PushService.init();
  runApp(const ProviderScope(child: StimpyAdminApp()));
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
      builder: (context, child) => _BrandAssets(child: child ?? const SizedBox.shrink()),
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

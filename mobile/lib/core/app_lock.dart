import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/auth_state.dart';
import 'providers.dart';
import '../theme/brand.dart';

/// Locks the app behind the phone's fingerprint / face / PIN / pattern.
/// It locks when a signed-in app opens cold and when it returns from the background after [lockAfter].
/// A phone with no screen lock at all cannot be asked, so the app stays open there (nothing to check against).
class AppLock extends ConsumerStatefulWidget {
  const AppLock({super.key, required this.child});
  final Widget child;

  static const lockAfter = Duration(seconds: 30);

  @override
  ConsumerState<AppLock> createState() => _AppLockState();
}

class _AppLockState extends ConsumerState<AppLock> with WidgetsBindingObserver {
  final _auth = LocalAuthentication();
  bool _locked = true;
  bool _checking = false;
  DateTime? _backgroundedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  /// Cold start: with a saved session the fingerprint comes first, in place of any screen or password.
  /// With no saved session there is nothing to protect yet, so the login screen shows and the password is the login.
  Future<void> _start() async {
    final saved = await ref.read(sessionStoreProvider).read();
    if (!mounted) return;
    if (saved == null) {
      setState(() => _locked = false);
      return;
    }
    await _unlock();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _backgroundedAt ??= DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final since = _backgroundedAt;
      _backgroundedAt = null;
      final signedIn = ref.read(authProvider).status == AuthStatus.signedIn;
      if (signedIn && since != null && DateTime.now().difference(since) >= AppLock.lockAfter) {
        setState(() => _locked = true);
        _unlock();
      }
    }
  }

  Future<void> _unlock() async {
    if (_checking) return;
    _checking = true;
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) {
        if (mounted) setState(() => _locked = false);
        return;
      }
      final ok = await _auth.authenticate(
        localizedReason: 'Unlock Stimpy Admin',
        biometricOnly: false,
        persistAcrossBackgrounding: true,
      );
      if (mounted) setState(() => _locked = !ok);
    } on LocalAuthException {
      // Cancelled or failed: stay locked, the button lets them try again.
    } on PlatformException {
      // Same.
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_locked)
          Positioned.fill(
            child: Material(
              color: Brand.white,
              child: SafeArea(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(LucideIcons.lock, size: 36, color: Brand.ink),
                      const SizedBox(height: 16),
                      Text('Stimpy Admin is locked', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 20),
                      FilledButton(onPressed: _unlock, child: const Text('Unlock')),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

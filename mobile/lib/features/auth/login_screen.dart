import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_error.dart';
import '../../core/providers.dart';
import '../../theme/brand.dart';
import '../../ui/app_text_field.dart';
import '../../ui/brand_logo.dart';
import '../../ui/error_banner.dart';
import '../../ui/pill.dart';
import '../../ui/zip_line.dart';
import 'auth_controller.dart';

/// Sign-in: a coral brand hero (main logo on coral, as the brand requires), the zip line as the boundary, and a
/// white sheet with the form. Same email and password as the web dashboard.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _localAuth = LocalAuthentication();
  bool _busy = false;
  String? _error;
  bool _bioSupported = false; // the phone has a fingerprint / face / PIN / pattern (its passkey)
  bool _bioSaved = false; // credentials are saved, so the fingerprint can sign in
  bool _enableBio = true; // the "next time" checkbox

  @override
  void initState() {
    super.initState();
    _initBio();
  }

  Future<void> _initBio() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final saved = await ref.read(sessionStoreProvider).readBioLogin();
      if (!mounted) return;
      setState(() {
        _bioSupported = supported;
        _bioSaved = supported && saved != null;
      });
      if (_bioSaved) _signInWithFingerprint(); // prompt straight away, like the launch lock
    } catch (_) {
      // No biometric support: the password form is all there is.
    }
  }

  Future<void> _signInWithFingerprint() async {
    if (_busy) return;
    final store = ref.read(sessionStoreProvider);
    final creds = await store.readBioLogin();
    if (creds == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ok = await _localAuth.authenticate(localizedReason: 'Sign in to Stimpy Admin', biometricOnly: false, persistAcrossBackgrounding: true);
      if (!ok || !mounted) return;
      await ref.read(authProvider.notifier).login(creds.email, creds.password);
    } on ApiError catch (e) {
      // A rejected password (changed on the dashboard) cannot work again: forget it and ask for the new one.
      if (e.statusCode == 401 || e.statusCode == 400) {
        await store.clearBioLogin();
        if (mounted) setState(() => _bioSaved = false);
        if (mounted) setState(() => _error = 'Your password has changed. Sign in with the new one.');
      } else if (mounted) {
        setState(() => _error = e.message);
      }
    } on LocalAuthException {
      // Cancelled: the button and the form are still there.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).login(_email.text, _password.text);
      final store = ref.read(sessionStoreProvider);
      if (_bioSupported && _enableBio) {
        await store.writeBioLogin(_email.text.trim(), _password.text);
      } else if (!_enableBio) {
        await store.clearBioLogin();
      }
    } on ApiError catch (e) {
      final wait = e.retryAfterSeconds;
      if (mounted) setState(() => _error = wait != null ? '${e.message} Try again in $wait s.' : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final media = MediaQuery.of(context);
    final keyboardOpen = media.viewInsets.bottom > 0;
    final heroHeight = keyboardOpen ? 96.0 : (media.size.height * 0.32).clamp(190.0, 280.0);

    return Scaffold(
      backgroundColor: Brand.white,
      resizeToAvoidBottomInset: true,
      body: Column(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOutCubic,
            height: heroHeight + media.padding.top,
            width: double.infinity,
            padding: EdgeInsets.only(top: media.padding.top),
            color: Brand.coral,
            alignment: Alignment.center,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                BrandLogo.full(surface: LogoSurface.coral, width: keyboardOpen ? 140 : 200),
                if (!keyboardOpen) ...[
                  const SizedBox(height: 14),
                  const Pill(label: 'Admin', tone: PillTone.black, large: true),
                ],
              ],
            ),
          ),
          const ZipLine(),
          Expanded(
            child: SafeArea(
              top: false,
              child: Align(
                alignment: Alignment.topCenter,
                child: SingleChildScrollView(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: AutofillGroup(
                      child: Form(
                        key: _form,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text('Welcome back', style: text.headlineSmall),
                            const SizedBox(height: 4),
                            Text('Sign in with your dashboard account.', style: text.bodySmall),
                            const SizedBox(height: 24),
                            AppTextField(
                              label: 'Email',
                              controller: _email,
                              hint: 'you@stimpy.com',
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.email],
                              enabled: !_busy,
                              validator: (v) => (v == null || !v.contains('@')) ? 'Enter your email address.' : null,
                            ),
                            const SizedBox(height: 16),
                            AppTextField(
                              label: 'Password',
                              controller: _password,
                              obscure: true,
                              textInputAction: TextInputAction.done,
                              autofillHints: const [AutofillHints.password],
                              enabled: !_busy,
                              onSubmitted: (_) => _submit(),
                              validator: (v) => (v == null || v.isEmpty) ? 'Enter your password.' : null,
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: 16),
                              ErrorBanner(message: _error!),
                            ],
                            const SizedBox(height: 24),
                            FilledButton(
                              onPressed: _busy ? null : _submit,
                              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                              child: _busy
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Brand.white),
                                    )
                                  : const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [Text('Sign in'), SizedBox(width: 8), Icon(LucideIcons.arrowRight, size: 18)],
                                    ),
                            ),
                            if (_bioSaved) ...[
                              const SizedBox(height: 12),
                              OutlinedButton.icon(
                                onPressed: _busy ? null : _signInWithFingerprint,
                                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                                icon: const Icon(LucideIcons.fingerprint, size: 20),
                                label: const Text('Sign in with fingerprint or passkey'),
                              ),
                            ] else if (_bioSupported)
                              CheckboxListTile(
                                value: _enableBio,
                                onChanged: _busy ? null : (v) => setState(() => _enableBio = v ?? false),
                                contentPadding: EdgeInsets.zero,
                                controlAffinity: ListTileControlAffinity.leading,
                                dense: true,
                                title: Text('Use fingerprint or passkey to sign in next time', style: text.bodySmall),
                              ),
                            const SizedBox(height: 20),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(LucideIcons.lock, size: 14, color: Brand.ink55),
                                const SizedBox(width: 6),
                                Flexible(child: Text('Same email and password as the web dashboard.', style: text.labelSmall)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

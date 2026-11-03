import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_error.dart';
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
  bool _busy = false;
  String? _error;

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

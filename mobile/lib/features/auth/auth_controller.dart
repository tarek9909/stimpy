import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/api_error.dart';
import '../../core/crash_reporting.dart';
import '../../core/offline.dart';
import '../../core/providers.dart';
import '../../core/push.dart';
import 'auth_state.dart';

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Owns the sign-in state. Login and logout use the same endpoints as the web dashboard.
class AuthController extends Notifier<AuthState> {
  late final ApiClient _api;
  late final SessionStore _store;

  @override
  AuthState build() {
    _api = ref.read(apiClientProvider);
    _store = ref.read(sessionStoreProvider);
    _api.onUnauthorized = _handleExpired;
    Future<void>.microtask(restore);
    return const AuthState.unknown();
  }

  /// On launch: reuse the saved session if the server still accepts it.
  Future<void> restore() async {
    final saved = await _store.read();
    if (saved == null) {
      state = const AuthState.signedOut();
      return;
    }
    await _api.restoreSession(saved);
    try {
      await _loadMe();
    } on ApiError catch (e) {
      // No connection at all (no HTTP status): keep the session and open on the saved user, so the cached
      // orders and customers are usable offline. Any answer from the server (401 etc.) still signs out.
      if (e.statusCode == null) {
        final raw = await _store.readUser();
        if (raw != null) {
          try {
            final user = AuthUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
            _api.cache?.userId = user.id.toString();
            state = AuthState(status: AuthStatus.signedIn, user: user);
            return;
          } catch (_) {
            // Corrupt saved user: fall through to sign-out.
          }
        }
      }
      await _forget();
    }
  }

  Future<void> login(String email, String password) async {
    await _api.postJson('/auth/login', body: {'email': email.trim(), 'password': password});
    final token = await _api.sessionToken();
    if (token == null) {
      throw ApiError('Sign-in did not start a session. Check the API address.');
    }
    await _store.write(token);
    await _loadMe();
  }

  Future<void> logout() async {
    try {
      await _api.postJson('/auth/logout');
    } on ApiError {
      // Signing out locally still works if the server cannot be reached.
    }
    await _forget();
  }

  Future<void> _loadMe() async {
    final json = await _api.getJson('/auth/me');
    final session = json['session'] as Map<String, dynamic>?;
    final expires = session?['expiresAt'] as String?;
    final user = AuthUser.fromJson(json['user'] as Map<String, dynamic>);
    state = AuthState(
      status: AuthStatus.signedIn,
      user: user,
      sessionExpiresAt: expires == null ? null : DateTime.tryParse(expires)?.toLocal(),
    );
    await _store.writeUser(jsonEncode({'id': user.id, 'email': user.email, 'name': user.name, 'role': user.role}));
    // Scope the offline cache to this account before any data screen asks for it.
    _api.cache?.userId = user.id.toString();
    CrashReporting.setUser(user.id.toString());
    await PushService.identify(user.id);
  }

  Future<void> _forget() async {
    await PushService.forget();
    await _api.clearSession();
    await _api.cache?.clear();
    _api.cache?.userId = null;
    CrashReporting.clearUser();
    ref.read(offlineProvider.notifier).clear();
    await _store.clear();
    state = const AuthState.signedOut();
  }

  /// Called by the API client on any 401 after sign-in: the session ended on the server.
  void _handleExpired() {
    if (state.status == AuthStatus.signedIn) {
      Future<void>.microtask(_forget);
    }
  }
}

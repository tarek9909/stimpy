import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/api_error.dart';
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
    } on ApiError {
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
    await PushService.identify(user.id);
  }

  Future<void> _forget() async {
    await PushService.forget();
    await _api.clearSession();
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

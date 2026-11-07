import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'config.dart';
import 'offline.dart';
import 'response_cache.dart';

const _tokenKey = 'stimpy_session_token';
const _userKey = 'stimpy_session_user';
const _bioKey = 'stimpy_bio_login';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

final responseCacheProvider = Provider<ResponseCache>((ref) => ResponseCache());

final apiClientProvider = Provider<ApiClient>((ref) {
  final api = ApiClient(baseUrl: apiBaseUrl, cache: ref.watch(responseCacheProvider));
  api.onServedStale = (savedAt) => Future<void>.microtask(() => ref.read(offlineProvider.notifier).serveStale(savedAt));
  api.onReachable = () => Future<void>.microtask(() => ref.read(offlineProvider.notifier).clear());
  return api;
});

/// Saved session token in the platform keystore (Keystore on Android). The password is stored only when the user
/// opts in to fingerprint sign-in on the login screen (see [readBioLogin]) and is removed on explicit sign-out.
class SessionStore {
  SessionStore(this._storage);
  final FlutterSecureStorage _storage;

  Future<String?> read() => _storage.read(key: _tokenKey);
  Future<void> write(String token) => _storage.write(key: _tokenKey, value: token);
  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }

  /// Email + password saved for fingerprint sign-in (opt-in). Null when the user has not enabled it.
  Future<({String email, String password})?> readBioLogin() async {
    final raw = await _storage.read(key: _bioKey);
    if (raw == null) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return (email: m['e'] as String, password: m['p'] as String);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeBioLogin(String email, String password) =>
      _storage.write(key: _bioKey, value: jsonEncode({'e': email, 'p': password}));
  Future<void> clearBioLogin() => _storage.delete(key: _bioKey);

  /// The signed-in user's basic details (id, email, name, role), kept so the app can open offline.
  Future<String?> readUser() => _storage.read(key: _userKey);
  Future<void> writeUser(String json) => _storage.write(key: _userKey, value: json);
}

final sessionStoreProvider = Provider<SessionStore>(
  (ref) => SessionStore(ref.watch(secureStorageProvider)),
);

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'config.dart';
import 'offline.dart';
import 'response_cache.dart';

const _tokenKey = 'stimpy_session_token';
const _userKey = 'stimpy_session_user';

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

/// Saved session token in the platform keystore (Keystore on Android). Never the password.
class SessionStore {
  SessionStore(this._storage);
  final FlutterSecureStorage _storage;

  Future<String?> read() => _storage.read(key: _tokenKey);
  Future<void> write(String token) => _storage.write(key: _tokenKey, value: token);
  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }

  /// The signed-in user's basic details (id, email, name, role), kept so the app can open offline.
  Future<String?> readUser() => _storage.read(key: _userKey);
  Future<void> writeUser(String json) => _storage.write(key: _userKey, value: json);
}

final sessionStoreProvider = Provider<SessionStore>(
  (ref) => SessionStore(ref.watch(secureStorageProvider)),
);

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'config.dart';

const _tokenKey = 'stimpy_session_token';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(baseUrl: apiBaseUrl),
);

/// Saved session token in the platform keystore (Keystore on Android). Never the password.
class SessionStore {
  SessionStore(this._storage);
  final FlutterSecureStorage _storage;

  Future<String?> read() => _storage.read(key: _tokenKey);
  Future<void> write(String token) => _storage.write(key: _tokenKey, value: token);
  Future<void> clear() => _storage.delete(key: _tokenKey);
}

final sessionStoreProvider = Provider<SessionStore>(
  (ref) => SessionStore(ref.watch(secureStorageProvider)),
);

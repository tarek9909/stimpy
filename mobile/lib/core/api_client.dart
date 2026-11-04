import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import 'api_error.dart';
import 'response_cache.dart';

const _sessionCookie = 'stimpy_session';

/// Talks to the Stimpy API with the same cookie session the web dashboard uses.
/// A native client sends no Origin header, so the browser-only CORS and CSRF rules do not apply.
class ApiClient {
  ApiClient({required String baseUrl, CookieJar? jar, this.cache, Dio? dio})
      : _baseUri = Uri.parse(baseUrl),
        cookieJar = jar ?? CookieJar(),
        _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 30),
              headers: {'Accept': 'application/json'},
            )) {
    _dio.interceptors.add(CookieManager(cookieJar));
  }

  final Dio _dio;
  final Uri _baseUri;
  final CookieJar cookieJar;

  /// Offline cache for GET responses (null disables it). Never used for writes or `/auth/*`.
  final ResponseCache? cache;

  /// Called when a GET could not reach the server and a saved copy was returned instead.
  void Function(DateTime savedAt)? onServedStale;

  /// Called when the server answered a request (even with an error status): we are online again.
  void Function()? onReachable;

  /// Called when a signed-in request gets 401 (the session ended on the server).
  void Function()? onUnauthorized;

  /// Current session token, or null when signed out.
  Future<String?> sessionToken() async {
    final cookies = await cookieJar.loadForRequest(_baseUri);
    for (final c in cookies) {
      if (c.name == _sessionCookie) return c.value;
    }
    return null;
  }

  /// Puts a previously saved session back into the jar (app restart).
  Future<void> restoreSession(String token) async {
    await cookieJar.saveFromResponse(_baseUri, [Cookie(_sessionCookie, token)]);
  }

  Future<void> clearSession() => cookieJar.deleteAll();

  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query}) async {
    final store = cache != null && ResponseCache.cacheable(path) ? cache : null;
    try {
      final data = await _send(() => _dio.get<dynamic>(path, queryParameters: query));
      if (store != null) await store.put(path, query, data);
      return data;
    } on ApiError catch (e) {
      // Only a missing connection falls back to the saved copy; 4xx/5xx are real answers and are never masked.
      if (store != null && e.statusCode == null) {
        final hit = await store.get(path, query);
        if (hit != null) {
          onServedStale?.call(hit.savedAt);
          return hit.data;
        }
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> postJson(String path, {Object? body}) =>
      _send(() => _dio.post<dynamic>(path, data: body));

  Future<Map<String, dynamic>> patchJson(String path, {Object? body}) =>
      _send(() => _dio.patch<dynamic>(path, data: body));

  Future<Map<String, dynamic>> deleteJson(String path, {Object? body}) =>
      _send(() => _dio.delete<dynamic>(path, data: body));

  Future<Map<String, dynamic>> _send(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      onReachable?.call();
      final data = res.data;
      if (data is Map<String, dynamic>) return data;
      // A few endpoints (customer tags) answer with a bare array: hand it back as {items: [...]}.
      if (data is List) return {'items': data};
      if (data == null || data == '') return <String, dynamic>{};
      throw ApiError('Unexpected response from the server.', statusCode: res.statusCode);
    } on DioException catch (e) {
      final error = _toApiError(e);
      if (e.response != null) onReachable?.call();
      if (error.isUnauthenticated && onUnauthorized != null) onUnauthorized!();
      throw error;
    }
  }

  ApiError _toApiError(DioException e) {
    final res = e.response;
    final status = res?.statusCode;
    if (res == null) {
      return ApiError('Cannot reach the server. Check your connection and the API address.');
    }
    String? code;
    String message = 'Something went wrong (${status ?? 'no response'}).';
    var fields = <String, String>{};
    Map<String, dynamic>? details;
    final body = res.data;
    if (body is Map<String, dynamic>) {
      final err = body['error'];
      if (err is Map<String, dynamic>) {
        code = err['code'] as String?;
        if (err['message'] is String) message = err['message'] as String;
        final rawFields = err['fields'];
        if (rawFields is Map) {
          fields = {
            for (final e in rawFields.entries)
              if (e.value is String) e.key.toString(): e.value as String,
          };
        }
        final rawDetails = err['details'];
        if (rawDetails is Map<String, dynamic>) details = rawDetails;
      } else if (body['message'] is String) {
        message = body['message'] as String;
      }
    }
    final retry = int.tryParse(res.headers.value(HttpHeaders.retryAfterHeader) ?? '');
    return ApiError(message, statusCode: status, code: code, retryAfterSeconds: retry, fields: fields, details: details);
  }
}

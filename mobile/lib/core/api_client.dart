import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import 'api_error.dart';

const _sessionCookie = 'stimpy_session';

/// Talks to the Stimpy API with the same cookie session the web dashboard uses.
/// A native client sends no Origin header, so the browser-only CORS and CSRF rules do not apply.
class ApiClient {
  ApiClient({required String baseUrl, CookieJar? jar})
      : _baseUri = Uri.parse(baseUrl),
        cookieJar = jar ?? CookieJar(),
        _dio = Dio(BaseOptions(
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

  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get<dynamic>(path, queryParameters: query));

  Future<Map<String, dynamic>> postJson(String path, {Object? body}) =>
      _send(() => _dio.post<dynamic>(path, data: body));

  Future<Map<String, dynamic>> _send(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      final data = res.data;
      if (data is Map<String, dynamic>) return data;
      if (data == null || data == '') return <String, dynamic>{};
      throw ApiError('Unexpected response from the server.', statusCode: res.statusCode);
    } on DioException catch (e) {
      final error = _toApiError(e);
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

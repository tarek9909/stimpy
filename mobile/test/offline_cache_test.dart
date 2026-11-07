import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stimpy_admin/core/api_client.dart';
import 'package:stimpy_admin/core/api_error.dart';
import 'package:stimpy_admin/core/offline.dart';
import 'package:stimpy_admin/core/response_cache.dart';

/// Answers from a script: a map is a 200, an int is an error status, null is "no connection".
class _Adapter implements HttpClientAdapter {
  Object? next;
  int hits = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? requestStream, Future<void>? cancelFuture) async {
    hits++;
    final n = next;
    if (n == null) throw DioException.connectionError(requestOptions: options, reason: 'offline');
    if (n is int) return ResponseBody.fromString('{"error":{"message":"boom"}}', n, headers: {Headers.contentTypeHeader: ['application/json']});
    return ResponseBody.fromString('{"v":"$n"}', 200, headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late Directory tmp;
  late _Adapter adapter;
  late ResponseCache cache;
  late ApiClient api;
  late List<DateTime> stale;
  var reachable = 0;

  setUp(() {
    tmp = Directory.systemTemp.createTempSync('stimpy_cache');
    adapter = _Adapter();
    cache = ResponseCache(directory: () async => tmp)..userId = '1';
    final dio = Dio(BaseOptions(baseUrl: 'http://x.test/api'))..httpClientAdapter = adapter;
    api = ApiClient(baseUrl: 'http://x.test/api', cache: cache, dio: dio);
    stale = [];
    reachable = 0;
    api.onServedStale = stale.add;
    api.onReachable = () => reachable++;
  });
  tearDown(() => tmp.deleteSync(recursive: true));

  test('serves the saved copy when offline and flags it stale', () async {
    adapter.next = 'one';
    expect((await api.getJson('/admin/orders', query: {'page': 1}))['v'], 'one');
    expect(stale, isEmpty);
    adapter.next = null;
    expect((await api.getJson('/admin/orders', query: {'page': 1}))['v'], 'one');
    expect(stale, hasLength(1));
    // A different query was never cached.
    await expectLater(api.getJson('/admin/orders', query: {'page': 2}), throwsA(isA<ApiError>()));
  });

  test('does not serve cache on 4xx/5xx', () async {
    adapter.next = 'one';
    await api.getJson('/admin/orders');
    for (final code in [404, 500]) {
      adapter.next = code;
      await expectLater(api.getJson('/admin/orders'), throwsA(isA<ApiError>().having((e) => e.statusCode, 'status', code)));
    }
    expect(stale, isEmpty);
  });

  test('writes and /auth are never cached or served from cache', () async {
    adapter.next = 'one';
    await api.getJson('/auth/me');
    await api.postJson('/admin/orders', body: {'a': 1});
    adapter.next = null;
    await expectLater(api.getJson('/auth/me'), throwsA(isA<ApiError>()));
    await expectLater(
      api.postJson('/admin/orders', body: {}),
      throwsA(isA<ApiError>().having((e) => e.message, 'message', startsWith('Cannot reach the server'))),
    );
    expect(stale, isEmpty);
  });

  test('cache is per user and wiped by clear()', () async {
    adapter.next = 'one';
    await api.getJson('/admin/orders');
    adapter.next = null;
    cache.userId = '2';
    await expectLater(api.getJson('/admin/orders'), throwsA(isA<ApiError>()));
    cache.userId = '1';
    expect((await api.getJson('/admin/orders'))['v'], 'one');
    await cache.clear();
    await expectLater(api.getJson('/admin/orders'), throwsA(isA<ApiError>()));
    expect(Directory('${tmp.path}/api_cache').existsSync(), isFalse);
  });

  test('expired and over-cap entries are dropped', () async {
    var now = DateTime(2026, 1, 1);
    final c = ResponseCache(directory: () async => tmp, maxEntries: 2, maxAge: const Duration(days: 1), clock: () => now)..userId = '1';
    await c.put('/a', null, {'v': 1});
    expect(await c.get('/a', null), isNotNull);
    now = now.add(const Duration(days: 2));
    expect(await c.get('/a', null), isNull);
    for (final p in ['/b', '/c', '/d']) {
      await c.put(p, null, {'v': 1});
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    final remaining = Directory(tmp.path).listSync(recursive: true).whereType<File>().length;
    expect(remaining, 2);
  });

  test('reachable callback fires on success and on error statuses, not on no connection', () async {
    adapter.next = 'one';
    await api.getJson('/x');
    adapter.next = 500;
    await api.getJson('/x').catchError((_) => <String, dynamic>{});
    expect(reachable, 2);
    adapter.next = null;
    await api.getJson('/x').catchError((_) => <String, dynamic>{});
    expect(reachable, 2);
  });

  test('offline provider keeps the oldest time and clears', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final n = container.read(offlineProvider.notifier);
    n.serveStale(DateTime(2026, 1, 2));
    n.serveStale(DateTime(2026, 1, 1));
    expect(container.read(offlineProvider), DateTime(2026, 1, 1));
    n.clear();
    expect(container.read(offlineProvider), isNull);
    expect(timeAgo(DateTime(2026, 1, 1, 10), now: DateTime(2026, 1, 1, 10, 5)), '5 min ago');
  });
}

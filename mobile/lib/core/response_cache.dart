import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// A cached GET answer and when it was saved.
typedef CachedResponse = ({Map<String, dynamic> data, DateTime savedAt});

/// Small on-disk cache of successful GET JSON responses, used only when the network is unreachable.
///
/// One JSON file per request, under `<dir>/api_cache/<user>/`. Entries are keyed by path + sorted query and by the
/// signed-in user, so one account never sees another's data. Capped by entry count and age. All IO failures are
/// swallowed: a broken cache must never break a request.
class ResponseCache {
  ResponseCache({Future<Directory> Function()? directory, this.maxEntries = 150, this.maxAge = const Duration(days: 7), DateTime Function()? clock})
      : _directory = directory ?? getApplicationSupportDirectory,
        _now = clock ?? DateTime.now;

  final Future<Directory> Function() _directory;
  final int maxEntries;
  final Duration maxAge;
  final DateTime Function() _now;

  /// Id of the signed-in user. Null (signed out) disables the cache entirely.
  String? userId;

  /// Paths that are never cached.
  static bool cacheable(String path) => !path.startsWith('/auth/') && path != '/auth';

  Future<Directory> _root() async => Directory('${(await _directory()).path}${Platform.pathSeparator}api_cache');

  Future<Directory?> _userDir() async {
    final id = userId;
    if (id == null) return null;
    return Directory('${(await _root()).path}${Platform.pathSeparator}u_${_hash(id)}');
  }

  static String keyOf(String path, Map<String, dynamic>? query) {
    final entries = (query ?? const {}).entries.where((e) => e.value != null).map((e) => '${e.key}=${e.value}').toList()..sort();
    return entries.isEmpty ? path : '$path?${entries.join('&')}';
  }

  static String _hash(String s) {
    // Two 32-bit FNV-style hashes side by side, to make collisions negligible (keys are also verified on read).
    var a = 0x811c9dc5, b = 5381;
    for (final c in s.codeUnits) {
      a = ((a ^ c) * 0x01000193) & 0xffffffff;
      b = ((b * 33) ^ c) & 0xffffffff;
    }
    return a.toRadixString(16) + b.toRadixString(16);
  }

  Future<File?> _file(String key) async {
    final dir = await _userDir();
    if (dir == null) return null;
    return File('${dir.path}${Platform.pathSeparator}${_hash(key)}.json');
  }

  Future<void> put(String path, Map<String, dynamic>? query, Map<String, dynamic> data) async {
    if (!cacheable(path)) return;
    try {
      final key = keyOf(path, query);
      final file = await _file(key);
      if (file == null) return;
      await file.parent.create(recursive: true);
      await file.writeAsString(jsonEncode({'k': key, 't': _now().toUtc().toIso8601String(), 'd': data}), flush: true);
      await _prune(file.parent);
    } catch (_) {}
  }

  Future<CachedResponse?> get(String path, Map<String, dynamic>? query) async {
    if (!cacheable(path)) return null;
    try {
      final key = keyOf(path, query);
      final file = await _file(key);
      if (file == null || !await file.exists()) return null;
      final json = jsonDecode(await file.readAsString());
      if (json is! Map || json['k'] != key || json['d'] is! Map) return null;
      final savedAt = DateTime.tryParse('${json['t']}');
      if (savedAt == null || _now().difference(savedAt) > maxAge) {
        await file.delete();
        return null;
      }
      return (data: (json['d'] as Map).cast<String, dynamic>(), savedAt: savedAt.toLocal());
    } catch (_) {
      return null;
    }
  }

  Future<void> _prune(Directory dir) async {
    final files = <File, DateTime>{};
    await for (final e in dir.list()) {
      if (e is File) files[e] = (await e.stat()).modified;
    }
    if (files.length <= maxEntries) return;
    final oldestFirst = files.keys.toList()..sort((a, b) => files[a]!.compareTo(files[b]!));
    for (final f in oldestFirst.take(files.length - maxEntries)) {
      await f.delete();
    }
  }

  /// Removes everything for every user (sign-out).
  Future<void> clear() async {
    try {
      final root = await _root();
      if (await root.exists()) await root.delete(recursive: true);
    } catch (_) {}
  }
}

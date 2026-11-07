import 'package:flutter_riverpod/flutter_riverpod.dart';

/// When non-null the app is showing saved data because the server cannot be reached; the value is when that data
/// was saved. Set by the API client when it serves a cached GET, cleared when any request reaches the server.
class OfflineNotifier extends Notifier<DateTime?> {
  @override
  DateTime? build() => null;

  void serveStale(DateTime savedAt) {
    // Several cached screens may load at once: show the oldest copy, it is the honest "as of" time.
    final current = state;
    if (current == null || savedAt.isBefore(current)) state = savedAt;
  }

  void clear() {
    if (state != null) state = null;
  }
}

final offlineProvider = NotifierProvider<OfflineNotifier, DateTime?>(OfflineNotifier.new);

/// "just now", "5 min ago", "3 h ago", "2 days ago".
String timeAgo(DateTime then, {DateTime? now}) {
  final d = (now ?? DateTime.now()).difference(then);
  if (d.inMinutes < 1) return 'just now';
  if (d.inMinutes < 60) return '${d.inMinutes} min ago';
  if (d.inHours < 24) return '${d.inHours} h ago';
  return '${d.inDays} ${d.inDays == 1 ? 'day' : 'days'} ago';
}

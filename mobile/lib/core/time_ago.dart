import 'package:intl/intl.dart' show DateFormat;

/// "just now", "5 min ago", "3 h ago", "Yesterday", then the date. Local time.
String timeAgo(DateTime? when, {DateTime? now}) {
  if (when == null) return '';
  final current = now ?? DateTime.now();
  final diff = current.difference(when);
  if (diff.isNegative || diff.inSeconds < 45) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24 && current.day == when.day) return '${diff.inHours} h ago';
  final today = DateTime(current.year, current.month, current.day);
  final that = DateTime(when.year, when.month, when.day);
  final days = today.difference(that).inDays;
  if (days == 0) return '${diff.inHours} h ago';
  if (days == 1) return 'Yesterday';
  if (days < 7) return DateFormat('EEEE').format(when);
  return DateFormat(when.year == current.year ? 'd MMM' : 'd MMM y').format(when);
}

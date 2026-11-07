import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Orders waiting in NEW, shown as a badge on the Orders tab (the dashboard's nav badge). The Orders feature sets
/// it from `GET /admin/orders/counts`; until then it stays 0 and no badge shows.
final newOrdersBadgeProvider = NotifierProvider<NewOrdersBadge, int>(NewOrdersBadge.new);

class NewOrdersBadge extends Notifier<int> {
  @override
  int build() => 0;

  void set(int count) => state = count < 0 ? 0 : count;
}

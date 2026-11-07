import '../../orders/data/order_models.dart';

/// `GET /admin/overview` (website/backend/src/modules/overview/routes.ts). Money is integer cents. Parsing is
/// tolerant: missing or odd fields fall back to zero, empty lists or null, like the other models in the app.

int _int(Object? v) => v is int ? v : (v is num ? v.toInt() : 0);
int? _intOrNull(Object? v) => v is num ? v.toInt() : null;
String? _str(Object? v) => v is String ? v : null;
Map<String, dynamic>? _map(Object? v) => v is Map ? v.cast<String, dynamic>() : null;
List<Map<String, dynamic>> _list(Object? v) =>
    v is List ? [for (final e in v) if (e is Map) e.cast<String, dynamic>()] : const [];

class TodayStats {
  const TodayStats({
    required this.newOrders,
    required this.toPack,
    required this.outForDelivery,
    required this.cashToCollectCents,
    required this.revenueCents,
  });
  final int newOrders;
  final int toPack;
  final int outForDelivery;
  final int cashToCollectCents;
  final int revenueCents;

  factory TodayStats.fromJson(Map<String, dynamic>? j) => TodayStats(
        newOrders: _int(j?['newOrders']),
        toPack: _int(j?['toPack']),
        outForDelivery: _int(j?['outForDelivery']),
        cashToCollectCents: _int(j?['cashToCollectCents']),
        revenueCents: _int(j?['revenueCents']),
      );
}

enum AttentionType {
  newTooLong('NEW_TOO_LONG', 'Waiting'),
  outTooLong('OUT_TOO_LONG', 'Out too long'),
  lowStock('LOW_STOCK', 'Low stock'),
  holdExpired('HOLD_EXPIRED', 'Hold expired'),
  emailFailed('EMAIL_FAILED', 'Email failed');

  const AttentionType(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static AttentionType? fromApi(String? v) {
    for (final t in values) {
      if (t.apiValue == v) return t;
    }
    return null;
  }
}

class AttentionItem {
  const AttentionItem({required this.type, required this.label, this.orderId, this.itemType, this.itemId});
  final AttentionType type;
  final String label; // shown verbatim, never parsed
  final int? orderId;
  final String? itemType;
  final int? itemId;

  factory AttentionItem.fromJson(Map<String, dynamic> j) => AttentionItem(
        type: AttentionType.fromApi(_str(j['type'])) ?? AttentionType.newTooLong,
        label: _str(j['label']) ?? '',
        orderId: _intOrNull(j['orderId']),
        itemType: _str(j['itemType']),
        itemId: _intOrNull(j['itemId']),
      );
}

class LiveDrop {
  const LiveDrop({required this.id, required this.name, required this.unitsTotal, required this.unitsSold, this.endsAt});
  final int id;
  final String name;
  final int unitsTotal;
  final int unitsSold;
  final DateTime? endsAt;

  double get progress => unitsTotal <= 0 ? 0 : (unitsSold / unitsTotal).clamp(0.0, 1.0);

  factory LiveDrop.fromJson(Map<String, dynamic> j) {
    final ends = _str(j['endsAt']);
    return LiveDrop(
      id: _int(j['id']),
      name: _str(j['name']) ?? '',
      unitsTotal: _int(j['unitsTotal']),
      unitsSold: _int(j['unitsSold']),
      endsAt: ends == null ? null : DateTime.tryParse(ends)?.toLocal(),
    );
  }
}

class SalesDay {
  const SalesDay({required this.date, required this.orders, required this.revenueCents});
  final String date; // YYYY-MM-DD
  final int orders;
  final int revenueCents;

  DateTime? get day => DateTime.tryParse('${date}T12:00:00Z');

  factory SalesDay.fromJson(Map<String, dynamic> j) =>
      SalesDay(date: _str(j['date']) ?? '', orders: _int(j['orders']), revenueCents: _int(j['revenueCents']));
}

class SetupItem {
  const SetupItem({
    required this.key,
    required this.label,
    required this.hint,
    required this.review,
    required this.required,
    required this.done,
    required this.link,
  });
  final String key;
  final String label;
  final String hint;
  final bool review; // kind == REVIEW (the owner ticks it), otherwise AUTO
  final bool required;
  final bool done;
  final String link;

  factory SetupItem.fromJson(Map<String, dynamic> j) => SetupItem(
        key: _str(j['key']) ?? '',
        label: _str(j['label']) ?? '',
        hint: _str(j['hint']) ?? '',
        review: j['kind'] == 'REVIEW',
        required: j['required'] == true,
        done: j['status'] == 'DONE',
        link: _str(j['link']) ?? '',
      );
}

class SetupChecklist {
  const SetupChecklist({required this.complete, required this.items});
  final bool complete;
  final List<SetupItem> items;

  int get doneCount => items.where((i) => i.done).length;

  factory SetupChecklist.fromJson(Map<String, dynamic>? j) => SetupChecklist(
        complete: j?['complete'] == true,
        items: [for (final i in _list(j?['items'])) SetupItem.fromJson(i)],
      );
}

class Overview {
  const Overview({
    required this.today,
    required this.attention,
    required this.liveDrop,
    required this.sales7d,
    required this.recentOrders,
    required this.setup,
  });
  final TodayStats today;
  final List<AttentionItem> attention;
  final LiveDrop? liveDrop;
  final List<SalesDay> sales7d;
  final List<OrderSummary> recentOrders;
  final SetupChecklist setup;

  factory Overview.fromJson(Map<String, dynamic> j) {
    final drop = _map(j['liveDrop']);
    return Overview(
      today: TodayStats.fromJson(_map(j['today'])),
      attention: [for (final a in _list(j['attention'])) AttentionItem.fromJson(a)],
      liveDrop: drop == null ? null : LiveDrop.fromJson(drop),
      sales7d: [for (final d in _list(j['sales7d'])) SalesDay.fromJson(d)],
      recentOrders: [for (final o in _list(j['recentOrders'])) OrderSummary.fromJson(o)],
      setup: SetupChecklist.fromJson(_map(j['setup'])),
    );
  }
}

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/order_status.dart';
import '../../../core/providers.dart';
import 'order_models.dart';

/// Business details printed on invoices (`GET /admin/settings` -> business).
class BusinessInfo {
  const BusinessInfo({required this.name, this.whatsappNumber, this.supportEmail});
  final String name;
  final String? whatsappNumber;
  final String? supportEmail;

  factory BusinessInfo.fromJson(Map<String, dynamic> j) => BusinessInfo(
        name: (j['name'] as String?) ?? 'Stimpy',
        whatsappNumber: j['whatsappNumber'] as String?,
        supportEmail: j['supportEmail'] as String?,
      );
}

/// Every order operation the app uses, over the same endpoints as the web dashboard
/// (website/frontend/admin/src/pages/orders/api.ts). Writes return the server's order, which callers show as is:
/// nothing is flipped optimistically.
class OrdersApi {
  OrdersApi(this._api);
  final ApiClient _api;

  Future<OrderPage> list({
    List<OrderStatus> statuses = const [],
    String? q,
    int page = 1,
    int pageSize = 25,
    String? sort,
  }) async {
    final res = await _api.getJson('/admin/orders', query: {
      if (statuses.isNotEmpty) 'status': statuses.map((s) => s.apiValue).join(','),
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      'sort': ?sort,
      'page': page,
      'pageSize': pageSize,
    });
    return OrderPage.fromJson(res);
  }

  Future<OrderCounts> counts() async => OrderCounts.fromJson(await _api.getJson('/admin/orders/counts'));

  Future<OrderDetail> detail(int id) async => OrderDetail.fromJson(await _api.getJson('/admin/orders/$id'));

  /// `POST /admin/orders/:id/status`. Throws ApiError with code INVALID_TRANSITION (`details.from`),
  /// DELIVERY_NUMBER_REQUIRED or VALIDATION_ERROR (`fields`).
  Future<OrderDetail> changeStatus(
    int id, {
    required OrderStatus to,
    String? note,
    String? cancelReason,
    String? deliveryNumber,
    bool? restock,
  }) async {
    final res = await _api.postJson('/admin/orders/$id/status', body: {
      'to': to.apiValue,
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      if (cancelReason != null) 'cancelReason': cancelReason.trim(),
      if (deliveryNumber != null) 'deliveryNumber': deliveryNumber.trim(),
      'restock': ?restock,
    });
    return OrderDetail.fromJson(res);
  }

  /// Corrects the delivery number of an order that is already out for delivery.
  Future<OrderDetail> setDeliveryNumber(int id, String number) async =>
      OrderDetail.fromJson(await _api.postJson('/admin/orders/$id/delivery', body: {'deliveryNumber': number.trim()}));

  Future<OrderDetail> setCash(int id, {bool? collected, bool? settled}) async =>
      OrderDetail.fromJson(await _api.postJson('/admin/orders/$id/cash', body: {'collected': ?collected, 'settled': ?settled}));

  Future<OrderDetail> addNote(int id, String body) async =>
      OrderDetail.fromJson(await _api.postJson('/admin/orders/$id/notes', body: {'body': body.trim()}));

  Future<OrderDetail> extendHold(int id, int hours) async =>
      OrderDetail.fromJson(await _api.postJson('/admin/orders/$id/extend-hold', body: {'hours': hours}));

  Future<WhatsappMessage> whatsapp(int id, String template) async =>
      WhatsappMessage.fromJson(await _api.getJson('/admin/orders/$id/whatsapp', query: {'template': template}));

  /// Full orders for printing (there is no print endpoint by design: print reads the orders themselves).
  Future<List<OrderDetail>> detailsByIds(List<int> ids) => Future.wait([for (final id in ids) detail(id)]);

  /// Ids of every order matching a tab, in order-number order, up to [cap].
  Future<({List<int> ids, int total})> matchingIds({List<OrderStatus> statuses = const [], String? q, int cap = 100}) async {
    final ids = <int>[];
    var total = 0;
    for (var page = 1; ids.length < cap; page++) {
      final res = await list(statuses: statuses, q: q, page: page, pageSize: 100, sort: 'number');
      total = res.total;
      ids.addAll(res.items.map((o) => o.id));
      if (res.items.length < 100 || ids.length >= res.total) break;
    }
    return (ids: ids.take(cap).toList(), total: total);
  }

  Future<BusinessInfo> business() async {
    final res = await _api.getJson('/admin/settings');
    return BusinessInfo.fromJson((res['business'] as Map).cast<String, dynamic>());
  }
}

final ordersApiProvider = Provider<OrdersApi>((ref) => OrdersApi(ref.watch(apiClientProvider)));

/// Bumped whenever an order is created or changed, so the list and the counts reload (the web's cache invalidation).
final ordersVersionProvider = NotifierProvider<OrdersVersion, int>(OrdersVersion.new);

class OrdersVersion extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final orderCountsProvider = FutureProvider.autoDispose<OrderCounts>((ref) {
  ref.watch(ordersVersionProvider);
  return ref.watch(ordersApiProvider).counts();
});

final businessInfoProvider = FutureProvider.autoDispose<BusinessInfo>((ref) => ref.watch(ordersApiProvider).business());

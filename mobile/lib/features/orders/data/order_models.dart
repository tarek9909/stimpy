import '../../../core/media.dart';
import '../../../core/order_status.dart';

/// Order data as the API returns it (`AdminOrderSummary` for lists, `AdminOrder` for one order). Money is integer
/// cents. Dates are parsed to local time. Unknown statuses fall back to New, like the web.

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
String? _str(Object? v) => v is String ? v : null;
int _int(Object? v) => v is int ? v : (v is num ? v.toInt() : 0);

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.number,
    required this.placedAt,
    required this.status,
    required this.source,
    required this.customerName,
    required this.contactPhone,
    required this.areaName,
    required this.itemsSummary,
    required this.totalCents,
    required this.deliveryNumber,
    required this.cashCollected,
    required this.cashSettled,
    required this.holdExpired,
  });

  final int id;
  final String number;
  final DateTime? placedAt;
  final OrderStatus status;
  final String source;
  final String customerName;
  final String contactPhone;
  final String areaName;
  final String itemsSummary;
  final int totalCents;
  final String? deliveryNumber;
  final bool cashCollected;
  final bool cashSettled;
  final bool holdExpired;

  factory OrderSummary.fromJson(Map<String, dynamic> j) => OrderSummary(
        id: _int(j['id']),
        number: _str(j['number']) ?? '',
        placedAt: _date(j['placedAt']),
        status: OrderStatus.fromApi(_str(j['status'])),
        source: _str(j['source']) ?? 'MANUAL',
        customerName: _str(j['customerName']) ?? '',
        contactPhone: _str(j['contactPhone']) ?? '',
        areaName: _str(j['areaName']) ?? '',
        itemsSummary: _str(j['itemsSummary']) ?? '',
        totalCents: _int(j['totalCents']),
        deliveryNumber: _str(j['deliveryNumber']),
        cashCollected: j['cashCollected'] == true,
        cashSettled: j['cashSettled'] == true,
        holdExpired: j['holdExpired'] == true,
      );
}

/// Where an order came from, as the dashboard labels it.
const Map<String, String> sourceLabels = {
  'WEBSITE': 'Website',
  'INSTAGRAM': 'Instagram DM',
  'WHATSAPP': 'WhatsApp',
  'MANUAL': 'Manual',
};

class OrderPage {
  const OrderPage({required this.items, required this.page, required this.pageSize, required this.total});
  final List<OrderSummary> items;
  final int page;
  final int pageSize;
  final int total;

  bool get hasMore => page * pageSize < total;

  factory OrderPage.fromJson(Map<String, dynamic> j) => OrderPage(
        items: [for (final i in (j['items'] as List)) OrderSummary.fromJson(i as Map<String, dynamic>)],
        page: _int(j['page']),
        pageSize: _int(j['pageSize']),
        total: _int(j['total']),
      );
}

/// Order counts per status (`GET /admin/orders/counts`), for the tab badges.
class OrderCounts {
  const OrderCounts(this.byStatus, this.all);
  final Map<OrderStatus, int> byStatus;
  final int all;

  int of(OrderStatus s) => byStatus[s] ?? 0;
  int get newOrders => of(OrderStatus.newOrder);

  factory OrderCounts.fromJson(Map<String, dynamic> j) =>
      OrderCounts({for (final s in OrderStatus.values) s: _int(j[s.apiValue])}, _int(j['ALL']));
}

class OrderCustomerRef {
  const OrderCustomerRef({required this.id, required this.name, required this.email, required this.phone, required this.whatsapp});
  final int id;
  final String name;
  final String? email;
  final String phone;
  final String whatsapp;

  factory OrderCustomerRef.fromJson(Map<String, dynamic> j) => OrderCustomerRef(
        id: _int(j['id']),
        name: _str(j['name']) ?? '',
        email: _str(j['email']),
        phone: _str(j['phone']) ?? '',
        whatsapp: _str(j['whatsapp']) ?? '',
      );
}

class OrderContact {
  const OrderContact({required this.email, required this.phone, required this.whatsapp});
  final String? email;
  final String phone;
  final String whatsapp;

  factory OrderContact.fromJson(Map<String, dynamic> j) =>
      OrderContact(email: _str(j['email']), phone: _str(j['phone']) ?? '', whatsapp: _str(j['whatsapp']) ?? '');
}

class OrderDelivery {
  const OrderDelivery({required this.areaId, required this.areaName, required this.address, required this.notes});
  final int? areaId;
  final String areaName;
  final String address;
  final String? notes;

  factory OrderDelivery.fromJson(Map<String, dynamic> j) => OrderDelivery(
        areaId: j['areaId'] as int?,
        areaName: _str(j['areaName']) ?? '',
        address: _str(j['address']) ?? '',
        notes: _str(j['notes']),
      );
}

class NamedQty {
  const NamedQty(this.name, this.qty);
  final String name;
  final int qty;
}

class NamedImage {
  const NamedImage(this.name, this.imageUrl);
  final String name;
  final String? imageUrl;
}

/// What the customer chose inside one order line: the design. Pictures come from the order itself; older orders may
/// lack them, in which case the screen falls back to the catalog (see `resolveOrderMedia`).
class OrderItemDetails {
  const OrderItemDetails({
    required this.hoodie,
    required this.color,
    required this.size,
    required this.stimpies,
    required this.stimpieQuantities,
    required this.hoodieImage,
    required this.stimpieImages,
  });

  final String? hoodie;
  final String? color;
  final String? size;
  final List<String> stimpies;
  final List<NamedQty> stimpieQuantities;
  final String? hoodieImage;
  final List<NamedImage> stimpieImages;

  factory OrderItemDetails.fromJson(Map<String, dynamic> j) => OrderItemDetails(
        hoodie: _str(j['hoodie']),
        color: _str(j['color']),
        size: _str(j['size']),
        stimpies: [for (final s in (j['stimpies'] as List? ?? const [])) if (s is String) s],
        stimpieQuantities: [
          for (final s in (j['stimpieQuantities'] as List? ?? const []))
            if (s is Map) NamedQty(_str(s['name']) ?? '', _int(s['qty'])),
        ],
        hoodieImage: resolveMediaUrl(_str(j['hoodieImage'])),
        stimpieImages: [
          for (final s in (j['stimpieImages'] as List? ?? const []))
            if (s is Map) NamedImage(_str(s['name']) ?? '', resolveMediaUrl(_str(s['imageUrl']))),
        ],
      );
}

/// `PACK` (hoodie set), `STIMPIE_PACK` (Stimpie-only offer), `HOODIE`, `STIMPIE`.
class OrderItem {
  const OrderItem({
    required this.id,
    required this.kind,
    required this.name,
    required this.qty,
    required this.unitPriceCents,
    required this.lineTotalCents,
    required this.details,
  });

  final int id;
  final String kind;
  final String name;
  final int qty;
  final int unitPriceCents;
  final int lineTotalCents;
  final OrderItemDetails details;

  bool get isStimpiePack => kind == 'STIMPIE_PACK';

  /// The Stimpies in this line with how many of each (`stimpieQuantities` when present, else one each).
  List<NamedQty> get stimpieList {
    if (details.stimpieQuantities.isNotEmpty) return details.stimpieQuantities;
    return [for (final n in details.stimpies) NamedQty(n, 1)];
  }

  /// A readable one-line description: "Black · M · The Void, The Cedar".
  String get designText {
    final parts = <String>[
      if (!isStimpiePack) ...[?details.hoodie, ?details.color, ?details.size],
      for (final s in stimpieList) s.qty > 1 ? '${s.name} ×${s.qty}' : s.name,
    ];
    return parts.where((p) => p.isNotEmpty).join(' · ');
  }

  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
        id: _int(j['id']),
        kind: _str(j['kind']) ?? 'HOODIE',
        name: _str(j['name']) ?? '',
        qty: _int(j['qty']),
        unitPriceCents: _int(j['unitPriceCents']),
        lineTotalCents: _int(j['lineTotalCents']),
        details: OrderItemDetails.fromJson((j['details'] as Map?)?.cast<String, dynamic>() ?? const {}),
      );
}

class OrderEvent {
  const OrderEvent({required this.id, required this.from, required this.to, required this.at, required this.by, required this.note});
  final int id;
  final OrderStatus? from;
  final OrderStatus to;
  final DateTime? at;
  final String? by;
  final String? note;

  factory OrderEvent.fromJson(Map<String, dynamic> j) => OrderEvent(
        id: _int(j['id']),
        from: j['from'] == null ? null : OrderStatus.fromApi(_str(j['from'])),
        to: OrderStatus.fromApi(_str(j['to'])),
        at: _date(j['at']),
        by: _str(j['by']),
        note: _str(j['note']),
      );
}

class OrderNote {
  const OrderNote({required this.id, required this.body, required this.at, required this.by});
  final int id;
  final String body;
  final DateTime? at;
  final String by;

  factory OrderNote.fromJson(Map<String, dynamic> j) =>
      OrderNote(id: _int(j['id']), body: _str(j['body']) ?? '', at: _date(j['at']), by: _str(j['by']) ?? '');
}

class OrderEmail {
  const OrderEmail({required this.id, required this.template, required this.to, required this.status, required this.at});
  final int id;
  final String template;
  final String to;

  /// PENDING, SENT or FAILED.
  final String status;
  final DateTime? at;

  factory OrderEmail.fromJson(Map<String, dynamic> j) => OrderEmail(
        id: _int(j['id']),
        template: _str(j['template']) ?? '',
        to: _str(j['to']) ?? '',
        status: _str(j['status']) ?? 'PENDING',
        at: _date(j['at']),
      );
}

class OrderWarning {
  const OrderWarning({required this.code, required this.deliveryNumber, required this.orderIds});
  final String code;
  final String deliveryNumber;
  final List<int> orderIds;

  factory OrderWarning.fromJson(Map<String, dynamic> j) => OrderWarning(
        code: _str(j['code']) ?? '',
        deliveryNumber: _str(j['deliveryNumber']) ?? '',
        orderIds: [for (final i in (j['orderIds'] as List? ?? const [])) _int(i)],
      );
}

/// One order in full (`GET /admin/orders/:id`). Buttons for status changes come ONLY from [allowedTransitions]:
/// the server owns the state machine, the app never works out what is allowed.
class OrderDetail {
  const OrderDetail({
    required this.summary,
    required this.customer,
    required this.contact,
    required this.delivery,
    required this.items,
    required this.subtotalCents,
    required this.deliveryFeeCents,
    required this.costCents,
    required this.holdExpiresAt,
    required this.outForDeliveryAt,
    required this.deliveredAt,
    required this.cancelledAt,
    required this.cancelReason,
    required this.events,
    required this.notes,
    required this.emails,
    required this.allowedTransitions,
    required this.warnings,
  });

  final OrderSummary summary;
  final OrderCustomerRef customer;
  final OrderContact contact;
  final OrderDelivery delivery;
  final List<OrderItem> items;
  final int subtotalCents;
  final int deliveryFeeCents;
  final int costCents;
  final DateTime? holdExpiresAt;
  final DateTime? outForDeliveryAt;
  final DateTime? deliveredAt;
  final DateTime? cancelledAt;
  final String? cancelReason;
  final List<OrderEvent> events;
  final List<OrderNote> notes;
  final List<OrderEmail> emails;
  final List<OrderStatus> allowedTransitions;
  final List<OrderWarning> warnings;

  int get id => summary.id;
  String get number => summary.number;
  OrderStatus get status => summary.status;
  DateTime? get placedAt => summary.placedAt;
  String get source => summary.source;
  int get totalCents => summary.totalCents;
  String? get deliveryNumber => summary.deliveryNumber;
  bool get cashCollected => summary.cashCollected;
  bool get cashSettled => summary.cashSettled;
  bool get holdExpired => summary.holdExpired;

  factory OrderDetail.fromJson(Map<String, dynamic> j) => OrderDetail(
        summary: OrderSummary.fromJson(j),
        customer: OrderCustomerRef.fromJson((j['customer'] as Map).cast<String, dynamic>()),
        contact: OrderContact.fromJson((j['contact'] as Map).cast<String, dynamic>()),
        delivery: OrderDelivery.fromJson((j['delivery'] as Map).cast<String, dynamic>()),
        items: [for (final i in (j['items'] as List)) OrderItem.fromJson(i as Map<String, dynamic>)],
        subtotalCents: _int(j['subtotalCents']),
        deliveryFeeCents: _int(j['deliveryFeeCents']),
        costCents: _int(j['costCents']),
        holdExpiresAt: _date(j['holdExpiresAt']),
        outForDeliveryAt: _date(j['outForDeliveryAt']),
        deliveredAt: _date(j['deliveredAt']),
        cancelledAt: _date(j['cancelledAt']),
        cancelReason: _str(j['cancelReason']),
        events: [for (final e in (j['events'] as List? ?? const [])) OrderEvent.fromJson(e as Map<String, dynamic>)],
        notes: [for (final n in (j['notes'] as List? ?? const [])) OrderNote.fromJson(n as Map<String, dynamic>)],
        emails: [for (final e in (j['emails'] as List? ?? const [])) OrderEmail.fromJson(e as Map<String, dynamic>)],
        allowedTransitions: [for (final s in (j['allowedTransitions'] as List? ?? const [])) OrderStatus.fromApi(_str(s))],
        warnings: [for (final w in (j['warnings'] as List? ?? const [])) OrderWarning.fromJson(w as Map<String, dynamic>)],
      );
}

/// A prepared WhatsApp message for the customer (`GET /admin/orders/:id/whatsapp`). [url] is the `wa.me` link.
class WhatsappMessage {
  const WhatsappMessage({required this.to, required this.text, required this.url});
  final String to;
  final String text;
  final String url;

  factory WhatsappMessage.fromJson(Map<String, dynamic> j) =>
      WhatsappMessage(to: _str(j['to']) ?? '', text: _str(j['text']) ?? '', url: _str(j['url']) ?? '');
}

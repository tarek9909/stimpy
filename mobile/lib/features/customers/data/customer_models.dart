import '../../orders/data/order_models.dart';

/// Customer data as the API returns it (`/admin/customers`, `/customers/:id/profile`, `/timeline`, `/tags`, `/notes`).

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
String? _str(Object? v) => v is String ? v : null;
int _int(Object? v) => v is int ? v : (v is num ? v.toInt() : 0);
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const {};

class CustomerTag {
  const CustomerTag({required this.id, required this.name, this.color});
  final int id;
  final String name;

  /// `#rrggbb` or null.
  final String? color;

  factory CustomerTag.fromJson(Map<String, dynamic> j) => CustomerTag(id: _int(j['id']), name: _str(j['name']) ?? '', color: _str(j['color']));
}

/// One row of the customer list.
class CustomerRow {
  const CustomerRow({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.whatsapp,
    required this.ordersCount,
    required this.totalSpentCents,
    required this.lastOrderAt,
    required this.returnedCount,
    required this.warning,
    required this.areaName,
    required this.optedOut,
    required this.tags,
  });

  final int id;
  final String name;
  final String? email;
  final String phone;
  final String whatsapp;
  final int ordersCount;
  final int totalSpentCents;
  final DateTime? lastOrderAt;
  final int returnedCount;
  final bool warning;
  final String? areaName;
  final bool optedOut;
  final List<CustomerTag> tags;

  factory CustomerRow.fromJson(Map<String, dynamic> j) => CustomerRow(
        id: _int(j['id']),
        name: _str(j['name']) ?? '',
        email: _str(j['email']),
        phone: _str(j['phone']) ?? '',
        whatsapp: _str(j['whatsapp']) ?? '',
        ordersCount: _int(j['ordersCount']),
        totalSpentCents: _int(j['totalSpentCents']),
        lastOrderAt: _date(j['lastOrderAt']),
        returnedCount: _int(j['returnedCount']),
        warning: j['warning'] == true,
        areaName: _str(j['areaName']),
        optedOut: j['optedOut'] == true,
        tags: [for (final t in (j['tags'] as List? ?? const [])) if (t is Map) CustomerTag.fromJson(t.cast<String, dynamic>())],
      );
}

class CustomerPage {
  const CustomerPage({required this.items, required this.page, required this.pageSize, required this.total});
  final List<CustomerRow> items;
  final int page;
  final int pageSize;
  final int total;

  bool get hasMore => page * pageSize < total;

  factory CustomerPage.fromJson(Map<String, dynamic> j) => CustomerPage(
        items: [for (final i in (j['items'] as List? ?? const [])) CustomerRow.fromJson(_map(i))],
        page: _int(j['page']),
        pageSize: _int(j['pageSize']),
        total: _int(j['total']),
      );
}

/// `GET /admin/customers/:id/profile`.
class CustomerProfile {
  const CustomerProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.whatsapp,
    required this.areaName,
    required this.optedOut,
    required this.emailConsent,
    required this.whatsappConsent,
    required this.notes,
    required this.createdAt,
    required this.orderCount,
    required this.lifetimeValueCents,
    required this.averageOrderValueCents,
    required this.firstOrderAt,
    required this.lastOrderAt,
    required this.returnedCount,
    required this.warning,
    required this.favouriteStimpie,
    required this.favouriteColor,
    required this.recentOrders,
  });

  final int id;
  final String name;
  final String? email;
  final String phone;
  final String whatsapp;
  final String? areaName;
  final bool optedOut;
  final bool emailConsent;
  final bool whatsappConsent;
  final String? notes;
  final DateTime? createdAt;
  final int orderCount;
  final int lifetimeValueCents;
  final int averageOrderValueCents;
  final DateTime? firstOrderAt;
  final DateTime? lastOrderAt;
  final int returnedCount;
  final bool warning;
  final String? favouriteStimpie;
  final String? favouriteColor;
  final List<OrderSummary> recentOrders;

  /// The number to open in WhatsApp: the WhatsApp number, else the phone.
  String get whatsappNumber => whatsapp.isNotEmpty ? whatsapp : phone;

  factory CustomerProfile.fromJson(Map<String, dynamic> j) => CustomerProfile(
        id: _int(j['id']),
        name: _str(j['name']) ?? '',
        email: _str(j['email']),
        phone: _str(j['phone']) ?? '',
        whatsapp: _str(j['whatsapp']) ?? '',
        areaName: _str(_map(j['area'])['name']),
        optedOut: j['optedOut'] == true,
        emailConsent: j['emailConsent'] == true,
        whatsappConsent: j['whatsappConsent'] == true,
        notes: _str(j['notes']),
        createdAt: _date(j['createdAt']),
        orderCount: _int(j['orderCount']),
        lifetimeValueCents: _int(j['lifetimeValueCents']),
        averageOrderValueCents: _int(j['averageOrderValueCents']),
        firstOrderAt: _date(j['firstOrderAt']),
        lastOrderAt: _date(j['lastOrderAt']),
        returnedCount: _int(j['returnedCount']),
        warning: j['warning'] == true,
        favouriteStimpie: _str(j['favouriteStimpie']),
        favouriteColor: _str(j['favouriteColor']),
        recentOrders: [for (final o in (j['recentOrders'] as List? ?? const [])) OrderSummary.fromJson(_map(o))],
      );
}

/// ORDER, ORDER_EVENT, ORDER_NOTE, EMAIL, FOLLOW_UP or CUSTOMER_NOTE.
class TimelineItem {
  const TimelineItem({required this.id, required this.type, required this.at, required this.title, required this.detail, required this.refId});
  final String id;
  final String type;
  final DateTime? at;
  final String title;
  final String? detail;
  final String? refId;

  factory TimelineItem.fromJson(Map<String, dynamic> j) => TimelineItem(
        id: _str(j['id']) ?? '',
        type: _str(j['type']) ?? '',
        at: _date(j['at']),
        title: _str(j['title']) ?? '',
        detail: _str(j['detail']),
        refId: _str(j['refId']),
      );
}

class TimelinePage {
  const TimelinePage({required this.items, required this.nextCursor});
  final List<TimelineItem> items;
  final String? nextCursor;

  factory TimelinePage.fromJson(Map<String, dynamic> j) => TimelinePage(
        items: [for (final i in (j['items'] as List? ?? const [])) TimelineItem.fromJson(_map(i))],
        nextCursor: _str(j['nextCursor']),
      );
}

class CustomerNote {
  const CustomerNote({required this.id, required this.body, required this.userName, required this.createdAt});
  final int id;
  final String body;
  final String userName;
  final DateTime? createdAt;

  factory CustomerNote.fromJson(Map<String, dynamic> j) =>
      CustomerNote(id: _int(j['id']), body: _str(j['body']) ?? '', userName: _str(j['userName']) ?? '', createdAt: _date(j['createdAt']));
}

class CustomerNotePage {
  const CustomerNotePage({required this.items, required this.page, required this.pageSize, required this.total});
  final List<CustomerNote> items;
  final int page;
  final int pageSize;
  final int total;

  bool get hasMore => page * pageSize < total;

  factory CustomerNotePage.fromJson(Map<String, dynamic> j) => CustomerNotePage(
        items: [for (final i in (j['items'] as List? ?? const [])) CustomerNote.fromJson(_map(i))],
        page: _int(j['page']),
        pageSize: _int(j['pageSize']),
        total: _int(j['total']),
      );
}

/// A customer follow-up (`/admin/follow-ups`). The list only returns open ones; [doneAt] is set once completed.
class FollowUp {
  const FollowUp({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.userName,
    required this.dueAt,
    required this.note,
    required this.doneAt,
  });
  final int id;
  final int customerId;
  final String customerName;
  final String userName;
  final DateTime? dueAt;
  final String note;
  final DateTime? doneAt;

  bool get isDone => doneAt != null;

  factory FollowUp.fromJson(Map<String, dynamic> j) => FollowUp(
        id: _int(j['id']),
        customerId: _int(j['customerId']),
        customerName: _str(j['customerName']) ?? '',
        userName: _str(j['userName']) ?? '',
        dueAt: _date(j['dueAt']),
        note: _str(j['note']) ?? '',
        doneAt: _date(j['doneAt']),
      );
}

class FollowUpPage {
  const FollowUpPage({required this.items, required this.page, required this.pageSize, required this.total});
  final List<FollowUp> items;
  final int page;
  final int pageSize;
  final int total;

  bool get hasMore => page * pageSize < total;

  factory FollowUpPage.fromJson(Map<String, dynamic> j) => FollowUpPage(
        items: [for (final i in (j['items'] as List? ?? const [])) FollowUp.fromJson(_map(i))],
        page: _int(j['page']),
        pageSize: _int(j['pageSize']),
        total: _int(j['total']),
      );
}

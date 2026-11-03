import 'package:stimpy_admin/core/api_client.dart';
import 'package:stimpy_admin/core/api_error.dart';

/// Sample API payloads in the exact shapes of website/docs/openapi.json, so tests exercise the real parsing.

Map<String, dynamic> orderJson({
  int id = 7,
  String number = 'STP-1042',
  String status = 'NEW',
  List<String> allowed = const ['CONFIRMED', 'CANCELLED'],
  String? deliveryNumber,
  bool cashCollected = false,
  bool cashSettled = false,
  bool holdExpired = false,
  String? holdExpiresAt,
  List<Map<String, dynamic>> events = const [],
  List<Map<String, dynamic>> notes = const [],
  List<Map<String, dynamic>> emails = const [],
  List<Map<String, dynamic>> warnings = const [],
  String customerName = 'Rana Haddad',
  String address = 'Building 12, 3rd floor, Hamra Street',
}) =>
    {
      'id': id,
      'number': number,
      'placedAt': '2026-11-03T10:20:00.000Z',
      'status': status,
      'source': 'WEBSITE',
      'customerName': customerName,
      'contactPhone': '+961 71 123 456',
      'areaName': 'Beirut',
      'itemsSummary': '1 × Hoodie + 2 Stimpies, 1 × Stimpy Hoodie',
      'totalCents': 7500,
      'deliveryNumber': deliveryNumber,
      'cashCollected': cashCollected,
      'cashSettled': cashSettled,
      'holdExpired': holdExpired,
      'customer': {'id': 3, 'name': customerName, 'email': 'rana@example.com', 'phone': '+961 71 123 456', 'whatsapp': '+961 71 123 456'},
      'contact': {'email': 'rana@example.com', 'phone': '+961 71 123 456', 'whatsapp': '+961 71 123 456'},
      'delivery': {'areaId': 1, 'areaName': 'Beirut', 'address': address, 'notes': 'Call when you arrive'},
      'items': [
        {
          'id': 1,
          'kind': 'PACK',
          'name': 'Hoodie + 2 Stimpies',
          'qty': 1,
          'unitPriceCents': 4500,
          'lineTotalCents': 4500,
          'details': {
            'hoodie': 'Stimpy Hoodie',
            'color': 'Black',
            'size': 'M',
            'stimpies': ['THE VOID', 'THE CEDAR'],
            'stimpieQuantities': [
              {'name': 'THE VOID', 'qty': 1},
              {'name': 'THE CEDAR', 'qty': 1},
            ],
            'hoodieImage': null,
            'stimpieImages': [
              {'name': 'THE VOID', 'imageUrl': null},
              {'name': 'THE CEDAR', 'imageUrl': null},
            ],
          },
        },
        {
          'id': 2,
          'kind': 'HOODIE',
          'name': 'Stimpy Hoodie',
          'qty': 1,
          'unitPriceCents': 2500,
          'lineTotalCents': 2500,
          'details': {'hoodie': 'Stimpy Hoodie', 'color': 'Coral', 'size': 'L', 'stimpies': <String>[], 'stimpieQuantities': <Map<String, dynamic>>[], 'hoodieImage': null, 'stimpieImages': <Map<String, dynamic>>[]},
        },
      ],
      'subtotalCents': 7000,
      'deliveryFeeCents': 500,
      'costCents': 3000,
      'holdExpiresAt': holdExpiresAt,
      'outForDeliveryAt': null,
      'deliveredAt': null,
      'cancelledAt': null,
      'cancelReason': null,
      'events': events,
      'notes': notes,
      'emails': emails,
      'allowedTransitions': allowed,
      'warnings': warnings,
    };

Map<String, dynamic> pageJson(List<Map<String, dynamic>> items, {int page = 1, int pageSize = 25, int? total}) =>
    {'items': items, 'page': page, 'pageSize': pageSize, 'total': total ?? items.length};

Map<String, dynamic> summaryOf(Map<String, dynamic> order) => {
      for (final k in ['id', 'number', 'placedAt', 'status', 'source', 'customerName', 'contactPhone', 'areaName', 'itemsSummary', 'totalCents', 'deliveryNumber', 'cashCollected', 'cashSettled', 'holdExpired']) k: order[k],
    };

Map<String, dynamic> countsJson({int all = 9, int newOrders = 3}) =>
    {'ALL': all, 'NEW': newOrders, 'CONFIRMED': 2, 'PACKED': 1, 'OUT_FOR_DELIVERY': 1, 'DELIVERED': 1, 'CANCELLED': 1, 'RETURNED': 0};

// ----------------------------------------------------------------- catalog (public endpoints)

Map<String, dynamic> hoodieSummaryJson() => {
      'id': 1,
      'slug': 'stimpy-hoodie',
      'name': 'Stimpy Hoodie',
      'description': 'The hoodie',
      'priceCents': 2500,
      'compareAtPriceCents': null,
      'images': <String>[],
      'colors': [
        {'id': 1, 'name': 'Black', 'hex': '#111111'},
        {'id': 2, 'name': 'Cream', 'hex': '#FFF4E6'},
        {'id': 4, 'name': 'Coral', 'hex': '#FF7A59'},
      ],
      'inStock': true,
    };

Map<String, dynamic> hoodieDetailJson() => {
      ...hoodieSummaryJson(),
      'details': <String>[],
      'sizes': [
        {'id': 1, 'label': 'S', 'position': 1, 'active': true},
        {'id': 2, 'label': 'M', 'position': 2, 'active': true},
        {'id': 3, 'label': 'L', 'position': 3, 'active': true},
      ],
      'variants': [
        for (final c in [1, 2, 4])
          for (final s in [1, 2, 3])
            {
              'colorId': c,
              'sizeId': s,
              // Black L is sold out, Cream M has 2 left.
              'inStock': !(c == 1 && s == 3),
              'remaining': (c == 2 && s == 2) ? 2 : null,
            },
      ],
    };

Map<String, dynamic> stimpieJson(int id, String name, {String status = 'AVAILABLE', bool purchasable = true, int price = 1200, int? remaining}) => {
      'id': id,
      'slug': name.toLowerCase().replaceAll(' ', '-'),
      'name': name,
      'type': 'CORE',
      'priceCents': price,
      'compareAtPriceCents': null,
      'story': '',
      'images': <String>[],
      'artworkUrl': '',
      'status': status,
      'remaining': remaining,
      'purchasable': purchasable,
    };

List<Map<String, dynamic>> stimpiesJson() => [
      stimpieJson(10, 'THE VOID'),
      stimpieJson(11, 'THE CEDAR'),
      stimpieJson(12, 'AFTER DARK', status: 'LOW', remaining: 3),
      stimpieJson(13, 'THE FLAME', status: 'SOLD_OUT', purchasable: false),
    ];

List<Map<String, dynamic>> packsJson() => [
      {'id': 6, 'type': 'HOODIE_SET', 'slug': 'hoodie-1', 'name': 'Hoodie + 1 Stimpie', 'description': '', 'stimpieCount': 1, 'eligibleStimpieIds': null, 'priceCents': 3500, 'compareAtPriceCents': null, 'badge': null},
      {'id': 7, 'type': 'HOODIE_SET', 'slug': 'hoodie-2', 'name': 'Hoodie + 2 Stimpies', 'description': '', 'stimpieCount': 2, 'eligibleStimpieIds': null, 'priceCents': 4500, 'compareAtPriceCents': null, 'badge': 'Most popular'},
      {'id': 2, 'type': 'STIMPIE_ONLY', 'slug': 'two', 'name': '2 Stimpies', 'description': '', 'stimpieCount': 2, 'eligibleStimpieIds': null, 'priceCents': 2000, 'compareAtPriceCents': null, 'badge': null},
    ];

Map<String, dynamic> feesJson() => {
      'defaultFeeCents': 500,
      'areas': [
        {'id': 1, 'name': 'Beirut', 'feeCents': null, 'estDays': null},
        {'id': 2, 'name': 'Mount Lebanon', 'feeCents': 700, 'estDays': null},
      ],
      'estimateText': '4–5 business days',
    };

// ----------------------------------------------------------------- a fake API

/// Records every request and answers from [handlers] (keys like `GET /admin/orders/7`). A handler may return a map,
/// or throw an [ApiError] to simulate a server refusal.
class FakeApi extends ApiClient {
  FakeApi({Map<String, Object? Function(Map<String, dynamic>? query, Object? body)>? handlers})
      : handlers = handlers ?? {},
        super(baseUrl: 'http://fake.test/api/v1');

  final Map<String, Object? Function(Map<String, dynamic>? query, Object? body)> handlers;
  final List<({String method, String path, Map<String, dynamic>? query, Object? body})> calls = [];

  Iterable<({String method, String path, Map<String, dynamic>? query, Object? body})> where(String method, String path) =>
      calls.where((c) => c.method == method && c.path == path);

  Map<String, dynamic> _answer(String method, String path, Map<String, dynamic>? query, Object? body) {
    calls.add((method: method, path: path, query: query, body: body));
    final handler = handlers['$method $path'];
    if (handler == null) throw StateError('FakeApi: no handler for $method $path');
    final result = handler(query, body);
    return (result as Map).cast<String, dynamic>();
  }

  @override
  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query}) async => _answer('GET', path, query, null);

  @override
  Future<Map<String, dynamic>> postJson(String path, {Object? body}) async => _answer('POST', path, null, body);
}

/// A FakeApi that serves the catalog endpoints used by the New order form.
FakeApi catalogApi({Map<String, Object? Function(Map<String, dynamic>? query, Object? body)>? more}) => FakeApi(handlers: {
      'GET /products/hoodies': (_, _) => pageJson([hoodieSummaryJson()], pageSize: 100),
      'GET /products/hoodies/stimpy-hoodie': (_, _) => hoodieDetailJson(),
      'GET /products/stimpies': (_, _) => pageJson(stimpiesJson(), pageSize: 100),
      'GET /packs': (_, _) => pageJson(packsJson(), pageSize: 100),
      'GET /delivery/fees': (_, _) => feesJson(),
      ...?more,
    });

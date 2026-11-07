// End-to-end check of the app's own code against a REAL running API: request builder, models, error handling, status
// flow, cash, notes, WhatsApp, search, print data. It creates orders, so point it at a scratch database, never at data
// you care about. It is skipped unless a URL is given:
//
//   flutter test test/live_api_test.dart \
//     --dart-define=LIVE_API=http://localhost:4100/api/v1 \
//     --dart-define=LIVE_EMAIL=owner@stimpy.local --dart-define=LIVE_PASSWORD=...
import 'package:flutter_test/flutter_test.dart';
import 'package:stimpy_admin/core/api_client.dart';
import 'package:stimpy_admin/core/api_error.dart';
import 'package:stimpy_admin/core/order_status.dart';
import 'package:stimpy_admin/features/orders/data/order_models.dart';
import 'package:stimpy_admin/features/orders/data/orders_api.dart';
import 'package:stimpy_admin/features/orders/new_order/customer_search.dart';
import 'package:stimpy_admin/features/orders/new_order/order_catalog.dart';
import 'package:stimpy_admin/features/orders/new_order/order_line.dart';
import 'package:stimpy_admin/features/orders/new_order/order_validation.dart';

const liveApi = String.fromEnvironment('LIVE_API');
const liveEmail = String.fromEnvironment('LIVE_EMAIL');
const livePassword = String.fromEnvironment('LIVE_PASSWORD');

void main() {
  late ApiClient api;
  late OrdersApi orders;
  late OrderCatalog catalog;

  Map<String, dynamic> body(List<OrderLine> lines, {String status = 'CONFIRMED', String phone = '03 000 111', String name = 'App Test Customer'}) => buildOrderBody(
        source: 'WHATSAPP',
        initialStatus: status,
        sendEmail: false,
        name: name,
        phone: phone,
        whatsappSame: true,
        whatsapp: '',
        email: '',
        areaId: catalog.fees.areas.first.id,
        areaName: catalog.fees.areas.first.name,
        address: 'Test building, 1st floor, Test street',
        notes: 'Created by the app test',
        lines: lines,
      );

  // Orders this run created, so they can be cancelled at the end (which also returns their stock).
  final created = <int>[];

  Future<OrderDetail> create(List<OrderLine> lines, {String status = 'CONFIRMED'}) async {
    final order = OrderDetail.fromJson(await api.postJson('/admin/orders', body: body(lines, status: status)));
    created.add(order.id);
    return order;
  }

  /// A hoodie line for the best-stocked colour and size right now (uncounted stock first), from fresh counts.
  Future<HoodieLine> hoodieLine({int qty = 1}) async {
    final h = (await loadOrderCatalog(api)).hoodies.first;
    HoodieLine? best;
    var bestLeft = -1;
    for (final c in h.colors) {
      for (final s in h.sizes) {
        final v = h.variant(c.id, s.id);
        if (v == null || !v.inStock) continue;
        final left = v.remaining ?? 1000000;
        if (left >= qty && left > bestLeft) {
          bestLeft = left;
          best = HoodieLine(hoodieId: h.id, colorId: c.id, sizeId: s.id, qty: qty);
        }
      }
    }
    return best ?? (throw StateError('no hoodie in stock'));
  }

  group('against a real API', skip: liveApi.isEmpty ? 'Pass --dart-define=LIVE_API=<url> to run against a real API' : null, () {
    setUpAll(() async {
      api = ApiClient(baseUrl: liveApi);
      await api.postJson('/auth/login', body: {'email': liveEmail, 'password': livePassword});
      orders = OrdersApi(api);
      catalog = await loadOrderCatalog(api);
    });

    tearDownAll(() async {
      for (final id in created) {
        try {
          final o = await orders.detail(id);
          if (o.allowedTransitions.contains(OrderStatus.cancelled)) {
            await orders.changeStatus(id, to: OrderStatus.cancelled, cancelReason: 'App test cleanup');
          }
        } on ApiError {
          // already closed
        }
      }
    });

    test('the catalog loads through the same endpoints the dashboard uses', () {
      expect(catalog.hoodies, isNotEmpty);
      expect(catalog.hoodies.first.colors, isNotEmpty);
      expect(catalog.hoodies.first.sizes, isNotEmpty);
      expect(catalog.packs, isNotEmpty);
      expect(catalog.fees.areas, isNotEmpty);
      expect(catalog.fees.defaultFeeCents, greaterThan(0));
    });

    test('a hoodie order is created and the app\'s estimate equals the server\'s price', () async {
      final line = await hoodieLine();
      final order = await create([line]);
      expect(order.status, OrderStatus.confirmed);
      expect(order.items.single.kind, 'HOODIE');
      final estimate = OrderTotals.of([line], catalog, catalog.fees.areas.first.id);
      expect(order.subtotalCents, estimate.subtotalCents);
      expect(order.deliveryFeeCents, estimate.deliveryCents);
      expect(order.totalCents, estimate.totalCents);
    });

    test('all four kinds of line are accepted in one order, at the prices the app showed', () async {
      final fresh = await loadOrderCatalog(api);
      final stimpies = fresh.orderableStimpies;
      if (stimpies.length < 3) {
        markTestSkipped('needs at least 3 Stimpies on sale in the scratch data');
        return;
      }
      final set = fresh.hoodieSets.firstWhere((p) => p.stimpieCount <= 2);
      final h = fresh.hoodies.first;
      final free = [for (final c in h.colors) for (final s in h.sizes) if (h.available(c.id, s.id) && (h.variant(c.id, s.id)!.remaining ?? 99) >= 2) (c.id, s.id)];
      final offer = fresh.stimpieOffers.firstWhere((p) => p.stimpieCount == 2);
      final lines = <OrderLine>[
        HoodieLine(hoodieId: h.id, colorId: free.first.$1, sizeId: free.first.$2),
        HoodieSetLine(packId: set.id, hoodieId: h.id, colorId: free.first.$1, sizeId: free.first.$2, stimpieIds: stimpies.take(set.stimpieCount).map((s) => s.id).toList()),
        StimpieLine(stimpieId: stimpies[2].id),
        StimpiePackLine(packId: offer.id, stimpies: {stimpies[0].id: 1, stimpies[1].id: 1}),
      ];
      for (final l in lines) {
        expect(l.problem(fresh), isNull, reason: 'the app would not let you add this line');
      }
      final order = await create(lines);
      expect(order.items.map((i) => i.kind).toSet(), {'HOODIE', 'PACK', 'STIMPIE', 'STIMPIE_PACK'});
      final estimate = OrderTotals.of(lines, fresh, fresh.fees.areas.first.id);
      expect(order.totalCents, estimate.totalCents);
      // The designs the order prints and shows: names and quantities come back in the order itself.
      final pack = order.items.firstWhere((i) => i.kind == 'STIMPIE_PACK');
      expect(pack.stimpieList.length, 2);
    });

    test('the full life of an order: confirm, pack, send out, deliver, collect, settle, return', () async {
      var order = await create([await hoodieLine()]);
      Future<OrderDetail> to(OrderStatus s, {String? deliveryNumber, String? note, bool? restock}) async {
        expect(order.allowedTransitions, contains(s), reason: 'the server must offer ${s.label} from ${order.status.label}');
        order = await orders.changeStatus(order.id, to: s, deliveryNumber: deliveryNumber, note: note, restock: restock);
        expect(order.status, s);
        return order;
      }

      await to(OrderStatus.packed, note: 'Packed with care');
      expect(order.events.first.note, 'Packed with care'); // events come newest first

      // Sending out needs a delivery number.
      expect(
        () => orders.changeStatus(order.id, to: OrderStatus.outForDelivery),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', anyOf('DELIVERY_NUMBER_REQUIRED', 'VALIDATION_ERROR'))),
      );
      await to(OrderStatus.outForDelivery, deliveryNumber: 'APPTEST-${DateTime.now().millisecondsSinceEpoch}');
      expect(order.deliveryNumber, startsWith('APPTEST-'));

      await to(OrderStatus.delivered);
      expect(order.cashCollected, isTrue, reason: 'the server marks the cash collected when an order is delivered');
      order = await orders.setCash(order.id, collected: false);
      expect(order.cashCollected, isFalse);
      order = await orders.setCash(order.id, collected: true);
      expect(order.cashCollected, isTrue);
      order = await orders.setCash(order.id, settled: true);
      expect(order.cashSettled, isTrue);

      // A delivered order can only be returned, and returning resets the cash flags.
      expect(allowedOf(order), [OrderStatus.returned]);
      await to(OrderStatus.returned, restock: true);
      expect(order.cashCollected, isFalse);
      expect(order.cashSettled, isFalse);
      expect(order.allowedTransitions, isEmpty);
    });

    test('cancelling stores the reason; a second change is refused with INVALID_TRANSITION and says where the order is', () async {
      var order = await create([await hoodieLine()], status: 'NEW');
      expect(order.status, OrderStatus.newOrder);
      expect(order.holdExpiresAt, isNotNull);
      final extended = await orders.extendHold(order.id, 12);
      expect(extended.holdExpiresAt!.isAfter(order.holdExpiresAt!), isTrue);

      order = await orders.changeStatus(order.id, to: OrderStatus.cancelled, cancelReason: 'Customer changed mind');
      expect(order.status, OrderStatus.cancelled);
      expect(order.cancelReason, 'Customer changed mind');

      await expectLater(
        orders.changeStatus(order.id, to: OrderStatus.confirmed),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'INVALID_TRANSITION').having((e) => e.details?['from'], 'details.from', 'CANCELLED')),
      );
    });

    test('a note is stored with who wrote it; the WhatsApp message and link are ready', () async {
      final order = await create([await hoodieLine()]);
      final withNote = await orders.addNote(order.id, 'Call before delivering');
      expect(withNote.notes.first.body, 'Call before delivering'); // notes come newest first
      expect(withNote.notes.first.by, isNotEmpty);

      final message = await orders.whatsapp(order.id, 'order_confirmation');
      expect(message.url, startsWith('https://wa.me/'));
      expect(message.text, contains(order.number));
    });

    test('too much stock is refused with the details the app shows', () async {
      // Earlier orders in this run used some stock, so read the current counts (as the app does each time it opens).
      final h = (await loadOrderCatalog(api)).hoodies.first;
      final limited = [for (final c in h.colors) for (final s in h.sizes) if (h.variant(c.id, s.id)?.remaining != null && h.variant(c.id, s.id)!.inStock) (c.id, s.id, h.variant(c.id, s.id)!.remaining!)];
      if (limited.isEmpty) {
        markTestSkipped('no size with a limited count in the scratch data');
        return;
      }
      final (c, s, left) = limited.first;
      final tooMany = HoodieLine(hoodieId: h.id, colorId: c, sizeId: s, qty: left + 1 > 10 ? 10 : left + 1);
      if (tooMany.qty <= left) {
        markTestSkipped('limit is above the maximum quantity');
        return;
      }
      await expectLater(
        api.postJson('/admin/orders', body: body([tooMany])),
        throwsA(isA<ApiError>()
            .having((e) => e.code, 'code', 'SOLD_OUT')
            .having((e) => describeStockProblems('SOLD_OUT', e.details!['items'] as List).values.single, 'sentence', contains('available $left'))),
      );
    });

    test('a bad phone number comes back as a message for the phone field', () async {
      try {
        await api.postJson('/admin/orders', body: body([await hoodieLine()], phone: '12'));
        fail('the server should have refused the phone number');
      } on ApiError catch (e) {
        final mapped = mapServerFields(e.fields);
        expect(mapped.fieldErrors['phone'], isNotNull);
        expect(mapped.fieldErrors['phone'], contains('phone number'));
      }
    });

    test('the list, search, counts and print data work on real orders', () async {
      final order = await create([await hoodieLine()], status: 'NEW');

      final page = await orders.list(statuses: [OrderStatus.newOrder], q: order.number);
      expect(page.items.map((o) => o.id), contains(order.id));
      expect(page.items.every((o) => o.status == OrderStatus.newOrder), isTrue);

      final counts = await orders.counts();
      expect(counts.newOrders, greaterThanOrEqualTo(1));
      expect(counts.all, greaterThanOrEqualTo(counts.newOrders));

      // Print reads full orders by id: the same data the invoice, label and delivery sheet use.
      final ids = await orders.matchingIds(statuses: [OrderStatus.newOrder], q: order.number);
      expect(ids.ids, contains(order.id));
      final full = await orders.detailsByIds(ids.ids);
      expect(full.single.items, isNotEmpty);
      expect(full.single.delivery.address, isNotEmpty);

      final business = await orders.business();
      expect(business.name, isNotEmpty);
    });

    test('an existing customer can be found by name or phone', () async {
      final res = await api.getJson('/admin/customers', query: {'q': 'App Test', 'pageSize': 20});
      final hits = [for (final i in (res['items'] as List)) CustomerHit.fromJson(i as Map<String, dynamic>)];
      expect(hits, isNotEmpty);
      expect(hits.first.name, 'App Test Customer');
      expect(hits.first.phone, isNotEmpty);
    });
  });
}

/// The statuses the server allows next, as the app reads them.
List<OrderStatus> allowedOf(OrderDetail o) => o.allowedTransitions;

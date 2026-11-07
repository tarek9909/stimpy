import 'package:flutter_test/flutter_test.dart';
import 'package:stimpy_admin/core/order_status.dart';
import 'package:stimpy_admin/core/money.dart';
import 'package:stimpy_admin/core/media.dart';
import 'package:stimpy_admin/core/time_ago.dart';
import 'package:stimpy_admin/features/orders/data/order_models.dart';
import 'package:stimpy_admin/features/orders/detail/order_media.dart';
import 'package:stimpy_admin/features/orders/detail/status_actions.dart';
import 'package:stimpy_admin/features/orders/new_order/order_catalog.dart';
import 'package:stimpy_admin/features/orders/new_order/order_line.dart';
import 'package:stimpy_admin/features/orders/new_order/order_validation.dart';
import 'package:stimpy_admin/features/orders/print/order_printer.dart';

import 'support/fixtures.dart';

OrderCatalog catalog() => OrderCatalog(
      hoodies: [OrderHoodie.fromJson(hoodieSummaryJson(), hoodieDetailJson())],
      stimpies: [for (final s in stimpiesJson()) OrderStimpie.fromJson(s)],
      packs: [for (final p in packsJson()) OrderPack.fromJson(p)],
      fees: DeliveryFees.fromJson(feesJson()),
    );

void main() {
  group('order parsing (shapes from openapi.json)', () {
    test('an order keeps its designs, money, contact and the server\'s allowed transitions', () {
      final o = OrderDetail.fromJson(orderJson(status: 'NEW', allowed: ['CONFIRMED', 'CANCELLED']));
      expect(o.number, 'STP-1042');
      expect(o.status, OrderStatus.newOrder);
      expect(o.items.length, 2);
      expect(o.items.first.kind, 'PACK');
      expect(o.items.first.designText, 'Stimpy Hoodie · Black · M · THE VOID · THE CEDAR');
      expect(o.items.last.designText, 'Stimpy Hoodie · Coral · L');
      expect(o.subtotalCents + o.deliveryFeeCents, o.totalCents);
      expect(o.allowedTransitions, [OrderStatus.confirmed, OrderStatus.cancelled]);
      expect(o.contact.phone, '+961 71 123 456');
    });

    test('a Stimpie-only offer lists its designs without hoodie details, with quantities', () {
      final item = OrderItem.fromJson({
        'id': 1,
        'kind': 'STIMPIE_PACK',
        'name': '3 Stimpies',
        'qty': 1,
        'unitPriceCents': 2700,
        'lineTotalCents': 2700,
        'details': {
          'hoodie': null,
          'color': null,
          'size': null,
          'stimpies': ['THE VOID', 'THE CEDAR'],
          'stimpieQuantities': [
            {'name': 'THE VOID', 'qty': 2},
            {'name': 'THE CEDAR', 'qty': 1},
          ],
          'hoodieImage': null,
          'stimpieImages': [],
        },
      });
      expect(item.designText, 'THE VOID ×2 · THE CEDAR');
    });

    test('an unknown status falls back to New like the web, a list page knows when there is more', () {
      expect(OrderSummary.fromJson({...summaryOf(orderJson()), 'status': 'SOMETHING'}).status, OrderStatus.newOrder);
      final page = OrderPage.fromJson(pageJson([summaryOf(orderJson())], pageSize: 1, total: 3));
      expect(page.hasMore, isTrue);
      expect(OrderPage.fromJson(pageJson([summaryOf(orderJson())], total: 1)).hasMore, isFalse);
    });

    test('counts per status', () {
      final c = OrderCounts.fromJson(countsJson(all: 9, newOrders: 3));
      expect(c.newOrders, 3);
      expect(c.all, 9);
      expect(c.of(OrderStatus.packed), 1);
    });
  });

  group('status actions come only from the server\'s allowed transitions', () {
    test('New: Confirm is the main button, Cancel waits under More', () {
      final plan = StatusActionPlan.from([OrderStatus.confirmed, OrderStatus.cancelled]);
      expect(plan.primary, OrderStatus.confirmed);
      expect(plan.more, [OrderStatus.cancelled]);
    });

    test('Out for delivery: Delivered leads, then Return, then Cancel', () {
      final plan = StatusActionPlan.from([OrderStatus.cancelled, OrderStatus.returned, OrderStatus.delivered]);
      expect(plan.primary, OrderStatus.delivered);
      expect(plan.more, [OrderStatus.returned, OrderStatus.cancelled]);
    });

    test('Delivered with only a return left has no blue button; nothing allowed shows nothing', () {
      final plan = StatusActionPlan.from([OrderStatus.returned]);
      expect(plan.primary, isNull);
      expect(plan.more, [OrderStatus.returned]);
      expect(StatusActionPlan.from(const []).isEmpty, isTrue);
    });

    test('New is never offered as an action: nothing leads back to it', () {
      expect(StatusActionPlan.from([OrderStatus.newOrder]).isEmpty, isTrue);
    });
  });

  group('order lines produce the API cart items', () {
    test('hoodie', () {
      expect(const HoodieLine(hoodieId: 1, colorId: 2, sizeId: 3, qty: 2).toJson(), {'kind': 'hoodie', 'hoodieId': 1, 'colorId': 2, 'sizeId': 3, 'qty': 2});
    });

    test('hoodie set uses kind "pack" with the chosen Stimpies', () {
      expect(const HoodieSetLine(packId: 7, hoodieId: 1, colorId: 1, sizeId: 2, stimpieIds: [10, 11]).toJson(), {
        'kind': 'pack',
        'packId': 7,
        'hoodieId': 1,
        'colorId': 1,
        'sizeId': 2,
        'stimpieIds': [10, 11],
        'qty': 1,
      });
    });

    test('single Stimpie and Stimpie offer (zero counts are left out)', () {
      expect(const StimpieLine(stimpieId: 10, qty: 3).toJson(), {'kind': 'stimpie', 'stimpieId': 10, 'qty': 3});
      expect(const StimpiePackLine(packId: 2, stimpies: {10: 2, 11: 0}).toJson(), {
        'kind': 'stimpie_pack',
        'packId': 2,
        'stimpies': [
          {'stimpieId': 10, 'qty': 2},
        ],
        'qty': 1,
      });
    });
  });

  group('order line rules (same as the web form)', () {
    final c = catalog();

    test('a sold-out hoodie colour and size cannot be added', () {
      expect(const HoodieLine(hoodieId: 1, colorId: 1, sizeId: 3).problem(c), 'That colour and size is sold out.');
      expect(const HoodieLine(hoodieId: 1, colorId: 1, sizeId: 2).problem(c), isNull);
    });

    test('missing choices are named in the order the editor asks for them', () {
      expect(const HoodieLine(hoodieId: 0, colorId: 0, sizeId: 0).problem(c), 'Choose a hoodie.');
      expect(const HoodieLine(hoodieId: 1, colorId: 0, sizeId: 0).problem(c), 'Choose a colour.');
      expect(const HoodieLine(hoodieId: 1, colorId: 1, sizeId: 0).problem(c), 'Choose a size.');
    });

    test('a hoodie set needs exactly its number of different Stimpies', () {
      const two = HoodieSetLine(packId: 7, hoodieId: 1, colorId: 1, sizeId: 1, stimpieIds: [10]);
      expect(two.problem(c), 'Choose exactly 2 different Stimpies.');
      expect(const HoodieSetLine(packId: 7, hoodieId: 1, colorId: 1, sizeId: 1, stimpieIds: [10, 10]).problem(c), 'Pick different Stimpies: a set has no repeats.');
      expect(const HoodieSetLine(packId: 7, hoodieId: 1, colorId: 1, sizeId: 1, stimpieIds: [10, 11]).problem(c), isNull);
    });

    test('a Stimpie offer needs exactly its count across designs, repeats allowed', () {
      expect(const StimpiePackLine(packId: 2, stimpies: {10: 1}).problem(c), 'Choose exactly 2 Stimpies across the designs.');
      expect(const StimpiePackLine(packId: 2, stimpies: {10: 2}).problem(c), isNull);
      expect(const StimpiePackLine(packId: 2, stimpies: {10: 1, 11: 1}).problem(c), isNull);
    });

    test('quantity is 1 to 10', () {
      expect(const HoodieLine(hoodieId: 1, colorId: 1, sizeId: 1, qty: 11).problem(c), 'Quantity must be 1 to 10.');
    });

    test('a set is priced at the set price, an offer at the offer price, and totals add the area fee', () {
      const lines = <OrderLine>[
        HoodieSetLine(packId: 7, hoodieId: 1, colorId: 1, sizeId: 1, stimpieIds: [10, 11], qty: 2), // 2 × 45.00
        StimpiePackLine(packId: 2, stimpies: {10: 2}), // 20.00
        HoodieLine(hoodieId: 1, colorId: 2, sizeId: 1), // 25.00
      ];
      final beirut = OrderTotals.of(lines, c, 1); // default fee 5.00
      expect(beirut.subtotalCents, 9000 + 2000 + 2500);
      expect(beirut.deliveryCents, 500);
      final mountLebanon = OrderTotals.of(lines, c, 2); // area fee 7.00
      expect(mountLebanon.totalCents, 13500 + 700);
    });
  });

  group('form validation and server messages', () {
    final c = catalog();
    const goodLines = <OrderLine>[HoodieLine(hoodieId: 1, colorId: 1, sizeId: 1)];

    Map<String, String> check({String name = 'Rana Haddad', String phone = '03 123 456', bool same = true, String whatsapp = '', String email = '', String area = 'Beirut', String address = 'Hamra Street, building 12', List<OrderLine> lines = goodLines}) =>
        validateOrderForm(name: name, phone: phone, whatsappSame: same, whatsapp: whatsapp, email: email, areaName: area, address: address, notes: '', lines: lines, catalog: c);

    test('a complete form has no problems', () => expect(check(), isEmpty));

    test('each field is checked with the web wording', () {
      final e = check(name: 'R', phone: ' ', same: false, whatsapp: '', email: 'nope', area: '', address: 'abc', lines: const []);
      expect(e['name'], "Enter the customer's name (at least 2 characters).");
      expect(e['phone'], 'Enter a phone number.');
      expect(e['whatsapp'], contains('WhatsApp number'));
      expect(e['email'], 'Enter a valid email address.');
      expect(e['areaName'], 'Enter the area.');
      expect(e['address'], 'Enter the full address (at least 5 characters).');
      expect(e['items'], 'Add at least one item.');
    });

    test('an invalid line is reported with its position', () {
      expect(check(lines: const [HoodieLine(hoodieId: 1, colorId: 1, sizeId: 3)])['items'], 'Item 1: That colour and size is sold out.');
    });

    test('the API\'s field paths land on the form fields; unknown ones are not lost', () {
      final m = mapServerFields({'customer.phone': 'Enter a Lebanese phone number, like 03 123 456.', 'delivery.address': 'Too short', 'items.0.qty': 'Quantity must be 1 to 10.', 'weird': 'Something else'});
      expect(m.fieldErrors['phone'], contains('Lebanese'));
      expect(m.fieldErrors['address'], 'Too short');
      expect(m.fieldErrors['items'], 'Quantity must be 1 to 10.');
      expect(m.leftovers, ['Something else']);
    });

    test('stock problems become one sentence per line', () {
      final sold = describeStockProblems('SOLD_OUT', [
        {'itemIndex': 1, 'name': 'Stimpy Hoodie', 'requested': 2, 'available': 1},
      ]);
      expect(sold[1], 'Stimpy Hoodie: requested 2, available 1');
      final blocked = describeStockProblems('NOT_PURCHASABLE', [
        {'itemIndex': 0, 'name': 'THE FLAME', 'reason': 'DROP_ENDED'},
        {'itemIndex': 0, 'name': 'THE MOTH', 'reason': 'INACTIVE'},
      ]);
      expect(blocked[0], "THE FLAME: Drop has ended; THE MOTH: Hidden");
    });
  });

  group('pictures for designs', () {
    test('the order\'s own pictures win; the catalog fills the gaps by name', () {
      final order = OrderDetail.fromJson(orderJson());
      final c = OrderCatalog(
        hoodies: [OrderHoodie.fromJson({...hoodieSummaryJson(), 'images': ['http://localhost:4000/uploads/h.png']}, hoodieDetailJson())],
        stimpies: [
          OrderStimpie.fromJson({...stimpieJson(10, 'THE VOID'), 'artworkUrl': 'http://localhost:4000/uploads/void.png'}),
        ],
        packs: const [],
        fees: DeliveryFees.fromJson(feesJson()),
      );
      final withoutCatalog = resolveItemMedia(order.items.first, null);
      expect(withoutCatalog.hoodieImage, isNull);
      expect(withoutCatalog.complete, isFalse);

      final media = resolveItemMedia(order.items.first, c);
      expect(media.hoodieImage, isNotNull);
      expect(media.stimpies.map((s) => s.name), ['THE VOID', 'THE CEDAR']);
      expect(media.stimpies.first.imageUrl, isNotNull); // found by name
      expect(media.stimpies.last.imageUrl, isNull); // THE CEDAR has no picture anywhere
    });

    test('localhost picture links are pointed at the API host so a phone can open them', () {
      expect(resolveMediaUrl('http://localhost:4000/uploads/a.png', apiBase: 'http://192.168.10.127:4000/api/v1'), 'http://192.168.10.127:4000/uploads/a.png');
      expect(resolveMediaUrl('https://cdn.stimpy.com/a.png', apiBase: 'http://192.168.10.127:4000/api/v1'), 'https://cdn.stimpy.com/a.png');
      expect(resolveMediaUrl(null), isNull);
    });
  });

  group('small helpers', () {
    test('money is dollars with two decimals', () {
      expect(formatCents(7500), r'$75.00');
      expect(formatCents(1240), r'$12.40');
      expect(formatCents(0), r'$0.00');
    });

    test('time ago', () {
      final now = DateTime(2026, 11, 3, 15, 0);
      expect(timeAgo(now.subtract(const Duration(seconds: 10)), now: now), 'just now');
      expect(timeAgo(now.subtract(const Duration(minutes: 5)), now: now), '5 min ago');
      expect(timeAgo(now.subtract(const Duration(hours: 2)), now: now), '2 h ago');
      expect(timeAgo(DateTime(2026, 11, 2, 9), now: now), 'Yesterday');
    });
  });

  group('print grouping (same groups as the web)', () {
    final a = OrderDetail.fromJson(orderJson(id: 1, number: 'STP-1', deliveryNumber: 'D-2'));
    final b = OrderDetail.fromJson(orderJson(id: 2, number: 'STP-2', deliveryNumber: 'D-1'));
    final cOrder = OrderDetail.fromJson({...orderJson(id: 3, number: 'STP-3'), 'delivery': {'areaId': 2, 'areaName': 'Mount Lebanon', 'address': 'Somewhere', 'notes': null}});

    test('no grouping keeps one group', () => expect(groupOrders([a, b], PrintGroup.none).single.orders.length, 2));

    test('by area, sorted by name, titled like the web', () {
      final groups = groupOrders([a, cOrder, b], PrintGroup.area);
      expect(groups.map((g) => g.title), ['Area: Beirut', 'Area: Mount Lebanon']);
      expect(groups.first.orders.length, 2);
    });

    test('by delivery number names orders without one', () {
      final groups = groupOrders([a, b, cOrder], PrintGroup.delivery);
      expect(groups.map((g) => g.key), ['D-1', 'D-2', 'No delivery number']);
    });
  });
}

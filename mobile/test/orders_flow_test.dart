import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:stimpy_admin/core/api_error.dart';
import 'package:stimpy_admin/core/providers.dart';
import 'package:stimpy_admin/features/orders/detail/order_detail_screen.dart';
import 'package:stimpy_admin/features/orders/list/orders_list_screen.dart';
import 'package:stimpy_admin/features/orders/new_order/new_order_screen.dart';
import 'package:stimpy_admin/theme/app_theme.dart';
import 'package:stimpy_admin/ui/color_swatch.dart';
import 'package:stimpy_admin/ui/select_chip.dart';
import 'package:stimpy_admin/ui/status_pill.dart';

import 'support/fixtures.dart';

void phone(WidgetTester tester) {
  tester.view.devicePixelRatio = 2;
  tester.view.physicalSize = const Size(780, 1688);
  addTearDown(tester.view.reset);
}

Widget app(FakeApi api, Widget home) => ProviderScope(
      overrides: <Override>[apiClientProvider.overrideWithValue(api)],
      child: MaterialApp(theme: buildAppTheme(), home: home),
    );

/// A router so `context.push('/orders/7')` works; records where it went.
Widget routedApp(FakeApi api, Widget home, List<String> visited) => ProviderScope(
      overrides: <Override>[apiClientProvider.overrideWithValue(api)],
      child: MaterialApp.router(
        theme: buildAppTheme(),
        routerConfig: GoRouter(routes: [
          GoRoute(path: '/', builder: (_, _) => home),
          GoRoute(
            path: '/orders/:id',
            builder: (_, state) {
              visited.add(state.matchedLocation);
              return const Scaffold(body: Text('detail page'));
            },
          ),
          GoRoute(path: '/orders/new', builder: (_, _) {
            visited.add('/orders/new');
            return const Scaffold(body: Text('new order page'));
          }),
        ]),
      ),
    );

/// Scrolls so the widget sits in the middle of the screen (clear of the app bar and the bottom bar).
Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  // Lists build lazily: scroll the page until the widget exists, then centre it.
  await tester.scrollUntilVisible(finder, 250, scrollable: find.byType(Scrollable).first, maxScrolls: 60);
  await Scrollable.ensureVisible(tester.element(finder.first), alignment: 0.5);
  await tester.pumpAndSettle();
}

/// A button inside the open bottom sheet (the bar behind it can carry the same label).
Finder sheetButton(String label) => find.descendant(of: find.byType(BottomSheet), matching: find.widgetWithText(FilledButton, label));

void main() {
  group('New order', () {
    testWidgets('creates a WhatsApp hoodie order and sends exactly what the API expects', (tester) async {
      phone(tester);
      final api = catalogApi(more: {
        'POST /admin/orders': (_, _) => {...orderJson(id: 99, number: 'STP-2001', status: 'CONFIRMED', allowed: ['PACKED', 'CANCELLED']), 'totalCents': 3000},
      });
      await tester.pumpWidget(app(api, const NewOrderScreen()));
      await tester.pumpAndSettle();

      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'Rana Haddad');
      await tester.enterText(fields.at(1), '03 123 456');

      // Area from the list: fills the area name and sets the area id.
      await scrollTo(tester, find.text('Choose an area'));
      await tester.tap(find.text('Choose an area'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Beirut').last);
      await tester.pumpAndSettle();
      await tester.enterText(fields.at(4), 'Hamra Street, building 12');

      // One hoodie: Black, M.
      await scrollTo(tester, find.text('Add an item'));
      await tester.tap(find.text('Add an item'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hoodie').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(ProductSwatch).first); // Black
      await tester.pump();
      await tester.tap(find.widgetWithText(SelectChip, 'M'));
      await tester.pump();
      await tester.tap(find.text('Add to order'));
      await tester.pumpAndSettle();
      expect(find.text('Stimpy Hoodie'), findsOneWidget);
      expect(find.text('Black, M'), findsOneWidget);

      await tester.tap(find.text('Create order'));
      await tester.pumpAndSettle();

      final post = api.where('POST', '/admin/orders').single;
      expect(post.body, {
        'source': 'WHATSAPP',
        'initialStatus': 'CONFIRMED',
        'sendEmail': false,
        'customer': {'name': 'Rana Haddad', 'phone': '03 123 456', 'whatsappSameAsPhone': true},
        'delivery': {'areaId': 1, 'areaName': 'Beirut', 'address': 'Hamra Street, building 12'},
        'items': [
          {'kind': 'hoodie', 'hoodieId': 1, 'colorId': 1, 'sizeId': 2, 'qty': 1},
        ],
      });
      expect(find.text('Order STP-2001 created'), findsOneWidget);
    });

    testWidgets('an empty form is refused locally, field by field, and nothing is sent', (tester) async {
      phone(tester);
      final api = catalogApi();
      await tester.pumpWidget(app(api, const NewOrderScreen()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Create order'));
      await tester.pumpAndSettle();

      expect(api.where('POST', '/admin/orders'), isEmpty);
      expect(find.text("Enter the customer's name (at least 2 characters)."), findsOneWidget);
      await scrollTo(tester, find.text('Add at least one item.'));
      expect(find.text('Add at least one item.'), findsOneWidget);
    });

    testWidgets('a sold-out colour and size cannot be chosen in the editor', (tester) async {
      phone(tester);
      await tester.pumpWidget(app(catalogApi(), const NewOrderScreen()));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.text('Add an item'));
      await tester.tap(find.text('Add an item'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hoodie').last);
      await tester.pumpAndSettle();

      await tester.tap(find.byType(ProductSwatch).first); // Black: size L is sold out
      await tester.pump();
      final large = tester.widget<SelectChip>(find.widgetWithText(SelectChip, 'L'));
      expect(large.enabled, isFalse);
      final medium = tester.widget<SelectChip>(find.widgetWithText(SelectChip, 'M'));
      expect(medium.enabled, isTrue);
      // Add to order stays disabled until a size is chosen.
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Add to order')).onPressed, isNull);
    });

    testWidgets('the server\'s per-field message appears under the field and the screen stays open', (tester) async {
      phone(tester);
      final api = catalogApi(more: {
        'POST /admin/orders': (_, _) => throw ApiError('Please check the highlighted fields.', statusCode: 400, code: 'VALIDATION_ERROR', fields: {'customer.phone': 'Enter a Lebanese phone number, like 03 123 456.'}),
      });
      await tester.pumpWidget(app(api, const NewOrderScreen()));
      await tester.pumpAndSettle();
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'Rana Haddad');
      await tester.enterText(fields.at(1), '12');
      await tester.enterText(fields.at(4), 'Hamra Street, building 12');
      await tester.enterText(fields.at(3), 'Beirut');
      await scrollTo(tester, find.text('Add an item'));
      await tester.tap(find.text('Add an item'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hoodie').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(ProductSwatch).first);
      await tester.pump();
      await tester.tap(find.widgetWithText(SelectChip, 'M'));
      await tester.pump();
      await tester.tap(find.text('Add to order'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Create order'));
      await tester.pumpAndSettle();

      expect(find.text('Enter a Lebanese phone number, like 03 123 456.'), findsOneWidget);
      expect(find.text('New order'), findsOneWidget); // still on the form
    });

    testWidgets('sold-out stock from the server marks the line and explains', (tester) async {
      phone(tester);
      final api = catalogApi(more: {
        'POST /admin/orders': (_, _) => throw ApiError('Not enough stock.', statusCode: 409, code: 'SOLD_OUT', details: {
              'items': [
                {'itemIndex': 0, 'name': 'Stimpy Hoodie', 'requested': 2, 'available': 1},
              ],
            }),
      });
      await tester.pumpWidget(app(api, const NewOrderScreen()));
      await tester.pumpAndSettle();
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'Rana Haddad');
      await tester.enterText(fields.at(1), '03 123 456');
      await tester.enterText(fields.at(3), 'Beirut');
      await tester.enterText(fields.at(4), 'Hamra Street, building 12');
      await scrollTo(tester, find.text('Add an item'));
      await tester.tap(find.text('Add an item'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hoodie').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(ProductSwatch).first);
      await tester.pump();
      await tester.tap(find.widgetWithText(SelectChip, 'M'));
      await tester.pump();
      await tester.tap(find.text('Add to order'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Create order'));
      await tester.pumpAndSettle();

      expect(find.text('Not enough stock'), findsOneWidget);
      expect(find.text('Stimpy Hoodie: requested 2, available 1'), findsWidgets);
    });
  });

  group('Order detail and status changes', () {
    FakeApi detailApi({required Map<String, dynamic> order, Map<String, Object? Function(Map<String, dynamic>?, Object?)>? more}) =>
        catalogApi(more: {'GET /admin/orders/7': (_, _) => order, ...?more});

    testWidgets('shows the designs, the customer, and only the actions the server allows', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(status: 'NEW', allowed: ['CONFIRMED', 'CANCELLED']));
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      expect(find.text('STP-1042'), findsWidgets);
      expect(find.text('Hoodie + 2 Stimpies'), findsOneWidget);
      expect(find.text('THE VOID'), findsOneWidget);
      expect(find.text('THE CEDAR'), findsOneWidget);
      expect(find.text('Rana Haddad'), findsOneWidget);
      expect(find.text('Confirm order'), findsOneWidget); // the one blue button
      expect(find.text('More'), findsOneWidget); // Cancel waits behind it
      expect(find.text('Mark delivered'), findsNothing); // not allowed from New
    });

    testWidgets('Confirm sends the change and shows the server\'s new status and next action', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(status: 'NEW', allowed: ['CONFIRMED', 'CANCELLED']), more: {
        'POST /admin/orders/7/status': (_, _) => orderJson(status: 'CONFIRMED', allowed: ['PACKED', 'CANCELLED']),
      });
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Confirm order'));
      await tester.pumpAndSettle();
      expect(find.text('Confirm STP-1042?'), findsOneWidget);
      await tester.tap(sheetButton('Confirm order'));
      await tester.pumpAndSettle();

      expect(api.where('POST', '/admin/orders/7/status').single.body, {'to': 'CONFIRMED'});
      expect(find.text('Mark as packed'), findsOneWidget); // the next step, from the server's answer
      expect(find.text('Confirm order'), findsNothing);
    });

    testWidgets('Send out for delivery needs a delivery number and sends it', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(status: 'PACKED', allowed: ['OUT_FOR_DELIVERY', 'CANCELLED']), more: {
        'POST /admin/orders/7/status': (_, _) => orderJson(status: 'OUT_FOR_DELIVERY', deliveryNumber: 'D-5521', allowed: ['DELIVERED', 'RETURNED', 'CANCELLED']),
      });
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Send out for delivery'));
      await tester.pumpAndSettle();
      await tester.tap(sheetButton('Send out for delivery'));
      await tester.pumpAndSettle();
      expect(find.text('Enter the delivery number.'), findsOneWidget);
      expect(api.where('POST', '/admin/orders/7/status'), isEmpty); // nothing was sent

      await tester.enterText(find.byType(TextFormField).last, '  D-5521 ');
      await tester.tap(sheetButton('Send out for delivery'));
      await tester.pumpAndSettle();

      expect(api.where('POST', '/admin/orders/7/status').single.body, {'to': 'OUT_FOR_DELIVERY', 'deliveryNumber': 'D-5521'});
      expect(find.text('Mark delivered'), findsOneWidget);
    });

    testWidgets('Cancel needs a reason (3+ characters) and sends it', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(status: 'NEW', allowed: ['CONFIRMED', 'CANCELLED']), more: {
        'POST /admin/orders/7/status': (_, _) => {...orderJson(status: 'CANCELLED', allowed: <String>[]), 'cancelReason': 'Out of stock'},
      });
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel order'));
      await tester.pumpAndSettle();
      await tester.tap(sheetButton('Cancel order'));
      await tester.pumpAndSettle();
      expect(find.text('Give a reason of at least 3 characters.'), findsOneWidget);

      await tester.tap(find.text('Out of stock')); // a quick-reason chip
      await tester.pump();
      await tester.tap(sheetButton('Cancel order'));
      await tester.pumpAndSettle();

      expect(api.where('POST', '/admin/orders/7/status').single.body, {'to': 'CANCELLED', 'cancelReason': 'Out of stock'});
    });

    testWidgets('returning a delivered order asks whether to restock, and says so', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(status: 'DELIVERED', allowed: ['RETURNED']), more: {
        'POST /admin/orders/7/status': (_, _) => orderJson(status: 'RETURNED', allowed: <String>[]),
      });
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Mark returned'));
      await tester.pumpAndSettle();
      await tester.tap(find.text("Write off as damaged (don't restock)"));
      await tester.pump();
      await tester.tap(sheetButton('Mark returned'));
      await tester.pumpAndSettle();

      expect(api.where('POST', '/admin/orders/7/status').single.body, {'to': 'RETURNED', 'restock': false});
    });

    testWidgets('if someone else already moved the order, the app says so and reloads it', (tester) async {
      phone(tester);
      var reads = 0;
      final api = detailApi(order: orderJson(), more: {
        'GET /admin/orders/7': (_, _) => reads++ == 0 ? orderJson(status: 'NEW', allowed: ['CONFIRMED', 'CANCELLED']) : orderJson(status: 'CONFIRMED', allowed: ['PACKED', 'CANCELLED']),
        'POST /admin/orders/7/status': (_, _) => throw ApiError('Not allowed from here.', statusCode: 409, code: 'INVALID_TRANSITION', details: {'from': 'CONFIRMED'}),
      });
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Confirm order'));
      await tester.pumpAndSettle();
      await tester.tap(sheetButton('Confirm order'));
      await tester.pumpAndSettle();
      expect(find.text('This order is now Confirmed'), findsOneWidget);

      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(find.text('Mark as packed'), findsOneWidget); // reloaded, buttons match the current status
    });

    testWidgets('cash switches work only once delivered, and settled needs collected first', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(status: 'DELIVERED', allowed: ['RETURNED']), more: {
        'POST /admin/orders/7/cash': (_, _) => orderJson(status: 'DELIVERED', allowed: ['RETURNED'], cashCollected: true),
      });
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      final collected = find.widgetWithText(SwitchListTile, 'Cash collected');
      final settled = find.widgetWithText(SwitchListTile, 'Cash settled');
      await scrollTo(tester, collected);
      expect(tester.widget<SwitchListTile>(settled).onChanged, isNull); // collect first
      await tester.tap(collected);
      await tester.pumpAndSettle();
      expect(api.where('POST', '/admin/orders/7/cash').single.body, {'collected': true});
      expect(tester.widget<SwitchListTile>(settled).onChanged, isNotNull);
    });

    testWidgets('a note is added through the API', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(), more: {
        'POST /admin/orders/7/notes': (_, _) => orderJson(notes: [
              {'id': 1, 'body': 'Customer prefers evening delivery', 'at': '2026-11-03T11:00:00.000Z', 'by': 'Owner'},
            ]),
      });
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      await scrollTo(tester, find.text('Add note'));
      await tester.enterText(find.widgetWithText(TextFormField, '').last, 'Customer prefers evening delivery');
      await tester.tap(find.text('Add note'));
      await tester.pumpAndSettle();

      expect(api.where('POST', '/admin/orders/7/notes').single.body, {'body': 'Customer prefers evening delivery'});
      expect(find.text('Customer prefers evening delivery'), findsOneWidget);
    });

    testWidgets('the timeline and notes show the newest first, as the API sends them', (tester) async {
      phone(tester);
      final api = detailApi(order: orderJson(status: 'CONFIRMED', allowed: ['PACKED', 'CANCELLED'], events: [
        {'id': 2, 'from': 'NEW', 'to': 'CONFIRMED', 'at': '2026-11-03T11:05:00.000Z', 'by': 'Owner', 'note': 'Confirmed by WhatsApp'},
        {'id': 1, 'from': null, 'to': 'NEW', 'at': '2026-11-03T10:20:00.000Z', 'by': null, 'note': null},
      ], notes: [
        {'id': 2, 'body': 'Second note (newest)', 'at': '2026-11-03T12:00:00.000Z', 'by': 'Owner'},
        {'id': 1, 'body': 'First note (oldest)', 'at': '2026-11-03T11:00:00.000Z', 'by': 'Owner'},
      ]));
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();

      await scrollTo(tester, find.text('Confirmed by WhatsApp'));
      final newer = tester.getTopLeft(find.text('Confirmed by WhatsApp')).dy;
      final older = tester.getTopLeft(find.text('Timeline')).dy; // heading above both
      expect(newer, greaterThan(older));
      // In the timeline the Confirmed pill sits above the New pill.
      final pills = find.descendant(of: find.byType(StatusPill), matching: find.byType(Text));
      expect(pills, findsWidgets);
      final confirmedY = tester.getTopLeft(find.widgetWithText(StatusPill, 'Confirmed').last).dy;
      final newY = tester.getTopLeft(find.widgetWithText(StatusPill, 'New').last).dy;
      expect(confirmedY, lessThan(newY));

      await scrollTo(tester, find.text('Second note (newest)'));
      expect(tester.getTopLeft(find.text('Second note (newest)')).dy, lessThan(tester.getTopLeft(find.text('First note (oldest)')).dy));
    });

    testWidgets('an order that does not exist says so instead of failing', (tester) async {
      phone(tester);
      final api = catalogApi(more: {'GET /admin/orders/7': (_, _) => throw ApiError('Not found.', statusCode: 404, code: 'NOT_FOUND')});
      await tester.pumpWidget(app(api, const OrderDetailScreen(orderId: 7)));
      await tester.pumpAndSettle();
      expect(find.text('Order not found'), findsOneWidget);
    });
  });

  group('Orders list', () {
    FakeApi listApi(List<Map<String, dynamic>> orders, {void Function(Map<String, dynamic>? q)? onList}) => FakeApi(handlers: {
          'GET /admin/orders': (q, _) {
            onList?.call(q);
            return pageJson(orders, total: orders.length);
          },
          'GET /admin/orders/counts': (_, _) => countsJson(),
        });

    testWidgets('lists orders with status, customer and total, and counts on the tabs', (tester) async {
      phone(tester);
      final api = listApi([summaryOf(orderJson()), summaryOf(orderJson(id: 8, number: 'STP-1043', status: 'PACKED', customerName: 'Omar Khoury'))]);
      await tester.pumpWidget(routedApp(api, const OrdersListScreen(), []));
      await tester.pumpAndSettle();

      expect(find.text('STP-1042'), findsOneWidget);
      expect(find.text('Omar Khoury · Beirut'), findsOneWidget);
      expect(find.text('Packed'), findsOneWidget);
      expect(find.text('9'), findsOneWidget); // All tab count
      expect(find.text('3'), findsNWidgets(2)); // New (3) and To pack (2 confirmed + 1 packed)
    });

    testWidgets('a tab asks the server for that status only, and search sends the text', (tester) async {
      phone(tester);
      final queries = <Map<String, dynamic>?>[];
      final api = listApi([summaryOf(orderJson())], onList: queries.add);
      await tester.pumpWidget(routedApp(api, const OrdersListScreen(), []));
      await tester.pumpAndSettle();

      await tester.tap(find.text('To pack'));
      await tester.pumpAndSettle();
      expect(queries.last?['status'], 'CONFIRMED,PACKED');

      await tester.enterText(find.byType(TextField).first, 'rana');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(queries.last?['q'], 'rana');
      expect(queries.last?['status'], 'CONFIRMED,PACKED');
    });

    testWidgets('tapping an order opens its page', (tester) async {
      phone(tester);
      final visited = <String>[];
      await tester.pumpWidget(routedApp(listApi([summaryOf(orderJson())]), const OrdersListScreen(), visited));
      await tester.pumpAndSettle();
      await tester.tap(find.text('STP-1042'));
      await tester.pumpAndSettle();
      expect(visited, ['/orders/7']);
    });

    testWidgets('an empty tab and a failed load each have their own message', (tester) async {
      phone(tester);
      await tester.pumpWidget(routedApp(listApi(const []), const OrdersListScreen(), []));
      await tester.pumpAndSettle();
      expect(find.text('No orders yet'), findsOneWidget);

      final failing = FakeApi(handlers: {
        'GET /admin/orders': (_, _) => throw ApiError('Cannot reach the server.'),
        'GET /admin/orders/counts': (_, _) => countsJson(),
      });
      await tester.pumpWidget(routedApp(failing, const OrdersListScreen(), []));
      await tester.pumpAndSettle();
      expect(find.text('Could not load orders'), findsOneWidget);
      expect(find.text('Cannot reach the server.'), findsOneWidget);
    });
  });
}

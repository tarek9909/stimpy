import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:stimpy_admin/core/providers.dart';
import 'package:stimpy_admin/features/customers/customer_detail_screen.dart';
import 'package:stimpy_admin/features/customers/customers_screen.dart';
import 'package:stimpy_admin/features/customers/data/customer_models.dart';
import 'package:stimpy_admin/theme/app_theme.dart';

import 'support/fixtures.dart';

// Shapes of GET /admin/customers (list rows with tags), /profile, /timeline, /tags and /notes.

Map<String, dynamic> customerRowJson({int id = 3, String name = 'Rana Haddad', int returned = 0, bool warning = false}) => {
      'id': id,
      'name': name,
      'email': 'rana@example.com',
      'phone': '+961 71 123 456',
      'whatsapp': '+961 71 123 456',
      'ordersCount': 2,
      'totalSpentCents': 12000,
      'lastOrderAt': '2026-11-03T10:20:00.000Z',
      'returnedCount': returned,
      'warning': warning,
      'areaName': 'Beirut',
      'optedOut': false,
      'emailConsent': true,
      'whatsappConsent': true,
      'unsubscribedAt': null,
      'tags': [
        {'id': 1, 'name': 'VIP', 'color': '#FF7A59'},
      ],
    };

Map<String, dynamic> profileJson({bool warning = false}) => {
      ...customerRowJson(warning: warning, returned: warning ? 3 : 0),
      'areaId': 1,
      'area': {'id': 1, 'name': 'Beirut'},
      'notes': null,
      'createdAt': '2026-09-01T08:00:00.000Z',
      'orderCount': 2,
      'lifetimeValueCents': 12000,
      'averageOrderValueCents': 6000,
      'firstOrderAt': '2026-09-02T08:00:00.000Z',
      'lastOrderAt': '2026-11-03T10:20:00.000Z',
      'favouriteStimpie': 'THE VOID',
      'favouriteStimpieType': 'CORE',
      'favouriteColor': 'Black',
      'favouriteColorHex': '#111111',
      'recentOrders': [summaryOf(orderJson(id: 7))],
    };

Map<String, dynamic> noteJson(int id, String body) =>
    {'id': id, 'customerId': 3, 'userId': 1, 'userName': 'Owner', 'body': body, 'createdAt': '2026-11-03T12:00:00.000Z'};

FakeApi customersApi({Map<String, Object? Function(Map<String, dynamic>? query, Object? body)>? more}) => FakeApi(handlers: {
      'GET /admin/customers': (_, _) => pageJson([customerRowJson(), customerRowJson(id: 4, name: 'Omar Khoury', warning: true, returned: 3)]),
      'GET /admin/customers/3/profile': (_, _) => profileJson(),
      'GET /admin/customers/3/timeline': (_, _) => {
            'items': [
              {'id': 'order-7', 'type': 'ORDER', 'at': '2026-11-03T10:20:00.000Z', 'title': 'Order STP-1042 placed', 'detail': null, 'refId': '7'},
            ],
            'nextCursor': null,
          },
      'GET /admin/customers/3/tags': (_, _) => {
            'items': [
              {'id': 1, 'name': 'VIP', 'color': '#FF7A59', 'createdAt': '2026-09-01T00:00:00.000Z', 'updatedAt': '2026-09-01T00:00:00.000Z'},
            ],
          },
      'GET /admin/customers/3/notes': (_, _) => pageJson([noteJson(1, 'Prefers evening delivery')]),
      ...?more,
    });

void phone(WidgetTester tester) {
  tester.view.devicePixelRatio = 2;
  tester.view.physicalSize = const Size(780, 1688);
  addTearDown(tester.view.reset);
}

Widget app(FakeApi api, Widget home, List<String> visited) => ProviderScope(
      overrides: <Override>[apiClientProvider.overrideWithValue(api)],
      child: MaterialApp.router(
        theme: buildAppTheme(),
        routerConfig: GoRouter(routes: [
          GoRoute(path: '/', builder: (_, _) => home),
          GoRoute(
            path: '/customers/:id',
            builder: (_, state) {
              visited.add(state.matchedLocation);
              return const Scaffold(body: Text('detail page'));
            },
          ),
          GoRoute(
            path: '/orders/:id',
            builder: (_, state) {
              visited.add(state.matchedLocation);
              return const Scaffold(body: Text('order page'));
            },
          ),
        ]),
      ),
    );

void main() {
  group('Customer models', () {
    test('parse a list row with tags and a warning', () {
      final row = CustomerRow.fromJson(customerRowJson(warning: true, returned: 3));
      expect(row.name, 'Rana Haddad');
      expect(row.tags.single.name, 'VIP');
      expect(row.warning, isTrue);
      expect(row.returnedCount, 3);
      expect(row.totalSpentCents, 12000);
    });

    test('parse a profile with recent orders', () {
      final p = CustomerProfile.fromJson(profileJson());
      expect(p.areaName, 'Beirut');
      expect(p.recentOrders.single.number, 'STP-1042');
      expect(p.whatsappNumber, '+961 71 123 456');
      expect(p.favouriteStimpie, 'THE VOID');
    });

    test('a page knows when there is more', () {
      expect(CustomerPage.fromJson(pageJson([customerRowJson()], total: 60)).hasMore, isTrue);
      expect(CustomerPage.fromJson(pageJson([customerRowJson()])).hasMore, isFalse);
    });
  });

  group('Customers list', () {
    testWidgets('shows customers, searches, and opens a customer', (tester) async {
      phone(tester);
      final visited = <String>[];
      final api = customersApi();
      await tester.pumpWidget(app(api, const CustomersScreen(), visited));
      await tester.pumpAndSettle();

      expect(find.text('Rana Haddad'), findsOneWidget);
      expect(find.text('Omar Khoury'), findsOneWidget);
      expect(find.text('3 returns'), findsOneWidget);
      expect(find.text('VIP'), findsNWidgets(2));
      expect(api.where('GET', '/admin/customers').first.query, containsPair('page', 1));

      await tester.enterText(find.byType(TextField), 'omar');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(api.where('GET', '/admin/customers').last.query, containsPair('q', 'omar'));

      await tester.tap(find.text('Rana Haddad').first);
      await tester.pumpAndSettle();
      expect(visited, ['/customers/3']);
    });

    testWidgets('shows an empty state and an error state with retry', (tester) async {
      phone(tester);
      var fail = true;
      final api = customersApi(more: {
        'GET /admin/customers': (_, _) {
          if (fail) throw StateError('boom');
          return pageJson(<Map<String, dynamic>>[]);
        },
      });
      await tester.pumpWidget(app(api, const CustomersScreen(), []));
      await tester.pumpAndSettle();
      expect(find.text('Could not load customers'), findsOneWidget);

      fail = false;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('No customers yet'), findsOneWidget);
    });

    testWidgets('loads the next page when scrolled to the end', (tester) async {
      phone(tester);
      final rows = [for (var i = 0; i < 25; i++) customerRowJson(id: 100 + i, name: 'Customer $i')];
      final api = customersApi(more: {
        'GET /admin/customers': (q, _) => (q?['page'] ?? 1) == 1 ? pageJson(rows, total: 26) : pageJson([customerRowJson(id: 200, name: 'Last One')], page: 2, total: 26),
      });
      await tester.pumpWidget(app(api, const CustomersScreen(), []));
      await tester.pumpAndSettle();
      // The last row does not exist until page 2 is fetched: scroll to the end to trigger it.
      await tester.fling(find.byType(ListView), const Offset(0, -3000), 3000);
      await tester.pumpAndSettle();
      await tester.fling(find.byType(ListView), const Offset(0, -3000), 3000);
      await tester.pumpAndSettle();
      expect(find.text('Last One'), findsWidgets);
      expect(api.where('GET', '/admin/customers').last.query, containsPair('page', 2));
    });
  });

  group('Customer detail', () {
    testWidgets('shows profile, tags, orders, timeline and notes, and adds a note', (tester) async {
      phone(tester);
      final api = customersApi(more: {
        'POST /admin/customers/3/notes': (_, body) => noteJson(2, (body as Map)['body'] as String),
      });
      await tester.pumpWidget(app(api, const CustomerDetailScreen(customerId: 3), []));
      await tester.pumpAndSettle();

      expect(find.text('Rana Haddad'), findsWidgets);
      expect(find.text('Call'), findsOneWidget);
      expect(find.text('WhatsApp'), findsOneWidget);
      expect(find.text('Returned 3 orders. Consider confirming by phone before sending the next one.'), findsNothing);

      final list = find.byType(Scrollable).first;
      await tester.dragUntilVisible(find.text('Prefers evening delivery'), list, const Offset(0, -300));
      expect(find.text('Order STP-1042 placed'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField), '  Called, no answer  ');
      await tester.ensureVisible(find.text('Add note'));
      await tester.tap(find.text('Add note'));
      await tester.pumpAndSettle();
      expect(api.where('POST', '/admin/customers/3/notes').single.body, {'body': 'Called, no answer'});
      expect(find.text('Called, no answer'), findsOneWidget);
    });

    testWidgets('shows the returns warning badge', (tester) async {
      phone(tester);
      final api = customersApi(more: {'GET /admin/customers/3/profile': (_, _) => profileJson(warning: true)});
      await tester.pumpWidget(app(api, const CustomerDetailScreen(customerId: 3), []));
      await tester.pumpAndSettle();
      expect(find.textContaining('Returned 3 orders'), findsOneWidget);
    });

    testWidgets('opening an order goes to /orders/:id', (tester) async {
      phone(tester);
      final visited = <String>[];
      await tester.pumpWidget(app(customersApi(), const CustomerDetailScreen(customerId: 3), visited));
      await tester.pumpAndSettle();
      await tester.dragUntilVisible(find.text('STP-1042'), find.byType(Scrollable).first, const Offset(0, -200));
      await tester.ensureVisible(find.text('STP-1042'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('STP-1042'));
      await tester.pumpAndSettle();
      expect(visited, ['/orders/7']);
    });
  });
}

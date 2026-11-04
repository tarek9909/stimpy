import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:stimpy_admin/core/api_error.dart';
import 'package:stimpy_admin/core/providers.dart';
import 'package:stimpy_admin/features/overview/data/overview_models.dart';
import 'package:stimpy_admin/features/overview/overview_screen.dart';
import 'package:stimpy_admin/theme/app_theme.dart';

import 'support/fixtures.dart';

Map<String, dynamic> overviewJson({bool setupComplete = false, List<Map<String, dynamic>>? attention, bool drop = true}) => {
      'today': {'newOrders': 3, 'toPack': 2, 'outForDelivery': 1, 'cashToCollectCents': 12500, 'revenueCents': 24000},
      'attention': attention ??
          [
            {'type': 'NEW_TOO_LONG', 'label': 'STP-1042 has been waiting 5 h', 'orderId': 7, 'itemType': null, 'itemId': null},
            {'type': 'LOW_STOCK', 'label': 'Black M is low', 'orderId': null, 'itemType': 'HOODIE_VARIANT', 'itemId': 4},
          ],
      'liveDrop': drop ? {'id': 1, 'name': 'Winter drop', 'unitsTotal': 100, 'unitsSold': 40, 'endsAt': null} : null,
      'sales7d': [
        for (var i = 0; i < 7; i++) {'date': '2026-10-${29 + (i % 3)}', 'orders': i, 'revenueCents': i * 1500},
      ],
      'recentOrders': [orderJson()],
      'setup': {
        'complete': setupComplete,
        'items': [
          {'key': 'logo', 'label': 'Upload your logo', 'hint': 'Shown on invoices', 'kind': 'REVIEW', 'required': true, 'status': 'TODO', 'link': '/settings'},
          {'key': 'area', 'label': 'Add a delivery area', 'hint': '', 'kind': 'AUTO', 'required': false, 'status': 'DONE', 'link': '/settings'},
        ],
      },
    };

Widget host(FakeApi api, List<String> visited) => ProviderScope(
      overrides: <Override>[apiClientProvider.overrideWithValue(api)],
      child: MaterialApp.router(
        theme: buildAppTheme(),
        routerConfig: GoRouter(routes: [
          GoRoute(path: '/', builder: (_, _) => const OverviewScreen()),
          GoRoute(
            path: '/orders/:id',
            builder: (_, s) {
              visited.add(s.matchedLocation);
              return const Scaffold(body: Text('detail page'));
            },
          ),
        ]),
      ),
    );

void phone(WidgetTester tester) {
  tester.view.devicePixelRatio = 2;
  tester.view.physicalSize = const Size(780, 2400);
  addTearDown(tester.view.reset);
}

void main() {
  test('Overview.fromJson parses the API shape and tolerates gaps', () {
    final o = Overview.fromJson(overviewJson());
    expect(o.today.revenueCents, 24000);
    expect(o.attention.first.type, AttentionType.newTooLong);
    expect(o.attention.last.itemId, 4);
    expect(o.liveDrop!.progress, 0.4);
    expect(o.sales7d, hasLength(7));
    expect(o.recentOrders.single.number, 'STP-1042');
    expect(o.setup.doneCount, 1);
    expect(o.setup.items.first.review, isTrue);

    final empty = Overview.fromJson({});
    expect(empty.today.newOrders, 0);
    expect(empty.liveDrop, isNull);
    expect(empty.sales7d, isEmpty);
  });

  test('timeLeft matches the web labels', () {
    final now = DateTime(2026, 11, 4, 12);
    expect(timeLeft(now.subtract(const Duration(minutes: 1)), now: now), 'Ended');
    expect(timeLeft(now.add(const Duration(days: 3, hours: 4)), now: now), '3 d 4 h left');
    expect(timeLeft(now.add(const Duration(hours: 2, minutes: 5)), now: now), '2 h 5 min left');
    expect(timeLeft(now.add(const Duration(seconds: 20)), now: now), '1 min left');
  });

  testWidgets('shows KPIs, attention, chart, recent orders and setup; asks the right endpoint', (tester) async {
    phone(tester);
    final api = FakeApi(handlers: {'GET /admin/overview': (_, _) => overviewJson()});
    final visited = <String>[];
    await tester.pumpWidget(host(api, visited));
    await tester.pumpAndSettle();

    expect(api.where('GET', '/admin/overview'), hasLength(1));
    expect(find.text('\$240.00'), findsOneWidget); // today's revenue
    expect(find.text('New orders'), findsOneWidget);
    expect(find.text('Cash to collect'), findsOneWidget);
    expect(find.text('Get ready to sell'), findsOneWidget);
    expect(find.text('STP-1042 has been waiting 5 h'), findsOneWidget);
    expect(find.text('Winter drop'), findsOneWidget);
    expect(find.text('40 of 100 units sold'), findsOneWidget);
    expect(find.byType(SalesChartCard), findsOneWidget);

    await tester.tap(find.text('Orders').last); // chart toggle
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('STP-1042 has been waiting 5 h'));
    await tester.pumpAndSettle();
    expect(visited, ['/orders/7']);
  });

  testWidgets('hides the checklist when complete and shows calm empty states', (tester) async {
    phone(tester);
    final api = FakeApi(handlers: {'GET /admin/overview': (_, _) => overviewJson(setupComplete: true, attention: [], drop: false)});
    await tester.pumpWidget(host(api, []));
    await tester.pumpAndSettle();
    expect(find.text('Get ready to sell'), findsNothing);
    expect(find.text("You're all caught up"), findsOneWidget);
    expect(find.text('No active drop'), findsOneWidget);
  });

  testWidgets('error state offers a retry that reloads', (tester) async {
    phone(tester);
    var calls = 0;
    final api = FakeApi(handlers: {
      'GET /admin/overview': (_, _) {
        calls++;
        if (calls == 1) throw ApiError('Server is down', statusCode: 500);
        return overviewJson();
      },
    });
    await tester.pumpWidget(host(api, []));
    await tester.pumpAndSettle();
    expect(find.text('Could not load the overview'), findsOneWidget);
    expect(find.text('Server is down'), findsOneWidget);

    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('New orders'), findsOneWidget);
    expect(calls, 2);
  });

  testWidgets('pull to refresh fetches again', (tester) async {
    phone(tester);
    final api = FakeApi(handlers: {'GET /admin/overview': (_, _) => overviewJson()});
    await tester.pumpWidget(host(api, []));
    await tester.pumpAndSettle();
    await tester.fling(find.byType(ListView).first, const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(api.where('GET', '/admin/overview').length, 2);
  });
}

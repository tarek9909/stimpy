// Renders the Orders screens and the printable documents to PNG files in build/previews (with the real fonts), so the
// design can be reviewed without a device, and checks that real PDFs are produced.
// Run: flutter test test/preview_orders_test.dart
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:stimpy_admin/core/providers.dart';
import 'package:stimpy_admin/features/orders/data/order_models.dart';
import 'package:stimpy_admin/features/orders/data/orders_api.dart';
import 'package:stimpy_admin/features/orders/detail/order_detail_screen.dart';
import 'package:stimpy_admin/features/orders/list/orders_list_screen.dart';
import 'package:stimpy_admin/features/orders/new_order/new_order_screen.dart';
import 'package:stimpy_admin/features/orders/print/order_printer.dart';
import 'package:stimpy_admin/features/orders/print/print_documents.dart';
import 'package:stimpy_admin/features/orders/print/print_sheet.dart';
import 'package:stimpy_admin/theme/app_theme.dart';
import 'package:stimpy_admin/ui/brand_logo.dart';
import 'package:stimpy_admin/ui/color_swatch.dart';
import 'package:stimpy_admin/ui/select_chip.dart';

import 'support/fixtures.dart';

Future<void> _loadFonts() async {
  final poppins = FontLoader('Poppins');
  for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    poppins.addFont(rootBundle.load('assets/fonts/Poppins-$w.ttf'));
  }
  await poppins.load();
  final arabic = FontLoader('NotoSansArabic')..addFont(rootBundle.load('assets/fonts/NotoSansArabic.ttf'));
  await arabic.load();
  final lucide = FontLoader('packages/lucide_icons_flutter/Lucide')..addFont(rootBundle.load('packages/lucide_icons_flutter/assets/lucide.ttf'));
  await lucide.load();
}

Future<void> _save(WidgetTester tester, GlobalKey key, String name) async {
  final context = tester.element(find.byKey(key));
  await tester.runAsync(() => BrandLogo.precacheAll(context));
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 700));
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(key));
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    final dir = Directory('build/previews')..createSync(recursive: true);
    File('${dir.path}/$name.png').writeAsBytesSync(data!.buffer.asUint8List());
  });
}

void _phone(WidgetTester tester, {double height = 844}) {
  tester.view.devicePixelRatio = 2;
  tester.view.physicalSize = Size(390 * 2, height * 2);
  tester.view.padding = const FakeViewPadding(top: 48);
  tester.view.viewPadding = const FakeViewPadding(top: 48);
  addTearDown(tester.view.reset);
}

Widget _app(GlobalKey key, FakeApi api, Widget home) => ProviderScope(
      overrides: <Override>[apiClientProvider.overrideWithValue(api)],
      child: RepaintBoundary(key: key, child: MaterialApp(debugShowCheckedModeBanner: false, theme: buildAppTheme(), home: home)),
    );

Widget _routed(GlobalKey key, FakeApi api, Widget home) => ProviderScope(
      overrides: <Override>[apiClientProvider.overrideWithValue(api)],
      child: RepaintBoundary(
        key: key,
        child: MaterialApp.router(debugShowCheckedModeBanner: false, theme: buildAppTheme(), routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, _) => home)])),
      ),
    );

OrderDetail _order({String status = 'NEW', List<String> allowed = const ['CONFIRMED', 'CANCELLED'], String? deliveryNumber, int id = 7, String number = 'STP-1042', String name = 'Rana Haddad', String? holdExpiresAt}) =>
    OrderDetail.fromJson(orderJson(
      id: id,
      number: number,
      status: status,
      allowed: allowed,
      deliveryNumber: deliveryNumber,
      customerName: name,
      holdExpiresAt: holdExpiresAt,
      // The API sends the log newest first.
      events: [
        if (status != 'NEW') {'id': 2, 'from': 'NEW', 'to': 'CONFIRMED', 'at': '2026-11-03T11:05:00.000Z', 'by': 'Owner', 'note': 'Confirmed by WhatsApp'},
        {'id': 1, 'from': null, 'to': 'NEW', 'at': '2026-11-03T10:20:00.000Z', 'by': null, 'note': null},
      ],
      notes: [
        {'id': 1, 'body': 'Customer prefers evening delivery', 'at': '2026-11-03T11:00:00.000Z', 'by': 'Owner'},
      ],
      emails: [
        {'id': 1, 'template': 'order_received', 'to': 'rana@example.com', 'status': 'SENT', 'at': '2026-11-03T10:21:00.000Z'},
      ],
    ));

void main() {
  setUpAll(_loadFonts);

  testWidgets('orders list', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    final api = FakeApi(handlers: {
      'GET /admin/orders': (_, _) => pageJson([
            summaryOf(orderJson(holdExpiresAt: '2026-11-03T20:00:00.000Z')),
            summaryOf(orderJson(id: 8, number: 'STP-1043', status: 'CONFIRMED', customerName: 'Omar Khoury', cashCollected: false)),
            summaryOf(orderJson(id: 9, number: 'STP-1044', status: 'OUT_FOR_DELIVERY', customerName: 'Layla Nasr', deliveryNumber: 'D-5521')),
            summaryOf(orderJson(id: 10, number: 'STP-1045', status: 'DELIVERED', customerName: 'Karim Saade', cashCollected: true)),
            summaryOf(orderJson(id: 11, number: 'STP-1046', status: 'CANCELLED', customerName: 'Maya Frem')),
          ]),
      'GET /admin/orders/counts': (_, _) => countsJson(all: 24, newOrders: 3),
    });
    await tester.pumpWidget(_routed(key, api, const OrdersListScreen()));
    await tester.pumpAndSettle();
    expect(find.text('STP-1042'), findsOneWidget);
    await _save(tester, key, '10_orders_list');
  });

  testWidgets('order detail (new, with hold)', (tester) async {
    _phone(tester, height: 2300);
    final key = GlobalKey();
    final api = catalogApi(more: {'GET /admin/orders/7': (_, _) => orderJson(holdExpiresAt: '2026-11-03T20:00:00.000Z', notes: [
          {'id': 1, 'body': 'Customer prefers evening delivery', 'at': '2026-11-03T11:00:00.000Z', 'by': 'Owner'}
        ], emails: [
          {'id': 1, 'template': 'order_received', 'to': 'rana@example.com', 'status': 'SENT', 'at': '2026-11-03T10:21:00.000Z'}
        ], events: [
          {'id': 1, 'from': null, 'to': 'NEW', 'at': '2026-11-03T10:20:00.000Z', 'by': null, 'note': null}
        ])});
    await tester.pumpWidget(_app(key, api, const OrderDetailScreen(orderId: 7)));
    await tester.pumpAndSettle();
    await _save(tester, key, '11_order_detail');
  });

  testWidgets('order detail (out for delivery, delivered cash)', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    final api = catalogApi(more: {'GET /admin/orders/7': (_, _) => orderJson(status: 'OUT_FOR_DELIVERY', deliveryNumber: 'D-5521', allowed: ['DELIVERED', 'RETURNED', 'CANCELLED'])});
    await tester.pumpWidget(_app(key, api, const OrderDetailScreen(orderId: 7)));
    await tester.pumpAndSettle();
    await _save(tester, key, '12_order_detail_out');
  });

  testWidgets('status sheets', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    final api = catalogApi(more: {'GET /admin/orders/7': (_, _) => orderJson(status: 'PACKED', allowed: ['OUT_FOR_DELIVERY', 'CANCELLED'])});
    await tester.pumpWidget(_app(key, api, const OrderDetailScreen(orderId: 7)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send out for delivery'));
    await tester.pumpAndSettle();
    await _save(tester, key, '13_status_send_out');

    // Cancel sheet
    await tester.tapAt(const Offset(195, 60)); // dismiss
    await tester.pumpAndSettle();
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await _save(tester, key, '14_status_more');
    await tester.tap(find.text('Cancel order'));
    await tester.pumpAndSettle();
    await _save(tester, key, '15_status_cancel');
  });

  testWidgets('new order form and editors', (tester) async {
    _phone(tester, height: 1500);
    final key = GlobalKey();
    await tester.pumpWidget(_app(key, catalogApi(), const NewOrderScreen()));
    await tester.pumpAndSettle();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Rana Haddad');
    await tester.enterText(fields.at(1), '03 123 456');
    await tester.enterText(fields.at(3), 'Beirut');
    await tester.enterText(fields.at(4), 'Building 12, 3rd floor, Hamra Street');
    await _save(tester, key, '16_new_order_top');

    // add a hoodie set (Stimpies are on sale in the fixtures)
    await tester.scrollUntilVisible(find.text('Add an item'), 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add an item'));
    await tester.pumpAndSettle();
    await _save(tester, key, '17_new_order_kinds');
    await tester.tap(find.text('Hoodie + Stimpies'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hoodie + 2 Stimpies'));
    await tester.pump();
    await tester.tap(find.byType(ProductSwatch).first);
    await tester.pump();
    await tester.tap(find.widgetWithText(SelectChip, 'M'));
    await tester.pump();
    await _save(tester, key, '18_line_editor_set');
  });

  testWidgets('print sheet', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    await tester.pumpWidget(_app(
      key,
      FakeApi(),
      Builder(builder: (context) => Scaffold(body: Center(child: FilledButton(onPressed: () => showPrintSheet(context, orders: [_order(), _order(id: 8, number: 'STP-1043', name: 'Omar Khoury')], title: 'To pack · 2 orders'), child: const Text('Open')))))),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await _save(tester, key, '19_print_sheet');
  });

  // ---- the printable documents, drawn exactly as they are put on paper
  Future<void> doc(WidgetTester tester, String name, Widget page, {double height = 842}) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = Size(kPageWidth, height);
    addTearDown(tester.view.reset);
    final key = GlobalKey();
    await tester.pumpWidget(RepaintBoundary(key: key, child: Directionality(textDirection: TextDirection.ltr, child: Align(alignment: Alignment.topLeft, child: page))));
    await _save(tester, key, name);
  }

  const business = BusinessInfo(name: 'Stimpy', whatsappNumber: '+961 71 123 456', supportEmail: 'hello@stimpy.com');

  testWidgets('invoice', (tester) async => doc(tester, '20_invoice', InvoiceDocument(order: _order(status: 'OUT_FOR_DELIVERY', deliveryNumber: 'D-5521', allowed: []), business: business)));

  testWidgets('labels', (tester) async {
    final orders = [
      _order(status: 'OUT_FOR_DELIVERY', deliveryNumber: 'D-5521', allowed: []),
      _order(id: 8, number: 'STP-1043', name: 'Omar Khoury'),
      _order(id: 9, number: 'STP-1044', name: 'Layla Nasr', deliveryNumber: 'D-5522'),
      _order(id: 10, number: 'STP-1045', name: 'مريم الخوري'), // Arabic prints correctly
    ];
    await doc(tester, '21_labels', LabelsPage(orders: orders, heading: 'Area: Beirut (4)'));
  });

  testWidgets('delivery sheet', (tester) async {
    final orders = [
      for (var i = 0; i < 5; i++) _order(id: 20 + i, number: 'STP-10${50 + i}', name: ['Rana Haddad', 'Omar Khoury', 'Layla Nasr', 'Karim Saade', 'Maya Frem'][i], deliveryNumber: 'D-55${20 + i}', status: 'OUT_FOR_DELIVERY', allowed: []),
    ];
    await doc(tester, '22_delivery_sheet', DeliverySheetPage(orders: orders, title: 'Delivery sheet', printedAt: DateTime(2026, 11, 3, 15, 30)), height: 520);
  });

  // ---- real PDFs
  testWidgets('every document type produces a real PDF, one page per invoice and per group', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(600, 900);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: SizedBox())));
    final context = tester.element(find.byType(Scaffold));
    await tester.runAsync(() => BrandLogo.precacheAll(context));
    final printer = OrderPrinter();
    final orders = [_order(), _order(id: 8, number: 'STP-1043', name: 'Omar Khoury')];

    Future<int> pages(Future<Uint8List> Function() build) async {
      final bytes = (await tester.runAsync(build))!;
      expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
      return RegExp(r'/Type\s*/Page(?!s)').allMatches(String.fromCharCodes(bytes)).length;
    }

    expect(await pages(() => printer.invoices(context, orders, business)), 2);
    expect(await pages(() => printer.labels(context, orders)), 1);
    expect(await pages(() => printer.deliverySheet(context, orders)), 1);
    // Grouped by area: two areas means two pages.
    final other = OrderDetail.fromJson({...orderJson(id: 9, number: 'STP-1044'), 'delivery': {'areaId': 2, 'areaName': 'Mount Lebanon', 'address': 'Aley main road', 'notes': null}});
    expect(await pages(() => printer.deliverySheet(context, [...orders, other], group: PrintGroup.area)), 2);
  });
}

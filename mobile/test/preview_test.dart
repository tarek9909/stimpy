// Renders the real screens to PNG files in build/previews so the design can be reviewed without a device, and
// asserts the key content is present. Run: flutter test test/preview_test.dart
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:stimpy_admin/app/nav_badges.dart';
import 'package:stimpy_admin/app/router.dart';
import 'package:stimpy_admin/core/providers.dart';
import 'package:stimpy_admin/core/order_status.dart';
import 'package:stimpy_admin/features/auth/auth_controller.dart';
import 'package:stimpy_admin/features/auth/auth_state.dart';
import 'package:stimpy_admin/features/auth/login_screen.dart';
import 'package:stimpy_admin/features/splash/splash_screen.dart';
import 'package:stimpy_admin/theme/app_theme.dart';
import 'package:stimpy_admin/theme/brand.dart';
import 'package:stimpy_admin/ui/app_text_field.dart';
import 'package:stimpy_admin/ui/brand_logo.dart';
import 'package:stimpy_admin/ui/empty_state.dart';
import 'package:stimpy_admin/ui/pill.dart';
import 'package:stimpy_admin/ui/stat_tile.dart';
import 'package:stimpy_admin/ui/status_pill.dart';

import 'support/fixtures.dart';

/// Signed-in auth state without touching secure storage or the network.
class _SignedInAuth extends AuthController {
  @override
  AuthState build() => AuthState(
        status: AuthStatus.signedIn,
        user: const AuthUser(id: 1, email: 'owner@stimpy.com', name: 'Tarek Haddad', role: 'OWNER'),
        sessionExpiresAt: DateTime(2026, 11, 10, 18, 30),
      );
}

class _ThreeNew extends NewOrdersBadge {
  @override
  int build() => 3;
}

Future<void> _loadFonts() async {
  final poppins = FontLoader('Poppins');
  for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    poppins.addFont(rootBundle.load('assets/fonts/Poppins-$w.ttf'));
  }
  await poppins.load();
  final lucide = FontLoader('packages/lucide_icons_flutter/Lucide')..addFont(rootBundle.load('packages/lucide_icons_flutter/assets/lucide.ttf'));
  await lucide.load();
}

Future<void> _save(WidgetTester tester, GlobalKey key, String name) async {
  // Like the app does at startup: have the logos decoded, then let their fade-in finish.
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

void _phone(WidgetTester tester, {double width = 390, double height = 844}) {
  tester.view.devicePixelRatio = 2;
  tester.view.physicalSize = Size(width * 2, height * 2);
  tester.view.padding = const FakeViewPadding(top: 48);
  tester.view.viewPadding = const FakeViewPadding(top: 48);
  addTearDown(tester.view.reset);
}

Widget _app(GlobalKey key, Widget child, {List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: RepaintBoundary(
        key: key,
        child: MaterialApp(debugShowCheckedModeBanner: false, theme: buildAppTheme(), home: child),
      ),
    );

void main() {
  setUpAll(_loadFonts);

  testWidgets('splash', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    await tester.pumpWidget(_app(key, const SplashScreen()));
    await tester.pump(const Duration(milliseconds: 700));
    await _save(tester, key, '01_splash');
  });

  testWidgets('login', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    await tester.pumpWidget(_app(key, const LoginScreen()));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    await _save(tester, key, '02_login');
  });

  testWidgets('login validates empty fields', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    await tester.pumpWidget(_app(key, const LoginScreen()));
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(find.text('Enter your email address.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    await _save(tester, key, '03_login_errors');
  });

  testWidgets('login with the keyboard open collapses the hero without overflow', (tester) async {
    _phone(tester);
    tester.view.viewInsets = const FakeViewPadding(bottom: 600); // ~300 logical px of keyboard
    final key = GlobalKey();
    await tester.pumpWidget(_app(key, const LoginScreen()));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Admin'), findsNothing); // the tag hides while typing to save room
    expect(tester.takeException(), isNull);
    await _save(tester, key, '03b_login_keyboard');
  });

  testWidgets('shell tabs', (tester) async {
    _phone(tester);
    final key = GlobalKey();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(_SignedInAuth.new),
          newOrdersBadgeProvider.overrideWith(_ThreeNew.new),
          apiClientProvider.overrideWithValue(FakeApi(handlers: {
            'GET /admin/orders': (_, _) => pageJson([summaryOf(orderJson()), summaryOf(orderJson(id: 8, number: 'STP-1043', status: 'PACKED', customerName: 'Omar Khoury'))]),
            'GET /admin/orders/counts': (_, _) => countsJson(),
            'GET /admin/customers': (_, _) => {'items': [], 'page': 1, 'pageSize': 25, 'total': 0},
          })),
        ],
        child: Consumer(
          builder: (context, ref, _) => RepaintBoundary(
            key: key,
            child: MaterialApp.router(debugShowCheckedModeBanner: false, theme: buildAppTheme(), routerConfig: ref.watch(routerProvider)),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('STP-1042'), findsOneWidget); // the real Orders list
    expect(find.text('3'), findsWidgets); // the Orders count badge (and the tab counts)
    await _save(tester, key, '04_orders_tab');

    await tester.tap(find.text('Customers'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Search name, phone or email'), findsOneWidget);
    await _save(tester, key, '05_customers_tab');

    await tester.tap(find.text('More'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Tarek Haddad'), findsOneWidget);
    expect(find.text('TH'), findsOneWidget);
    await _save(tester, key, '06_more_tab');
  });

  testWidgets('component gallery', (tester) async {
    _phone(tester, height: 1600);
    final key = GlobalKey();
    final controller = TextEditingController(text: 'owner@stimpy.com');
    await tester.pumpWidget(
      _app(
        key,
        Scaffold(
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('Order status', style: TextStyle(fontFamily: 'Poppins', fontWeight: FontWeight.w600, fontSize: 15)),
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: [for (final s in OrderStatus.values) StatusPill(s)]),
                const SizedBox(height: 20),
                const Text('Tags', style: TextStyle(fontFamily: 'Poppins', fontWeight: FontWeight.w600, fontSize: 15)),
                const SizedBox(height: 10),
                const Wrap(spacing: 8, runSpacing: 8, children: [
                  Pill(label: 'Core', tone: PillTone.cream),
                  Pill(label: 'Limited', tone: PillTone.coral),
                  Pill(label: 'Last few · 3 left', tone: PillTone.butter),
                  Pill(label: 'Coming soon', tone: PillTone.outline),
                  Pill(label: "Won't return", tone: PillTone.black),
                  Pill(label: 'Sold out', tone: PillTone.neutral),
                  Pill(label: 'Cash collected', tone: PillTone.success, icon: LucideIcons.check),
                  Pill(label: 'Hold expired', tone: PillTone.danger),
                ]),
                const SizedBox(height: 20),
                const Text('Overview tiles', style: TextStyle(fontFamily: 'Poppins', fontWeight: FontWeight.w600, fontSize: 15)),
                const SizedBox(height: 10),
                const Row(children: [
                  Expanded(child: StatTile(label: 'New orders', value: '12', icon: LucideIcons.shoppingBag, note: 'Waiting to confirm', highlight: true)),
                  SizedBox(width: 12),
                  Expanded(child: StatTile(label: 'Cash to collect', value: '\$1,240.00', icon: LucideIcons.banknote, note: '7 orders out')),
                ]),
                const SizedBox(height: 20),
                const Text('Buttons', style: TextStyle(fontFamily: 'Poppins', fontWeight: FontWeight.w600, fontSize: 15)),
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  FilledButton(onPressed: () {}, child: const Text('Confirm order')),
                  OutlinedButton(onPressed: () {}, child: const Text('Call')),
                  TextButton(onPressed: () {}, child: const Text('View all')),
                  const FilledButton(onPressed: null, child: Text('Disabled')),
                  FilledButton(style: FilledButton.styleFrom(backgroundColor: Brand.danger), onPressed: () {}, child: const Text('Cancel order')),
                ]),
                const SizedBox(height: 20),
                AppTextField(label: 'Email', controller: controller),
                const SizedBox(height: 8),
                const SizedBox(height: 320, child: EmptyState(icon: LucideIcons.inbox, title: 'No orders yet', message: 'New orders show up here the moment they are placed.', actionLabel: 'Refresh', onAction: _noop)),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Out for delivery'), findsOneWidget);
    await _save(tester, key, '07_gallery');
  });
}

void _noop() {}

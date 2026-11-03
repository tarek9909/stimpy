import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../features/orders/data/orders_api.dart';
import '../theme/brand.dart';
import 'nav_badges.dart';

/// Bottom navigation, modelled on the dashboard's phone bar: a hairline above, 22px Lucide icons, the active tab
/// in a soft blue pill, an ink count badge on Orders.
///
/// The Orders badge is the number of orders waiting in New. It is read from `GET /admin/orders/counts` every 30 s
/// while the app is open (like the dashboard's poll), straight away when the app comes back to the front, and
/// whenever an order changes.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> with WidgetsBindingObserver {
  static const _pollEvery = Duration(seconds: 30);
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(_pollEvery, (_) => ref.invalidate(orderCountsProvider));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(orderCountsProvider);
      _startPolling();
    } else {
      _timer?.cancel(); // no polling in the background: push notifications cover that
    }
  }

  @override
  Widget build(BuildContext context) {
    // Feed the badge from the counts. A failed poll keeps the last number rather than clearing it.
    ref.listen(orderCountsProvider, (_, next) {
      final counts = next.value;
      if (counts != null) ref.read(newOrdersBadgeProvider.notifier).set(counts.newOrders);
    });
    final newOrders = ref.watch(newOrdersBadgeProvider);
    final shell = widget.shell;
    return Scaffold(
      body: shell,
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Brand.line))),
        child: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
          destinations: [
            NavigationDestination(
              icon: _Counted(count: newOrders, child: const Icon(LucideIcons.shoppingBag)),
              label: 'Orders',
              tooltip: newOrders > 0 ? 'Orders, $newOrders new' : 'Orders',
            ),
            const NavigationDestination(icon: Icon(LucideIcons.users), label: 'Customers'),
            const NavigationDestination(icon: Icon(LucideIcons.layoutDashboard), label: 'Overview'),
            const NavigationDestination(icon: Icon(LucideIcons.ellipsis), label: 'More'),
          ],
        ),
      ),
    );
  }
}

/// The dashboard's count badge: ink pill, white tabular number, "99+" cap.
class _Counted extends StatelessWidget {
  const _Counted({required this.count, required this.child});

  final int count;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Badge(
      isLabelVisible: count > 0,
      label: Text(count > 99 ? '99+' : '$count'),
      backgroundColor: Brand.ink,
      textColor: Brand.white,
      textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 11, fontWeight: FontWeight.w600, height: 1.1),
      offset: const Offset(6, -4),
      child: child,
    );
  }
}

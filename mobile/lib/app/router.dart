import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/auth_state.dart';
import '../features/auth/login_screen.dart';
import '../features/customers/customers_placeholder.dart';
import '../features/orders/detail/order_detail_screen.dart';
import '../features/orders/list/orders_list_screen.dart';
import '../features/orders/new_order/new_order_screen.dart';
import '../features/overview/overview_placeholder.dart';
import '../features/more/more_screen.dart';
import '../features/splash/splash_screen.dart';
import 'shell.dart';

/// Redirects follow auth state: splash while restoring, login when signed out, Orders when signed in.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/orders',
    refreshListenable: refresh,
    redirect: (context, state) {
      final status = ref.read(authProvider).status;
      final path = state.matchedLocation;
      if (status == AuthStatus.unknown) return path == '/splash' ? null : '/splash';
      if (status == AuthStatus.signedOut) return path == '/login' ? null : '/login';
      if (path == '/login' || path == '/splash') return '/orders';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      // Full-screen pages above the tabs. `/orders/new` must come before `/orders/:id`.
      GoRoute(path: '/orders/new', builder: (_, _) => const NewOrderScreen()),
      GoRoute(
        path: '/orders/:id',
        builder: (_, state) => OrderDetailScreen(orderId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, _, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/orders', builder: (_, _) => const OrdersListScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/customers', builder: (_, _) => const CustomersPlaceholder()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/overview', builder: (_, _) => const OverviewPlaceholder()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/more', builder: (_, _) => const MoreScreen()),
          ]),
        ],
      ),
    ],
  );
});

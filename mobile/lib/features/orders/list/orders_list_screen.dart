import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api_error.dart';
import '../../../core/money.dart';
import '../../../core/order_status.dart';
import '../../../core/time_ago.dart';
import '../../../theme/brand.dart';
import '../../../theme/typography.dart';
import '../../../ui/app_top_bar.dart';
import '../../../ui/empty_state.dart';
import '../../../ui/pill.dart';
import '../../../ui/status_pill.dart';
import '../../../ui/zip_line.dart';
import '../data/order_models.dart';
import '../data/orders_api.dart';
import '../print/print_sheet.dart';

/// The list tabs of the dashboard (dashboard-pages 5.1). `toPack` and `closed` group two statuses each.
enum OrderTab {
  all('All', []),
  newOrders('New', [OrderStatus.newOrder]),
  toPack('To pack', [OrderStatus.confirmed, OrderStatus.packed]),
  out('Out for delivery', [OrderStatus.outForDelivery]),
  delivered('Delivered', [OrderStatus.delivered]),
  closed('Returned & cancelled', [OrderStatus.cancelled, OrderStatus.returned]);

  const OrderTab(this.label, this.statuses);
  final String label;
  final List<OrderStatus> statuses;

  /// Badge number from the counts (sums for the two grouped tabs).
  int count(OrderCounts c) => this == OrderTab.all ? c.all : statuses.fold(0, (sum, s) => sum + c.of(s));
}

/// Orders by tab with search, the way the web lists them: newest first, 25 at a time, more as you scroll.
class OrdersListScreen extends ConsumerStatefulWidget {
  const OrdersListScreen({super.key});

  @override
  ConsumerState<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends ConsumerState<OrdersListScreen> {
  static const _pageSize = 25;

  final _scroll = ScrollController();
  final _search = TextEditingController();
  Timer? _debounce;

  OrderTab _tab = OrderTab.all;
  String _query = '';
  final List<OrderSummary> _items = [];
  int _total = 0;
  int _page = 0;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  int _generation = 0; // discards answers for a tab or search that is no longer showing

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _reload();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    _search.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.hasClients && _scroll.position.extentAfter < 400) _loadMore();
  }

  /// Loads the first page again (tab or search changed, pull to refresh, or an order changed elsewhere).
  Future<void> _reload({bool keepList = false}) async {
    final generation = ++_generation;
    if (!keepList) {
      setState(() {
        _loading = true;
        _error = null;
        _items.clear();
        _page = 0;
        _total = 0;
      });
    }
    try {
      final page = await ref.read(ordersApiProvider).list(statuses: _tab.statuses, q: _query, page: 1, pageSize: _pageSize);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _page = 1;
        _total = page.total;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _loading = false;
        _error = e;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || _items.length >= _total || _error != null) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final page = await ref.read(ordersApiProvider).list(statuses: _tab.statuses, q: _query, page: _page + 1, pageSize: _pageSize);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items.addAll(page.items);
        _page = page.page;
        _total = page.total;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _setTab(OrderTab tab) {
    if (tab == _tab) return;
    setState(() => _tab = tab);
    if (_scroll.hasClients) _scroll.jumpTo(0);
    _reload();
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (value.trim() == _query) return;
      setState(() => _query = value.trim());
      _reload();
    });
  }

  Future<void> _newOrder() async {
    final created = await context.push<bool>('/orders/new');
    if (created == true) _reload(keepList: true);
  }

  Future<void> _print() async {
    final api = ref.read(ordersApiProvider);
    final count = _total;
    await showBatchPrintSheet(
      context,
      title: '${_tab.label}${_query.isEmpty ? '' : ' · "$_query"'} · $count ${count == 1 ? 'order' : 'orders'}',
      count: count,
      load: () async => api.detailsByIds((await api.matchingIds(statuses: _tab.statuses, q: _query)).ids),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Anything that changes an order elsewhere (status, cash, a new order) reloads the list in place.
    ref.listen(ordersVersionProvider, (_, _) => _reload(keepList: true));
    final counts = ref.watch(orderCountsProvider).value;

    return Scaffold(
      appBar: AppTopBar(
        title: 'Orders',
        actions: [
          IconButton(tooltip: 'Print orders', icon: const Icon(LucideIcons.printer, size: 22), onPressed: _total == 0 ? null : _print),
          FilledButton.icon(
            onPressed: _newOrder,
            icon: const Icon(LucideIcons.plus, size: 18),
            label: const Text('New'),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: _onSearch,
              textInputAction: TextInputAction.search,
              style: Theme.of(context).textTheme.bodyLarge,
              decoration: InputDecoration(
                hintText: 'Search number, name or phone',
                prefixIcon: const Icon(LucideIcons.search, size: 20, color: Brand.ink55),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        icon: const Icon(LucideIcons.x, size: 18),
                        onPressed: () {
                          _search.clear();
                          _onSearch('');
                          setState(() {});
                        },
                      ),
                filled: true,
                fillColor: Brand.panel,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
          _TabStrip(tab: _tab, counts: counts, onSelected: _setTab),
          const Divider(),
          Expanded(child: _content()),
        ],
      ),
    );
  }

  Widget _content() {
    if (_loading) return const Center(child: ZipLoader());
    if (_error != null && _items.isEmpty) {
      return EmptyState(
        icon: LucideIcons.triangleAlert,
        title: 'Could not load orders',
        message: _error is ApiError ? (_error as ApiError).message : 'Check your connection and try again.',
        actionLabel: 'Try again',
        onAction: _reload,
      );
    }
    if (_items.isEmpty) {
      final searching = _query.isNotEmpty;
      return RefreshIndicator(
        onRefresh: () => _reload(keepList: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: 360,
              child: EmptyState(
                icon: searching ? LucideIcons.searchX : LucideIcons.inbox,
                title: searching ? 'No orders match "$_query"' : (_tab == OrderTab.all ? 'No orders yet' : 'No ${_tab.label.toLowerCase()} orders'),
                message: searching ? 'Check the spelling, or search by order number or phone.' : 'New orders show up here the moment they are placed.',
                actionLabel: searching ? 'Clear search' : null,
                onAction: searching
                    ? () {
                        _search.clear();
                        _onSearch('');
                        setState(() {});
                      }
                    : null,
              ),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => _reload(keepList: true),
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: _items.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          if (i == _items.length) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: _loadingMore
                    ? const ZipLoader(width: 72)
                    : Text(_items.length >= _total ? '$_total ${_total == 1 ? 'order' : 'orders'}' : '', style: Theme.of(context).textTheme.labelSmall),
              ),
            );
          }
          return OrderCard(order: _items[i], onTap: () => context.push('/orders/${_items[i].id}'));
        },
      ),
    );
  }
}

/// The dashboard's underlined tabs with a count on each.
class _TabStrip extends StatelessWidget {
  const _TabStrip({required this.tab, required this.counts, required this.onSelected});

  final OrderTab tab;
  final OrderCounts? counts;
  final ValueChanged<OrderTab> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: OrderTab.values.length,
        separatorBuilder: (_, _) => const SizedBox(width: 22),
        itemBuilder: (context, i) {
          final t = OrderTab.values[i];
          final selected = t == tab;
          final n = counts == null ? null : t.count(counts!);
          return Semantics(
            button: true,
            selected: selected,
            child: InkWell(
              onTap: () => onSelected(t),
              child: Container(
                alignment: Alignment.center,
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: selected ? Brand.action : Colors.transparent, width: 2))),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(t.label, style: TextStyle(fontFamily: kFontFamily, fontSize: 13, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: selected ? Brand.action : Brand.ink70)),
                    if (n != null) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(color: selected ? Brand.actionTint : Brand.disabledBg, borderRadius: Radii.smAll),
                        child: Text('$n', style: TextStyle(fontFamily: kFontFamily, fontSize: 11, fontWeight: FontWeight.w500, color: selected ? Brand.actionDeep : Brand.ink70).tabular),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// One order in the list: number and status, who and where, what, how much and how long ago.
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, required this.onTap, this.now});

  final OrderSummary order;
  final VoidCallback onTap;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Material(
      color: Brand.white,
      shape: RoundedRectangleBorder(borderRadius: Radii.lgAll, side: const BorderSide(color: Brand.line)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(order.number, style: text.titleSmall?.copyWith(fontSize: 14).tabular)),
                  StatusPill(order.status),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                order.areaName.isEmpty ? order.customerName : '${order.customerName} · ${order.areaName}',
                style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (order.itemsSummary.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(order.itemsSummary, style: text.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(formatCents(order.totalCents), style: text.titleSmall?.tabular),
                  const SizedBox(width: 10),
                  Expanded(child: Text(timeAgo(order.placedAt, now: now), style: text.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  if (order.holdExpired) const Pill(label: 'Hold expired', tone: PillTone.danger),
                  if (order.cashSettled)
                    const Pill(label: 'Settled', tone: PillTone.success, icon: LucideIcons.checkCheck)
                  else if (order.cashCollected)
                    const Pill(label: 'Collected', tone: PillTone.success, icon: LucideIcons.check),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

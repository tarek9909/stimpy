import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_error.dart';
import '../../core/money.dart';
import '../../core/time_ago.dart';
import '../../theme/brand.dart';
import '../../theme/typography.dart';
import '../../ui/app_top_bar.dart';
import '../../ui/empty_state.dart';
import '../../ui/pill.dart';
import '../../ui/zip_line.dart';
import 'data/customer_models.dart';
import 'data/customers_api.dart';

/// Customers with search, the way the web lists them: most recent buyers first, 25 at a time, more as you scroll.
class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  static const _pageSize = 25;

  final _scroll = ScrollController();
  final _search = TextEditingController();
  Timer? _debounce;

  String _query = '';
  final List<CustomerRow> _items = [];
  int _total = 0;
  int _page = 0;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  int _generation = 0; // discards answers for a search that is no longer showing

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
      final page = await ref.read(customersApiProvider).list(q: _query, page: 1, pageSize: _pageSize);
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
      final page = await ref.read(customersApiProvider).list(q: _query, page: _page + 1, pageSize: _pageSize);
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

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (value.trim() == _query) return;
      setState(() => _query = value.trim());
      _reload();
    });
  }

  void _clearSearch() {
    _search.clear();
    _onSearch('');
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(
        title: 'Customers',
        actions: [IconButton(tooltip: 'Follow-ups', icon: const Icon(LucideIcons.bellRing, size: 20), onPressed: () => context.push('/follow-ups'))],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: (v) {
                setState(() {});
                _onSearch(v);
              },
              textInputAction: TextInputAction.search,
              style: Theme.of(context).textTheme.bodyLarge,
              decoration: InputDecoration(
                hintText: 'Search name, phone or email',
                prefixIcon: const Icon(LucideIcons.search, size: 20, color: Brand.ink55),
                suffixIcon: _search.text.isEmpty ? null : IconButton(tooltip: 'Clear search', icon: const Icon(LucideIcons.x, size: 18), onPressed: _clearSearch),
                filled: true,
                fillColor: Brand.panel,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
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
        title: 'Could not load customers',
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
                icon: searching ? LucideIcons.searchX : LucideIcons.users,
                title: searching ? 'No customers match "$_query"' : 'No customers yet',
                message: searching ? 'Check the spelling, or search by phone number or email.' : 'Customers appear here after their first order.',
                actionLabel: searching ? 'Clear search' : null,
                onAction: searching ? _clearSearch : null,
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
                    : Text(_items.length >= _total ? '$_total ${_total == 1 ? 'customer' : 'customers'}' : '', style: Theme.of(context).textTheme.labelSmall),
              ),
            );
          }
          return CustomerCard(customer: _items[i], onTap: () => context.push('/customers/${_items[i].id}'));
        },
      ),
    );
  }
}

/// One customer in the list: name and area, contact, orders and spend, and a returns warning when there is one.
class CustomerCard extends StatelessWidget {
  const CustomerCard({super.key, required this.customer, required this.onTap, this.now});

  final CustomerRow customer;
  final VoidCallback onTap;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final c = customer;
    final orders = '${c.ordersCount} ${c.ordersCount == 1 ? 'order' : 'orders'}';
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
                  Expanded(child: Text(c.name, style: text.titleSmall?.copyWith(fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis)),
                  if (c.warning) Pill(label: '${c.returnedCount} ${c.returnedCount == 1 ? 'return' : 'returns'}', tone: PillTone.danger, icon: LucideIcons.triangleAlert),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                [c.phone, if ((c.areaName ?? '').isNotEmpty) c.areaName!].join(' · '),
                style: text.bodySmall?.tabular,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (c.tags.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 4, children: [for (final t in c.tags) TagChip(tag: t)]),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(formatCents(c.totalSpentCents), style: text.titleSmall?.tabular),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      c.lastOrderAt == null ? orders : '$orders · ${timeAgo(c.lastOrderAt, now: now)}',
                      style: text.labelSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (c.optedOut) const Pill(label: 'Opted out', tone: PillTone.neutral),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A tag as a small outlined chip with its colour dot.
class TagChip extends StatelessWidget {
  const TagChip({super.key, required this.tag});
  final CustomerTag tag;

  static Color? _parse(String? hex) {
    if (hex == null) return null;
    final m = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(hex);
    return m == null ? null : Color(0xFF000000 | int.parse(m.group(1)!, radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final dot = _parse(tag.color) ?? Brand.ink55;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: Brand.panel, borderRadius: Radii.smAll, border: Border.all(color: Brand.line)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(tag.name, style: TextStyle(fontFamily: kFontFamily, fontSize: 11.5, fontWeight: FontWeight.w500, color: Brand.ink)),
        ],
      ),
    );
  }
}

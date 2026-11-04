import 'package:fl_chart/fl_chart.dart';
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
import '../../ui/stat_tile.dart';
import '../../ui/status_pill.dart';
import '../../ui/zip_line.dart';
import '../orders/data/order_models.dart';
import 'data/overview_api.dart';
import 'data/overview_models.dart';

/// The dashboard's Overview (dashboard-pages 4): today's numbers, what needs attention, the live drop, the last
/// seven days of sales, recent orders and the "Get ready to sell" checklist while it is incomplete.
class OverviewScreen extends ConsumerWidget {
  const OverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(overviewProvider);
    return Scaffold(
      appBar: const AppTopBar(title: 'Overview'),
      body: overview.when(
        // Keep showing the old numbers while a refresh is running.
        skipLoadingOnReload: true,
        loading: () => const Center(child: ZipLoader()),
        error: (e, _) => EmptyState(
          icon: LucideIcons.triangleAlert,
          title: 'Could not load the overview',
          message: e is ApiError ? e.message : 'Check your connection and try again.',
          actionLabel: 'Try again',
          onAction: () => ref.invalidate(overviewProvider),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () => ref.refresh(overviewProvider.future),
          child: _OverviewBody(data: data),
        ),
      ),
    );
  }
}

class _OverviewBody extends StatelessWidget {
  const _OverviewBody({required this.data});
  final Overview data;

  @override
  Widget build(BuildContext context) {
    final t = data.today;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        GridView(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, mainAxisExtent: 128),
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            StatTile(label: "Today's revenue", value: formatCents(t.revenueCents), icon: LucideIcons.dollarSign, note: 'Recorded today', highlight: true),
            StatTile(label: 'New orders', value: '${t.newOrders}', icon: LucideIcons.shoppingBag, note: 'Awaiting confirmation'),
            StatTile(label: 'To pack', value: '${t.toPack}', icon: LucideIcons.package, note: 'Ready to prepare'),
            StatTile(label: 'Out for delivery', value: '${t.outForDelivery}', icon: LucideIcons.truck, note: 'On the way'),
            StatTile(label: 'Cash to collect', value: formatCents(t.cashToCollectCents), icon: LucideIcons.wallet, note: 'Outstanding'),
          ],
        ),
        if (!data.setup.complete && data.setup.items.isNotEmpty) ...[const SizedBox(height: 14), _SetupCard(setup: data.setup)],
        const SizedBox(height: 14),
        _AttentionCard(items: data.attention),
        const SizedBox(height: 14),
        _LiveDropCard(drop: data.liveDrop),
        const SizedBox(height: 14),
        SalesChartCard(days: data.sales7d),
        const SizedBox(height: 14),
        _RecentOrdersCard(orders: data.recentOrders),
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Brand.white, borderRadius: Radii.lgAll, border: Border.all(color: Brand.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall)),
              ?trailing,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _Quiet extends StatelessWidget {
  const _Quiet(this.icon, this.title, this.message);
  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Icon(icon, size: 24, color: Brand.ink55),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [Text(title, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)), Text(message, style: text.bodySmall)],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------------------------- setup

class _SetupCard extends StatelessWidget {
  const _SetupCard({required this.setup});
  final SetupChecklist setup;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return _Panel(
      title: 'Get ready to sell',
      trailing: Text('${setup.doneCount} of ${setup.items.length}', style: text.labelSmall?.tabular),
      child: Column(
        children: [
          ClipRRect(
            borderRadius: Radii.smAll,
            child: LinearProgressIndicator(
              value: setup.items.isEmpty ? 0 : setup.doneCount / setup.items.length,
              minHeight: 6,
              color: Brand.action,
              backgroundColor: Brand.disabledBg,
            ),
          ),
          const SizedBox(height: 10),
          for (final item in setup.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(item.done ? LucideIcons.circleCheck : LucideIcons.circle, size: 18, color: item.done ? Brand.success : Brand.lineStrong),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.label, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500, decoration: item.done ? TextDecoration.lineThrough : null)),
                        if (!item.done && item.hint.isNotEmpty) Text(item.hint, style: text.bodySmall),
                      ],
                    ),
                  ),
                  if (item.required && !item.done) Text('Required', style: text.labelSmall?.copyWith(color: Brand.attentionFg)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------ attention

IconData _attentionIcon(AttentionType t) => switch (t) {
      AttentionType.newTooLong => LucideIcons.clock,
      AttentionType.outTooLong => LucideIcons.truck,
      AttentionType.holdExpired => LucideIcons.triangleAlert,
      AttentionType.emailFailed => LucideIcons.mail,
      AttentionType.lowStock => LucideIcons.packageX,
    };

class _AttentionCard extends StatefulWidget {
  const _AttentionCard({required this.items});
  final List<AttentionItem> items;

  @override
  State<_AttentionCard> createState() => _AttentionCardState();
}

class _AttentionCardState extends State<_AttentionCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final items = widget.items;
    final visible = _expanded ? items : items.take(3).toList();
    return _Panel(
      title: 'Needs attention',
      trailing: items.isEmpty
          ? null
          : Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
              decoration: BoxDecoration(color: Brand.attentionBg, borderRadius: Radii.smAll),
              child: Text('${items.length}', style: text.labelSmall?.copyWith(color: Brand.attentionFg, fontWeight: FontWeight.w600).tabular),
            ),
      child: items.isEmpty
          ? const _Quiet(LucideIcons.circleCheck, "You're all caught up", 'Nothing needs your attention right now.')
          : Column(
              children: [
                for (final a in visible)
                  InkWell(
                    onTap: a.orderId == null ? null : () => context.push('/orders/${a.orderId}'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          Icon(_attentionIcon(a.type), size: 18, color: Brand.attentionFg),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [Text(a.type.label, style: text.labelSmall), Text(a.label, style: text.bodyMedium)],
                            ),
                          ),
                          if (a.orderId != null) const Icon(LucideIcons.chevronRight, size: 16, color: Brand.ink55),
                        ],
                      ),
                    ),
                  ),
                if (items.length > 3)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: () => setState(() => _expanded = !_expanded),
                      child: Text(_expanded ? 'Show fewer' : 'View all ${items.length} alerts'),
                    ),
                  ),
              ],
            ),
    );
  }
}

// ---------------------------------------------------------------------------------------------- drop

/// "3 d 4 h left" from an end instant (the web's `timeLeft`).
String timeLeft(DateTime endsAt, {DateTime? now}) {
  final ms = endsAt.difference(now ?? DateTime.now()).inMilliseconds;
  if (ms <= 0) return 'Ended';
  final minutes = ms ~/ 60000;
  final days = minutes ~/ 1440;
  final hours = (minutes % 1440) ~/ 60;
  if (days > 0) return '$days d $hours h left';
  if (hours > 0) return '$hours h ${minutes % 60} min left';
  return '${minutes < 1 ? 1 : minutes} min left';
}

class _LiveDropCard extends StatelessWidget {
  const _LiveDropCard({required this.drop});
  final LiveDrop? drop;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final d = drop;
    return _Panel(
      title: 'Live drop',
      child: d == null
          ? Text('No active drop', style: text.bodySmall)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(d.name, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: Radii.smAll,
                  child: LinearProgressIndicator(value: d.progress, minHeight: 8, color: Brand.action, backgroundColor: Brand.disabledBg),
                ),
                const SizedBox(height: 8),
                Text('${d.unitsSold} of ${d.unitsTotal} units sold', style: text.bodySmall?.tabular),
                Text(d.endsAt == null ? 'No end date' : timeLeft(d.endsAt!), style: text.bodySmall),
              ],
            ),
    );
  }
}

// ---------------------------------------------------------------------------------------------- chart

enum SalesMetric {
  revenue('Revenue'),
  orders('Orders');

  const SalesMetric(this.label);
  final String label;
}

String _weekday(SalesDay d) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  final day = d.day;
  return day == null ? '' : names[day.toUtc().weekday - 1];
}

/// The last seven days as bars, revenue or order count (the web charts revenue; orders is the second view).
class SalesChartCard extends StatefulWidget {
  const SalesChartCard({super.key, required this.days});
  final List<SalesDay> days;

  @override
  State<SalesChartCard> createState() => _SalesChartCardState();
}

class _SalesChartCardState extends State<SalesChartCard> {
  SalesMetric _metric = SalesMetric.revenue;

  double _value(SalesDay d) => _metric == SalesMetric.revenue ? d.revenueCents / 100 : d.orders.toDouble();

  String _fmt(double v) => _metric == SalesMetric.revenue ? formatCents((v * 100).round()) : v.round().toString();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final days = widget.days;
    final totalCents = days.fold(0, (s, d) => s + d.revenueCents);
    final orders = days.fold(0, (s, d) => s + d.orders);
    final maxV = days.fold<double>(0, (m, d) => _value(d) > m ? _value(d) : m);
    final top = maxV < 4 ? 4.0 : (_metric == SalesMetric.revenue ? maxV * 1.15 : maxV + 1);
    return _Panel(
      title: 'Last 7 days',
      trailing: SegmentedButton<SalesMetric>(
        showSelectedIcon: false,
        style: const ButtonStyle(visualDensity: VisualDensity.compact, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
        segments: [for (final m in SalesMetric.values) ButtonSegment(value: m, label: Text(m.label, style: const TextStyle(fontSize: 12)))],
        selected: {_metric},
        onSelectionChanged: (s) => setState(() => _metric = s.first),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(formatCents(totalCents), style: text.titleLarge?.tabular),
          Text('from $orders ${orders == 1 ? 'order' : 'orders'}', style: text.bodySmall),
          const SizedBox(height: 14),
          if (days.isEmpty)
            Text('No sales data yet.', style: text.bodySmall)
          else
            SizedBox(
              height: 170,
              child: BarChart(
                BarChartData(
                  maxY: top,
                  minY: 0,
                  alignment: BarChartAlignment.spaceAround,
                  gridData: FlGridData(
                    drawVerticalLine: false,
                    horizontalInterval: top / 4,
                    getDrawingHorizontalLine: (_) => const FlLine(color: Brand.line, strokeWidth: 1),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(),
                    rightTitles: const AxisTitles(),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 44,
                        interval: top / 4,
                        getTitlesWidget: (v, meta) => v >= meta.max
                            ? const SizedBox.shrink()
                            : Text(_metric == SalesMetric.revenue ? '\$${v.round()}' : v.round().toString(), style: text.labelSmall?.tabular),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 24,
                        getTitlesWidget: (v, _) {
                          final i = v.toInt();
                          if (i < 0 || i >= days.length) return const SizedBox.shrink();
                          return Padding(padding: const EdgeInsets.only(top: 6), child: Text(_weekday(days[i]), style: text.labelSmall));
                        },
                      ),
                    ),
                  ),
                  barTouchData: BarTouchData(
                    touchTooltipData: BarTouchTooltipData(
                      getTooltipColor: (_) => Brand.ink,
                      getTooltipItem: (group, _, rod, _) => BarTooltipItem(
                        '${_weekday(days[group.x])}\n${_fmt(rod.toY)}',
                        const TextStyle(color: Brand.white, fontSize: 12),
                      ),
                    ),
                  ),
                  barGroups: [
                    for (var i = 0; i < days.length; i++)
                      BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(
                            toY: _value(days[i]),
                            width: 18,
                            color: Brand.action,
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sm)),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          if (days.isNotEmpty && totalCents == 0)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('No revenue recorded in the last 7 days.', style: text.labelSmall)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------------- recent

class _RecentOrdersCard extends StatelessWidget {
  const _RecentOrdersCard({required this.orders});
  final List<OrderSummary> orders;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return _Panel(
      title: 'Recent orders',
      child: orders.isEmpty
          ? const _Quiet(LucideIcons.shoppingBag, 'No orders yet', 'Your first customer order will appear here.')
          : Column(
              children: [
                for (final o in orders)
                  InkWell(
                    onTap: () => context.push('/orders/${o.id}'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(o.number, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600).tabular),
                                Text(
                                  '${o.customerName} · ${formatCents(o.totalCents)} · ${timeAgo(o.placedAt)}',
                                  style: text.bodySmall,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          StatusPill(o.status),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

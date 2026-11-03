import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api_error.dart';
import '../../../core/launch.dart';
import '../../../core/money.dart';
import '../../../core/order_status.dart';
import '../../../theme/brand.dart';
import '../../../theme/typography.dart';
import '../../../ui/app_text_field.dart';
import '../../../ui/empty_state.dart';
import '../../../ui/net_image.dart';
import '../../../ui/pill.dart';
import '../../../ui/status_pill.dart';
import '../../../ui/zip_line.dart';
import '../data/order_models.dart';
import '../data/orders_api.dart';
import '../new_order/order_catalog.dart';
import '../print/print_sheet.dart';
import 'order_media.dart';
import 'status_actions.dart';

final DateFormat _when = DateFormat('EEE d MMM, HH:mm');
String _fmt(DateTime? d) => d == null ? '' : _when.format(d);

/// One order: its designs, customer, delivery, cash, timeline and notes, with the status actions at the bottom and
/// printing in the top bar. Everything shown is the server's order; changes replace it with the server's answer.
class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final int orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  OrderDetail? _order;
  Object? _error;
  bool _loading = true;
  final _noteController = TextEditingController();
  bool _noteBusy = false;
  String? _noteError;
  bool _cashBusy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    try {
      final order = await ref.read(ordersApiProvider).detail(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  /// Takes the server's order and tells the list and the counts to reload.
  void _apply(OrderDetail order, {String? toast}) {
    setState(() => _order = order);
    ref.read(ordersVersionProvider.notifier).bump();
    if (toast != null) _snack(toast);
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _stale(OrderStatus now) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('This order is now ${now.label}'),
        content: const Text('Someone else changed it, or it was changed on another device. The buttons now match its current status.'),
        actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
      ),
    );
    if (mounted) {
      await _load(quiet: true);
      ref.read(ordersVersionProvider.notifier).bump();
    }
  }

  Future<void> _setCash({bool? collected, bool? settled}) async {
    setState(() => _cashBusy = true);
    try {
      final updated = await ref.read(ordersApiProvider).setCash(widget.orderId, collected: collected, settled: settled);
      if (!mounted) return;
      _apply(updated, toast: settled != null ? (settled ? 'Cash marked as settled.' : 'Cash settled removed.') : (collected! ? 'Cash marked as collected.' : 'Cash collected removed.'));
    } on ApiError catch (e) {
      if (mounted) _snack(e.message);
    } finally {
      if (mounted) setState(() => _cashBusy = false);
    }
  }

  Future<void> _addNote() async {
    final body = _noteController.text.trim();
    if (body.isEmpty) {
      setState(() => _noteError = 'Write a note first.');
      return;
    }
    setState(() {
      _noteBusy = true;
      _noteError = null;
    });
    try {
      final updated = await ref.read(ordersApiProvider).addNote(widget.orderId, body);
      if (!mounted) return;
      _noteController.clear();
      _apply(updated, toast: 'Note added.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _noteError = e.fields['body'] ?? e.message);
    } finally {
      if (mounted) setState(() => _noteBusy = false);
    }
  }

  Future<void> _extendHold() async {
    final hours = await showDialog<int>(context: context, builder: (context) => const _ExtendHoldDialog());
    if (hours == null || !mounted) return;
    try {
      final updated = await ref.read(ordersApiProvider).extendHold(widget.orderId, hours);
      if (mounted) _apply(updated, toast: 'Hold extended by $hours ${hours == 1 ? 'hour' : 'hours'}.');
    } on ApiError catch (e) {
      if (mounted) _snack(e.message);
    }
  }

  Future<void> _whatsapp(OrderDetail o) async {
    final number = o.contact.whatsapp.isNotEmpty ? o.contact.whatsapp : o.contact.phone;
    final template = _whatsappTemplate(o.status);
    Uri uri = whatsappChatUri(number);
    if (template != null) {
      try {
        uri = Uri.parse((await ref.read(ordersApiProvider).whatsapp(o.id, template)).url);
      } on ApiError catch (e) {
        if (mounted) _snack(e.message);
        return;
      }
    }
    if (!await openExternal(uri) && mounted) _snack('WhatsApp could not be opened.');
  }

  static String? _whatsappTemplate(OrderStatus s) => switch (s) {
        OrderStatus.newOrder || OrderStatus.confirmed => 'order_confirmation',
        OrderStatus.packed => 'ready_for_delivery',
        OrderStatus.outForDelivery => 'out_for_delivery',
        OrderStatus.delivered => 'delivered',
        _ => null,
      };

  Future<void> _editDeliveryNumber(OrderDetail o) async {
    final controller = TextEditingController(text: o.deliveryNumber ?? '');
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delivery number'),
        content: AppTextField(label: 'Delivery number', controller: controller, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    if (value == null || value.isEmpty || !mounted) return;
    try {
      final updated = await ref.read(ordersApiProvider).setDeliveryNumber(o.id, value);
      if (mounted) _apply(updated, toast: 'Delivery number saved.');
    } on ApiError catch (e) {
      if (mounted) _snack(e.fields['deliveryNumber'] ?? e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return Scaffold(
      appBar: AppBar(
        title: Text(order?.number ?? 'Order'),
        actions: [
          if (order != null)
            IconButton(
              tooltip: 'Print',
              icon: const Icon(LucideIcons.printer, size: 22),
              onPressed: () => showPrintSheet(context, orders: [order], title: order.number),
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: _body(order),
      bottomNavigationBar: order == null ? null : StatusActionBar(order: order, onChanged: (o) => _apply(o, toast: 'Order ${o.number} is now ${o.status.label}.'), onStale: _stale),
    );
  }

  Widget _body(OrderDetail? order) {
    if (order == null) {
      if (_loading) return const Center(child: ZipLoader());
      final notFound = _error is ApiError && (_error as ApiError).statusCode == 404;
      return EmptyState(
        icon: notFound ? LucideIcons.searchX : LucideIcons.triangleAlert,
        title: notFound ? 'Order not found' : 'Could not load this order',
        message: notFound ? 'It may have been removed.' : (_error is ApiError ? (_error as ApiError).message : 'Check your connection and try again.'),
        actionLabel: notFound ? null : 'Try again',
        onAction: notFound ? null : _load,
      );
    }

    final needsCatalog = order.items.any((i) => !resolveItemMedia(i, null).complete || (resolveItemMedia(i, null).hoodieImage == null && !i.isStimpiePack));
    final catalog = needsCatalog ? ref.watch(orderCatalogProvider).value : null;

    return RefreshIndicator(
      onRefresh: () => _load(quiet: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          _Header(order: order),
          if (order.status == OrderStatus.cancelled && (order.cancelReason ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            _Notice(icon: LucideIcons.circleX, tone: Brand.neutral, text: 'Cancelled: ${order.cancelReason}'),
          ],
          for (final w in order.warnings) ...[
            const SizedBox(height: 12),
            _Notice(
              icon: LucideIcons.triangleAlert,
              tone: Brand.attentionFg,
              text: 'Delivery number ${w.deliveryNumber} is also used by ${w.orderIds.length > 1 ? '${w.orderIds.length - 1} other orders' : 'another order'}. That is allowed, but check it is right.',
            ),
          ],
          _holdBlock(order),
          const SizedBox(height: 16),
          _Section(
            title: 'Designs',
            child: Column(children: [
              for (var i = 0; i < order.items.length; i++) ...[
                if (i > 0) const Divider(height: 24),
                _ItemTile(item: order.items[i], media: resolveItemMedia(order.items[i], catalog)),
              ],
            ]),
          ),
          _Section(
            title: 'Customer',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(order.customer.name, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 15)),
                const SizedBox(height: 6),
                _Line(icon: LucideIcons.phone, text: order.contact.phone, copy: true),
                if (order.contact.whatsapp.isNotEmpty && order.contact.whatsapp != order.contact.phone) _Line(icon: LucideIcons.messageCircle, text: order.contact.whatsapp, copy: true),
                if ((order.contact.email ?? '').isNotEmpty) _Line(icon: LucideIcons.mail, text: order.contact.email!, copy: true),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        if (!await openExternal(telUri(order.contact.phone)) && mounted) _snack('The dialler could not be opened.');
                      },
                      icon: const Icon(LucideIcons.phone, size: 18),
                      label: const Text('Call'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _whatsapp(order),
                      icon: const Icon(LucideIcons.messageCircle, size: 18),
                      label: const Text('WhatsApp'),
                    ),
                  ),
                ]),
              ],
            ),
          ),
          _Section(
            title: 'Delivery',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Line(icon: LucideIcons.mapPin, text: order.delivery.address, copy: true),
                _Line(icon: LucideIcons.map, text: order.delivery.areaName),
                if ((order.delivery.notes ?? '').isNotEmpty) _Line(icon: LucideIcons.notebookPen, text: order.delivery.notes!),
                if ((order.deliveryNumber ?? '').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(children: [
                      const Icon(LucideIcons.truck, size: 18, color: Brand.ink55),
                      const SizedBox(width: 10),
                      Expanded(child: Text('Delivery no. ${order.deliveryNumber}', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600).tabular)),
                      if (order.status == OrderStatus.outForDelivery) TextButton(onPressed: () => _editDeliveryNumber(order), child: const Text('Change')),
                    ]),
                  ),
              ],
            ),
          ),
          _Section(title: 'Payment', child: _paymentBlock(order)),
          _Section(title: 'Timeline', child: _timeline(order)),
          _Section(title: 'Notes', child: _notes(order)),
          if (order.emails.isNotEmpty) _Section(title: 'Emails', child: _emails(order)),
        ],
      ),
    );
  }

  Widget _holdBlock(OrderDetail o) {
    if (o.status != OrderStatus.newOrder || o.holdExpiresAt == null) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    final expired = o.holdExpired;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: expired ? Brand.danger.withValues(alpha: 0.07) : Brand.panel,
          border: Border.all(color: expired ? Brand.danger.withValues(alpha: 0.4) : Brand.line),
          borderRadius: Radii.lgAll,
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(LucideIcons.clock, size: 20, color: expired ? Brand.danger : Brand.ink55),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(expired ? 'Hold expired' : 'Stock held until ${_fmt(o.holdExpiresAt)}', style: text.titleSmall?.copyWith(color: expired ? Brand.danger : Brand.ink)),
                    if (expired) Text('These items may be sold to someone else.', style: text.labelSmall),
                  ],
                ),
              ),
              TextButton(onPressed: _extendHold, child: const Text('Extend')),
            ],
          ),
        ),
      ),
    );
  }

  Widget _paymentBlock(OrderDetail o) {
    final text = Theme.of(context).textTheme;
    Widget row(String l, String v, {bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(children: [
            Expanded(child: Text(l, style: strong ? text.titleSmall : text.bodyMedium)),
            Text(v, style: (strong ? text.titleMedium : text.bodyMedium)?.tabular),
          ]),
        );
    final delivered = o.status == OrderStatus.delivered;
    return Column(
      children: [
        row('Subtotal', formatCents(o.subtotalCents)),
        row('Delivery fee', formatCents(o.deliveryFeeCents)),
        const Divider(height: 16),
        row('Total (cash on delivery)', formatCents(o.totalCents), strong: true),
        const SizedBox(height: 8),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text('Cash collected', style: text.bodyMedium),
          subtitle: delivered ? null : Text('Available once the order is delivered.', style: text.labelSmall),
          value: o.cashCollected,
          onChanged: (!delivered || _cashBusy) ? null : (v) => _setCash(collected: v),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text('Cash settled', style: text.bodyMedium),
          subtitle: Text(
            delivered && !o.cashCollected ? 'Collect the cash first.' : 'You received the money from the courier.',
            style: text.labelSmall,
          ),
          value: o.cashSettled,
          onChanged: (!delivered || !o.cashCollected || _cashBusy) ? null : (v) => _setCash(settled: v),
        ),
        if (o.status == OrderStatus.returned) Align(alignment: Alignment.centerLeft, child: Text('Returning an order resets both cash flags.', style: text.labelSmall)),
      ],
    );
  }

  Widget _timeline(OrderDetail o) {
    final text = Theme.of(context).textTheme;
    if (o.events.isEmpty) return Text('No changes yet.', style: text.bodySmall);
    final events = o.events; // the API sends them newest first
    return Column(
      children: [
        for (var i = 0; i < events.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 22,
                  child: Column(
                    children: [
                      Container(width: 10, height: 10, margin: const EdgeInsets.only(top: 6), decoration: BoxDecoration(color: i == 0 ? Brand.action : Brand.controlBorder, shape: BoxShape.circle)),
                      if (i < events.length - 1) Expanded(child: Container(width: 2, color: Brand.line)),
                    ],
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                          StatusPill(events[i].to),
                          Text(_fmt(events[i].at), style: text.labelSmall),
                        ]),
                        if ((events[i].by ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 3), child: Text('by ${events[i].by}', style: text.labelSmall)),
                        if ((events[i].note ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 3), child: Text(events[i].note!, style: text.bodySmall?.copyWith(color: Brand.ink))),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _notes(OrderDetail o) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final n in o.notes) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Brand.panel, borderRadius: Radii.mdAll, border: Border.all(color: Brand.line)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(n.body, style: text.bodyMedium),
                const SizedBox(height: 4),
                Text('${n.by} · ${_fmt(n.at)}', style: text.labelSmall),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
        AppTextField(
          label: 'Add a note',
          controller: _noteController,
          hint: 'Only your team sees this',
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          errorText: _noteError,
          onChanged: (_) {
            if (_noteError != null) setState(() => _noteError = null);
          },
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: OutlinedButton(
            onPressed: _noteBusy ? null : _addNote,
            child: _noteBusy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Add note'),
          ),
        ),
      ],
    );
  }

  Widget _emails(OrderDetail o) {
    final text = Theme.of(context).textTheme;
    return Column(
      children: [
        for (final e in o.emails)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_emailName(e.template), style: text.bodyMedium),
                    Text('${e.to} · ${_fmt(e.at)}', style: text.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              Pill(label: e.status[0] + e.status.substring(1).toLowerCase(), tone: e.status == 'SENT' ? PillTone.success : (e.status == 'FAILED' ? PillTone.danger : PillTone.cream)),
            ]),
          ),
      ],
    );
  }

  static String _emailName(String key) =>
      const {
        'order_received': 'Order received',
        'order_confirmed': 'Order confirmed',
        'order_out_for_delivery': 'On its way',
        'order_delivered': 'Delivered',
        'order_cancelled': 'Order cancelled',
        'custom': 'Message from you',
      }[key] ??
      key.replaceAll('_', ' ');
}

// ------------------------------------------------------------------ pieces

class _Header extends StatelessWidget {
  const _Header({required this.order});
  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(order.number, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700).tabular),
                      const SizedBox(height: 2),
                      Text('${_fmt(order.placedAt)} · ${sourceLabels[order.source] ?? order.source}', style: text.bodySmall),
                    ],
                  ),
                ),
                StatusPill(order.status, large: true),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Text(formatCents(order.totalCents), style: text.headlineMedium?.tabular),
                const SizedBox(width: 8),
                Text('to collect', style: text.bodySmall),
              ],
            ),
            if (order.holdExpired || order.cashCollected || order.cashSettled || order.emails.any((e) => e.status == 'FAILED')) ...[
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 6, children: [
                if (order.holdExpired) const Pill(label: 'Hold expired', tone: PillTone.danger),
                if (order.cashCollected) const Pill(label: 'Cash collected', tone: PillTone.success, icon: LucideIcons.check),
                if (order.cashSettled) const Pill(label: 'Cash settled', tone: PillTone.success, icon: LucideIcons.checkCheck),
                if (order.emails.any((e) => e.status == 'FAILED')) const Pill(label: 'Email failed', tone: PillTone.danger),
              ]),
            ],
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.tone, required this.text});
  final IconData icon;
  final Color tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: tone.withValues(alpha: 0.08), borderRadius: Radii.mdAll, border: Border.all(color: tone.withValues(alpha: 0.35))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: tone),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Brand.ink))),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text, this.copy = false});
  final IconData icon;
  final String text;
  final bool copy;

  @override
  Widget build(BuildContext context) {
    final body = Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 2), child: Icon(icon, size: 18, color: Brand.ink55)),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.tabular)),
        ],
      ),
    );
    if (!copy) return body;
    return InkWell(
      borderRadius: Radii.mdAll,
      onLongPress: () async {
        await Clipboard.setData(ClipboardData(text: text));
        if (context.mounted) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(const SnackBar(content: Text('Copied.')));
        }
      },
      child: body,
    );
  }
}

/// One order line with its design: the hoodie picture with colour and size, and each Stimpie with its picture.
class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, required this.media});
  final OrderItem item;
  final ResolvedMedia media;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final d = item.details;
    final showHoodie = !item.isStimpiePack && (media.hoodieImage != null || d.hoodie != null || item.kind == 'HOODIE' || item.kind == 'PACK');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: Text(item.name, style: text.titleSmall?.copyWith(fontSize: 14))),
            Text('${item.qty} × ${formatCents(item.unitPriceCents)}', style: text.labelMedium?.copyWith(color: Brand.muted).tabular),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showHoodie) ...[
              Column(
                children: [
                  SizedBox(width: 92, height: 115, child: NetImage(url: media.hoodieImage, icon: LucideIcons.shirt)),
                  const SizedBox(height: 6),
                  if ((d.color ?? '').isNotEmpty || (d.size ?? '').isNotEmpty)
                    Wrap(spacing: 4, runSpacing: 4, alignment: WrapAlignment.center, children: [
                      if ((d.color ?? '').isNotEmpty) Pill(label: d.color!, tone: PillTone.cream),
                      if ((d.size ?? '').isNotEmpty) Pill(label: d.size!, tone: PillTone.black),
                    ]),
                ],
              ),
              const SizedBox(width: 14),
            ],
            Expanded(
              child: media.stimpies.isEmpty
                  ? const SizedBox.shrink()
                  : Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [for (final s in media.stimpies) _StimpieThumb(media: s)],
                    ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: Text(formatCents(item.lineTotalCents), style: text.titleSmall?.tabular)),
      ],
    );
  }
}

class _StimpieThumb extends StatelessWidget {
  const _StimpieThumb({required this.media});
  final StimpieMedia media;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SizedBox(
      width: 64,
      child: Column(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              SizedBox(width: 64, height: 100, child: NetImage(url: media.imageUrl, icon: LucideIcons.layers)),
              if (media.qty > 1)
                Positioned(
                  right: -4,
                  top: -4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(10)),
                    child: Text('×${media.qty}', style: const TextStyle(fontFamily: kFontFamily, fontSize: 11, fontWeight: FontWeight.w600, color: Brand.white)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(media.name, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: text.labelSmall?.copyWith(color: Brand.ink, fontSize: 10.5, height: 1.2)),
        ],
      ),
    );
  }
}

class _ExtendHoldDialog extends StatefulWidget {
  const _ExtendHoldDialog();

  @override
  State<_ExtendHoldDialog> createState() => _ExtendHoldDialogState();
}

class _ExtendHoldDialogState extends State<_ExtendHoldDialog> {
  final _hours = TextEditingController(text: '12');
  String? _error;

  @override
  void dispose() {
    _hours.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Extend hold'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('The stock stays reserved until now plus the hours you enter.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 14),
          AppTextField(
            label: 'Hours',
            controller: _hours,
            helper: '1 to 168 hours.',
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            errorText: _error,
            autofocus: true,
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final h = int.tryParse(_hours.text.trim());
            if (h == null || h < 1 || h > 168) {
              setState(() => _error = 'Enter 1 to 168 hours.');
              return;
            }
            Navigator.of(context).pop(h);
          },
          child: const Text('Extend hold'),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api_error.dart';
import '../../../core/money.dart';
import '../../../core/order_status.dart';
import '../../../theme/brand.dart';
import '../../../theme/typography.dart';
import '../../../ui/app_text_field.dart';
import '../../../ui/error_banner.dart';
import '../data/order_models.dart';
import '../data/orders_api.dart';

/// Button label per target status (dashboard-pages 6.3). New is never offered: nothing leads back to it.
const Map<OrderStatus, String> statusActionLabel = {
  OrderStatus.confirmed: 'Confirm order',
  OrderStatus.packed: 'Mark as packed',
  OrderStatus.outForDelivery: 'Send out for delivery',
  OrderStatus.delivered: 'Mark delivered',
  OrderStatus.returned: 'Mark returned',
  OrderStatus.cancelled: 'Cancel order',
};

const List<OrderStatus> _forwardOrder = [OrderStatus.confirmed, OrderStatus.packed, OrderStatus.outForDelivery, OrderStatus.delivered];
const List<String> cancelReasonChips = ["Customer changed mind", "Couldn't reach customer", 'Out of stock', 'Duplicate order'];

/// What the status bar shows for an order: the main forward action, then everything else.
class StatusActionPlan {
  const StatusActionPlan({required this.primary, required this.more});

  /// The one blue button (next step of the flow), or null when only return/cancel remain.
  final OrderStatus? primary;

  /// Return, cancel and any further forward step, in display order.
  final List<OrderStatus> more;

  bool get isEmpty => primary == null && more.isEmpty;

  /// Buttons come ONLY from the server's `allowedTransitions`; nothing is worked out here.
  factory StatusActionPlan.from(List<OrderStatus> allowed) {
    final offered = allowed.where(statusActionLabel.containsKey).toList();
    final forward = _forwardOrder.where(offered.contains).toList();
    final rest = offered.where((s) => !forward.contains(s)).toList();
    final secondary = [
      ...rest.where((s) => s == OrderStatus.returned),
      ...rest.where((s) => s == OrderStatus.cancelled),
      ...rest.where((s) => s != OrderStatus.returned && s != OrderStatus.cancelled),
    ];
    return StatusActionPlan(primary: forward.isEmpty ? null : forward.first, more: [...forward.skip(1), ...secondary]);
  }
}

/// The action bar at the bottom of the order screen. [onChanged] receives the server's order after a change;
/// [onStale] fires when someone else already moved the order (the screen then reloads it).
class StatusActionBar extends ConsumerWidget {
  const StatusActionBar({super.key, required this.order, required this.onChanged, required this.onStale});

  final OrderDetail order;
  final ValueChanged<OrderDetail> onChanged;
  final ValueChanged<OrderStatus> onStale;

  Future<void> _open(BuildContext context, OrderStatus to) async {
    final result = await showStatusSheet(context, order: order, to: to);
    if (result == null) return;
    switch (result) {
      case StatusChanged(:final order):
        onChanged(order);
      case StatusStale(:final now):
        onStale(now);
    }
  }

  Future<void> _more(BuildContext context, List<OrderStatus> actions) async {
    final to = await showModalBottomSheet<OrderStatus>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final s in actions)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                leading: Icon(s.icon, size: 20, color: s == OrderStatus.cancelled ? Brand.danger : Brand.ink70),
                title: Text(statusActionLabel[s]!, style: TextStyle(fontFamily: kFontFamily, fontSize: 14, fontWeight: FontWeight.w500, color: s == OrderStatus.cancelled ? Brand.danger : Brand.ink)),
                onTap: () => Navigator.of(context).pop(s),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (to != null && context.mounted) await _open(context, to);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plan = StatusActionPlan.from(order.allowedTransitions);
    if (plan.isEmpty) return const SizedBox.shrink();
    final primary = plan.primary;
    // With no forward step left (e.g. Delivered), a single remaining action (Return) is shown as a plain button.
    final soleSecondary = primary == null && plan.more.length == 1 ? plan.more.first : null;

    return DecoratedBox(
      decoration: const BoxDecoration(color: Brand.white, border: Border(top: BorderSide(color: Brand.line))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              if (primary != null)
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => _open(context, primary),
                    icon: Icon(primary.icon, size: 18),
                    label: Text(statusActionLabel[primary]!),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  ),
                )
              else if (soleSecondary != null)
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _open(context, soleSecondary),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      foregroundColor: soleSecondary == OrderStatus.cancelled ? Brand.danger : Brand.ink,
                      side: BorderSide(color: soleSecondary == OrderStatus.cancelled ? Brand.danger : Brand.controlBorder),
                    ),
                    child: Text(statusActionLabel[soleSecondary]!),
                  ),
                ),
              if (soleSecondary == null && plan.more.isNotEmpty) ...[
                if (primary != null) const SizedBox(width: 10),
                if (primary != null)
                  OutlinedButton(
                    onPressed: () => _more(context, plan.more),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(56, 48), padding: const EdgeInsets.symmetric(horizontal: 14)),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [Icon(LucideIcons.ellipsis, size: 20), SizedBox(width: 6), Text('More')]),
                  )
                else
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _more(context, plan.more),
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                      child: const Text('Order actions'),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Outcome of the status sheet.
sealed class StatusResult {
  const StatusResult();
}

class StatusChanged extends StatusResult {
  const StatusChanged(this.order);
  final OrderDetail order;
}

/// The order was already moved by someone else (INVALID_TRANSITION). [now] is where it is.
class StatusStale extends StatusResult {
  const StatusStale(this.now);
  final OrderStatus now;
}

Future<StatusResult?> showStatusSheet(BuildContext context, {required OrderDetail order, required OrderStatus to}) {
  return showModalBottomSheet<StatusResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => StatusSheet(order: order, to: to),
  );
}

class _Copy {
  const _Copy(this.title, this.confirm, this.body, {this.cancel = 'Cancel'});
  final String title;
  final String confirm;
  final String body;
  final String cancel;
}

/// The confirmation for one status change, with the inputs that status needs
/// (dashboard-pages 6.3): delivery number to send out, a reason to cancel, restock choice for a delivered return.
class StatusSheet extends ConsumerStatefulWidget {
  const StatusSheet({super.key, required this.order, required this.to});

  final OrderDetail order;
  final OrderStatus to;

  @override
  ConsumerState<StatusSheet> createState() => _StatusSheetState();
}

class _StatusSheetState extends ConsumerState<StatusSheet> {
  final _note = TextEditingController();
  final _deliveryNumber = TextEditingController();
  final _reason = TextEditingController();
  bool _restock = true;
  bool _busy = false;
  String? _banner;
  Map<String, String> _errors = {};

  OrderDetail get _order => widget.order;
  OrderStatus get _to => widget.to;
  bool get _hasEmail => (_order.contact.email ?? '').isNotEmpty;
  bool get _wasDelivered => _order.status == OrderStatus.delivered;

  @override
  void dispose() {
    _note.dispose();
    _deliveryNumber.dispose();
    _reason.dispose();
    super.dispose();
  }

  _Copy get _copy {
    final num = _order.number;
    return switch (_to) {
      OrderStatus.confirmed => _Copy('Confirm $num?', 'Confirm order',
          'Only confirm once the customer has confirmed on WhatsApp or by phone.${_hasEmail ? " The customer is emailed 'Order confirmed'." : ''}'),
      OrderStatus.packed => _Copy('Mark $num as packed?', 'Mark as packed', 'The parcel is ready for delivery.'),
      OrderStatus.outForDelivery => _Copy('Send $num out for delivery?', 'Send out for delivery',
          "Enter the delivery number from the delivery slip.${_hasEmail ? " The customer is emailed 'On its way' with this number." : ''}"),
      OrderStatus.delivered =>
        _Copy('Mark $num as delivered?', 'Mark delivered', 'The customer received the order. ${formatCents(_order.totalCents)} cash is now expected.'),
      OrderStatus.returned => _Copy('Mark $num as returned?', 'Mark returned',
          'Failed delivery or accepted return. Cash collected and settled flags are reset.${_wasDelivered ? '' : ' The items go back on the shelf.'}'),
      OrderStatus.cancelled => _Copy('Cancel $num?', 'Cancel order',
          "Reserved items go back in stock.${_hasEmail ? " The customer is emailed 'Order cancelled' with your reason." : ''}",
          cancel: 'Keep order'),
      OrderStatus.newOrder => const _Copy('', '', ''),
    };
  }

  Future<void> _submit() async {
    final errors = <String, String>{};
    String? deliveryNumber;
    String? cancelReason;
    String? note;
    if (_to == OrderStatus.outForDelivery) {
      final v = _deliveryNumber.text.trim();
      if (v.isEmpty) {
        errors['deliveryNumber'] = 'Enter the delivery number.';
      } else if (v.length > 60) {
        errors['deliveryNumber'] = 'Use at most 60 characters.';
      } else {
        deliveryNumber = v;
      }
    }
    if (_to == OrderStatus.cancelled) {
      final r = _reason.text.trim();
      if (r.length < 3) {
        errors['cancelReason'] = 'Give a reason of at least 3 characters.';
      } else if (r.length > 255) {
        errors['cancelReason'] = 'Use at most 255 characters.';
      } else {
        cancelReason = r;
      }
    }
    if (_to == OrderStatus.confirmed || _to == OrderStatus.packed || _to == OrderStatus.returned) {
      final n = _note.text.trim();
      if (n.length > 500) {
        errors['note'] = 'Use at most 500 characters.';
      } else if (n.isNotEmpty) {
        note = n;
      }
    }
    if (errors.isNotEmpty) {
      setState(() => _errors = errors);
      return;
    }

    setState(() {
      _busy = true;
      _banner = null;
      _errors = {};
    });
    try {
      final updated = await ref.read(ordersApiProvider).changeStatus(
            _order.id,
            to: _to,
            note: note,
            cancelReason: cancelReason,
            deliveryNumber: deliveryNumber,
            restock: (_to == OrderStatus.returned && _wasDelivered) ? _restock : null,
          );
      if (!mounted) return;
      Navigator.of(context).pop(StatusChanged(updated));
    } on ApiError catch (e) {
      if (!mounted) return;
      if (e.code == 'INVALID_TRANSITION') {
        // Someone (or another device) changed the order: report where it is now; the screen reloads it.
        final from = e.details?['from'];
        Navigator.of(context).pop(StatusStale(OrderStatus.fromApi(from is String ? from : _order.status.apiValue)));
        return;
      }
      setState(() {
        _busy = false;
        if (e.code == 'DELIVERY_NUMBER_REQUIRED') {
          _errors = {'deliveryNumber': 'Enter the delivery number.'};
        } else if (e.fields.isNotEmpty) {
          _errors = {
            if (e.fields['deliveryNumber'] != null) 'deliveryNumber': e.fields['deliveryNumber']!,
            if (e.fields['cancelReason'] != null) 'cancelReason': e.fields['cancelReason']!,
            if (e.fields['note'] != null) 'note': e.fields['note']!,
          };
          if (_errors.isEmpty) _banner = e.message;
        } else {
          _banner = e.message;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final copy = _copy;
    final destructive = _to == OrderStatus.cancelled;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: destructive ? Brand.danger.withValues(alpha: 0.1) : Brand.surface, borderRadius: Radii.mdAll),
                  child: Icon(_to.icon, size: 20, color: destructive ? Brand.danger : Brand.ink70),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(copy.title, style: text.titleLarge)),
              ],
            ),
            const SizedBox(height: 10),
            Text(copy.body, style: text.bodySmall),
            const SizedBox(height: 18),
            if (_banner != null) ...[ErrorBanner(message: _banner!), const SizedBox(height: 14)],
            if (_to == OrderStatus.outForDelivery)
              AppTextField(
                label: 'Delivery number',
                controller: _deliveryNumber,
                hint: 'From the delivery slip',
                autofocus: true,
                textInputAction: TextInputAction.done,
                errorText: _errors['deliveryNumber'],
                onChanged: (_) => setState(() => _errors = {..._errors}..remove('deliveryNumber')),
                onSubmitted: (_) => _submit(),
              ),
            if (_to == OrderStatus.cancelled) ...[
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final chip in cancelReasonChips)
                  ActionChip(
                    label: Text(chip),
                    onPressed: () => setState(() {
                      _reason.text = chip;
                      _errors = {..._errors}..remove('cancelReason');
                    }),
                    side: const BorderSide(color: Brand.controlBorder),
                    backgroundColor: _reason.text == chip ? Brand.actionTint : Brand.white,
                    labelStyle: text.labelMedium?.copyWith(color: Brand.ink),
                    shape: RoundedRectangleBorder(borderRadius: Radii.mdAll),
                  ),
              ]),
              const SizedBox(height: 14),
              AppTextField(
                label: 'Reason',
                controller: _reason,
                helper: 'Saved on the order and sent to the customer if they have an email.',
                minLines: 2,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                errorText: _errors['cancelReason'],
                onChanged: (_) => setState(() => _errors = {..._errors}..remove('cancelReason')),
              ),
            ],
            if (_to == OrderStatus.returned && _wasDelivered) ...[
              Text('What happens to the items?', style: text.labelLarge),
              RadioGroup<bool>(
                groupValue: _restock,
                onChanged: (v) => setState(() => _restock = v ?? true),
                child: Column(children: [
                  RadioListTile<bool>(contentPadding: EdgeInsets.zero, value: true, title: Text('Put the items back in stock', style: text.bodyMedium)),
                  RadioListTile<bool>(contentPadding: EdgeInsets.zero, value: false, title: Text("Write off as damaged (don't restock)", style: text.bodyMedium)),
                ]),
              ),
              const SizedBox(height: 6),
            ],
            if (_to == OrderStatus.confirmed || _to == OrderStatus.packed || _to == OrderStatus.returned) ...[
              AppTextField(
                label: 'Note',
                controller: _note,
                optional: true,
                minLines: 2,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                errorText: _errors['note'],
                onChanged: (_) => setState(() => _errors = {..._errors}..remove('note')),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), backgroundColor: destructive ? Brand.danger : Brand.action),
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Brand.white))
                  : Text(copy.confirm),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(44), foregroundColor: Brand.ink70),
              child: Text(copy.cancel),
            ),
          ],
        ),
      ),
    );
  }
}

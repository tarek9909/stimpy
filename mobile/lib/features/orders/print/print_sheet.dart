import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api_error.dart';
import '../../../theme/brand.dart';
import '../../../ui/error_banner.dart';
import '../../../ui/zip_line.dart';
import '../data/order_models.dart';
import '../data/orders_api.dart';
import 'order_printer.dart';

/// Opens the print sheet for orders that are already loaded (one order from its screen).
Future<void> showPrintSheet(BuildContext context, {required List<OrderDetail> orders, String? title}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => PrintSheet(orders: orders, title: title),
  );
}

/// Opens the print sheet for a batch by id (the orders of a list tab); they are loaded when you press Print.
Future<void> showBatchPrintSheet(BuildContext context, {required Future<List<OrderDetail>> Function() load, required String title, required int count}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => PrintSheet(load: load, title: title, count: count),
  );
}

class PrintSheet extends ConsumerStatefulWidget {
  const PrintSheet({super.key, this.orders, this.load, this.title, this.count});

  final List<OrderDetail>? orders;
  final Future<List<OrderDetail>> Function()? load;
  final String? title;
  final int? count;

  @override
  ConsumerState<PrintSheet> createState() => _PrintSheetState();
}

class _PrintSheetState extends ConsumerState<PrintSheet> {
  late PrintView _view = (widget.orders?.length ?? widget.count ?? 1) > 1 ? PrintView.sheet : PrintView.invoices;
  PrintGroup _group = PrintGroup.none;
  bool _busy = false;
  String? _status;
  String? _error;

  int get _count => widget.orders?.length ?? widget.count ?? 1;
  bool get _groupable => _count > 1 && _view != PrintView.invoices;

  Future<void> _run({required bool share}) async {
    setState(() {
      _busy = true;
      _error = null;
      _status = 'Loading orders…';
    });
    try {
      final orders = widget.orders ?? await widget.load!();
      if (!mounted) return;
      if (orders.isEmpty) {
        setState(() {
          _busy = false;
          _error = 'There are no orders to print.';
        });
        return;
      }
      setState(() => _status = 'Preparing ${orders.length == 1 ? 'the page' : 'the pages'}…');
      final business = _view == PrintView.invoices ? await ref.read(businessInfoProvider.future) : const BusinessInfo(name: 'Stimpy');
      if (!mounted) return;
      final printer = OrderPrinter();
      final bytes = await printer.build(context, view: _view, orders: orders, business: business, group: _groupable ? _group : PrintGroup.none);
      if (!mounted) return;
      final stamp = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final base = orders.length == 1 && _view != PrintView.sheet ? '${_view.label}-${orders.first.number}' : '${_view.label.replaceAll(' ', '-')}-$stamp';
      setState(() => _status = null);
      if (share) {
        await OrderPrinter.sharePdf(bytes, '$base.pdf');
      } else {
        await OrderPrinter.printPdf(bytes, base);
      }
      if (mounted) setState(() => _busy = false);
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _status = null;
          _error = e.message;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _status = null;
          _error = 'Could not prepare the document. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: Brand.surface, borderRadius: Radii.mdAll),
                  child: const Icon(LucideIcons.printer, size: 20, color: Brand.ink70),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Print', style: text.titleLarge),
                      if (widget.title != null) Text(widget.title!, style: text.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            RadioGroup<PrintView>(
              groupValue: _view,
              onChanged: (v) {
                if (!_busy && v != null) setState(() => _view = v);
              },
              child: Column(
                children: [
                  for (final v in PrintView.values)
                    RadioListTile<PrintView>(
                      contentPadding: EdgeInsets.zero,
                      value: v,
                      title: Text(v.label, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                      subtitle: Text(v.description, style: text.labelSmall),
                    ),
                ],
              ),
            ),
            if (_groupable) ...[
              const SizedBox(height: 8),
              Text('Group by', style: text.labelLarge),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final g in PrintGroup.values)
                  ChoiceChip(
                    label: Text(g.label),
                    selected: _group == g,
                    onSelected: _busy ? null : (_) => setState(() => _group = g),
                    showCheckmark: false,
                    selectedColor: Brand.ink,
                    backgroundColor: Brand.white,
                    side: BorderSide(color: _group == g ? Brand.ink : Brand.controlBorder),
                    labelStyle: text.labelMedium?.copyWith(color: _group == g ? Brand.white : Brand.ink),
                    shape: RoundedRectangleBorder(borderRadius: Radii.mdAll),
                  ),
              ]),
            ],
            const SizedBox(height: 18),
            if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: 14)],
            if (_busy && _status != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(children: [const ZipLoader(), const SizedBox(height: 10), Text(_status!, style: text.bodySmall)]),
              )
            else ...[
              FilledButton.icon(
                onPressed: _busy ? null : () => _run(share: false),
                icon: const Icon(LucideIcons.printer, size: 18),
                label: const Text('Print'),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _busy ? null : () => _run(share: true),
                icon: const Icon(LucideIcons.share2, size: 18),
                label: const Text('Share as PDF'),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

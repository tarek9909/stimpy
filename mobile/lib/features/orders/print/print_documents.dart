import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../../core/money.dart';
import '../../../theme/brand.dart';
import '../../../theme/typography.dart';
import '../../../ui/brand_logo.dart';
import '../data/order_models.dart';
import '../data/orders_api.dart';

/// The three printable documents, matching the web's print views (website/frontend/admin/src/pages/orders/
/// PrintViews.tsx): an invoice per order, a shipping label per order, and the delivery sheet.
///
/// They are plain widgets, drawn at A4 width ([kPageWidth] logical px) in black on white so they print well on any
/// printer, then turned into PDF pages by `OrderPrinter`. Drawing them with Flutter (instead of PDF text) keeps the
/// brand typeface and lets Arabic names and addresses print correctly.
const double kPageWidth = 595;
const double kPageHeight = 842;

TextStyle _t(double size, {FontWeight weight = FontWeight.w400, Color color = Brand.ink, double height = 1.35, bool tabular = false}) =>
    TextStyle(
      fontFamily: kFontFamily,
      fontFamilyFallback: const ['NotoSansArabic'],
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: height,
      letterSpacing: 0,
      decoration: TextDecoration.none,
      fontFeatures: tabular ? const [FontFeature.tabularFigures()] : null,
    );

final DateFormat _dateFmt = DateFormat('d MMM y');
final DateFormat _dateTimeFmt = DateFormat('d MMM y, HH:mm');

String _date(DateTime? d) => d == null ? '' : _dateFmt.format(d);

/// A page of the document: white, fixed width, natural height (at most a page; taller content is scaled to fit).
class DocumentPage extends StatelessWidget {
  const DocumentPage({super.key, required this.child, this.padding = const EdgeInsets.all(36)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.ltr,
      child: DefaultTextStyle(
        style: _t(11),
        child: ColoredBox(
          color: Brand.white,
          child: SizedBox(width: kPageWidth, child: Padding(padding: padding, child: child)),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ invoice

class InvoiceDocument extends StatelessWidget {
  const InvoiceDocument({super.key, required this.order, required this.business});

  final OrderDetail order;
  final BusinessInfo business;

  @override
  Widget build(BuildContext context) {
    final contact = [
      if ((business.supportEmail ?? '').isNotEmpty) business.supportEmail!,
      if ((business.whatsappNumber ?? '').isNotEmpty) business.whatsappNumber!,
    ];
    return DocumentPage(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const BrandLogo.full(surface: LogoSurface.white, width: 132),
                    const SizedBox(height: 8),
                    Text(business.name, style: _t(11, weight: FontWeight.w600)),
                    for (final c in contact) Text(c, style: _t(10, color: Brand.ink70, tabular: true)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('INVOICE', style: _t(9, weight: FontWeight.w500, color: Brand.ink70).copyWith(letterSpacing: 1.2)),
                  Text(order.number, style: _t(22, weight: FontWeight.w700, tabular: true, height: 1.2)),
                  Text(_date(order.placedAt), style: _t(10, color: Brand.ink70)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(height: 2, color: Brand.ink),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Block(label: 'BILLED TO', lines: [
                  (order.customer.name, true),
                  (order.contact.phone, false),
                  if ((order.contact.email ?? '').isNotEmpty) (order.contact.email!, false),
                ]),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: _Block(label: 'DELIVER TO', lines: [
                  (order.delivery.address, false),
                  (order.delivery.areaName, false),
                  if ((order.deliveryNumber ?? '').isNotEmpty) ('Delivery no. ${order.deliveryNumber}', false),
                ]),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Container(height: 2, color: Brand.ink),
          const _ItemsHeader(),
          for (final item in order.items) _ItemRow(item: item),
          const SizedBox(height: 10),
          _TotalRow('Subtotal', formatCents(order.subtotalCents)),
          _TotalRow('Delivery', formatCents(order.deliveryFeeCents)),
          const SizedBox(height: 6),
          Container(height: 2, color: Brand.ink),
          const SizedBox(height: 6),
          _TotalRow('Total to pay', formatCents(order.totalCents), strong: true),
          const SizedBox(height: 18),
          Text(
            'Payment: cash on delivery.${(order.delivery.notes ?? '').isNotEmpty ? ' Note: ${order.delivery.notes}' : ''}',
            style: _t(10.5),
          ),
          const SizedBox(height: 22),
          Center(child: Text('Thank you for choosing ${business.name}.', style: _t(9.5, color: Brand.ink70))),
        ],
      ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({required this.label, required this.lines});

  final String label;
  final List<(String, bool)> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: _t(8.5, weight: FontWeight.w500, color: Brand.ink70).copyWith(letterSpacing: 1.1)),
        const SizedBox(height: 3),
        for (final l in lines) Text(l.$1, style: _t(10.5, weight: l.$2 ? FontWeight.w700 : FontWeight.w400, tabular: true)),
      ],
    );
  }
}

class _ItemsHeader extends StatelessWidget {
  const _ItemsHeader();

  @override
  Widget build(BuildContext context) {
    final style = _t(9.5, weight: FontWeight.w600);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text('Item', style: style)),
          SizedBox(width: 36, child: Text('Qty', textAlign: TextAlign.right, style: style)),
          SizedBox(width: 78, child: Text('Unit price', textAlign: TextAlign.right, style: style)),
          SizedBox(width: 78, child: Text('Total', textAlign: TextAlign.right, style: style)),
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});
  final OrderItem item;

  @override
  Widget build(BuildContext context) {
    final design = item.designText;
    return Container(
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: Brand.line))),
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: _t(10.5, weight: FontWeight.w600)),
                if (design.isNotEmpty) Text(design, style: _t(9.5, color: Brand.ink70)),
              ],
            ),
          ),
          SizedBox(width: 36, child: Text('${item.qty}', textAlign: TextAlign.right, style: _t(10.5, tabular: true))),
          SizedBox(width: 78, child: Text(formatCents(item.unitPriceCents), textAlign: TextAlign.right, style: _t(10.5, tabular: true))),
          SizedBox(width: 78, child: Text(formatCents(item.lineTotalCents), textAlign: TextAlign.right, style: _t(10.5, tabular: true))),
        ],
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow(this.label, this.value, {this.strong = false});

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final style = _t(strong ? 13 : 10.5, weight: strong ? FontWeight.w700 : FontWeight.w400, tabular: true);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          const Spacer(),
          Text(label, style: style),
          SizedBox(width: 90, child: Text(value, textAlign: TextAlign.right, style: style)),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ labels

/// One shipping label: order number large, delivery number, name, phone, address, cash to collect.
class LabelCard extends StatelessWidget {
  const LabelCard({super.key, required this.order});
  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final notes = order.delivery.notes ?? '';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(border: Border.all(color: Brand.ink, width: 2), borderRadius: BorderRadius.circular(8)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('ORDER NUMBER', style: _t(8, weight: FontWeight.w500, color: Brand.ink70).copyWith(letterSpacing: 1.1)),
          Text(order.number, style: _t(22, weight: FontWeight.w700, tabular: true, height: 1.15)),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('DELIVERY NO.', style: _t(8, weight: FontWeight.w500, color: Brand.ink70).copyWith(letterSpacing: 1.1)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  (order.deliveryNumber ?? '').isNotEmpty ? order.deliveryNumber! : 'Assigned when sent out',
                  textAlign: TextAlign.right,
                  style: (order.deliveryNumber ?? '').isNotEmpty ? _t(15, weight: FontWeight.w700, tabular: true) : _t(9.5, color: Brand.ink70),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(height: 1.5, color: Brand.ink),
          const SizedBox(height: 8),
          Text(order.customer.name, style: _t(14, weight: FontWeight.w700, height: 1.25)),
          Text(order.contact.phone, style: _t(11.5, tabular: true)),
          const SizedBox(height: 6),
          Text(order.delivery.address, style: _t(11.5)),
          Text(order.delivery.areaName, style: _t(11.5, weight: FontWeight.w600)),
          if (notes.isNotEmpty) ...[const SizedBox(height: 6), Text('Note: $notes', style: _t(10))],
          const SizedBox(height: 8),
          Container(height: 1.5, color: Brand.ink),
          const SizedBox(height: 8),
          Text('CASH TO COLLECT', style: _t(8, weight: FontWeight.w500, color: Brand.ink70).copyWith(letterSpacing: 1.1)),
          Text(formatCents(order.totalCents), style: _t(22, weight: FontWeight.w700, tabular: true, height: 1.15)),
        ],
      ),
    );
  }
}

/// A page of labels, two across, as many rows as given (the printer fits [LabelsPage.perPage] to a page).
class LabelsPage extends StatelessWidget {
  const LabelsPage({super.key, required this.orders, this.heading});

  static const int perPage = 8;

  final List<OrderDetail> orders;
  final String? heading;

  @override
  Widget build(BuildContext context) {
    const gap = 12.0;
    final rows = <Widget>[];
    for (var i = 0; i < orders.length; i += 2) {
      rows.add(Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: LabelCard(order: orders[i])),
          const SizedBox(width: gap),
          Expanded(child: i + 1 < orders.length ? LabelCard(order: orders[i + 1]) : const SizedBox.shrink()),
        ],
      ));
      if (i + 2 < orders.length) rows.add(const SizedBox(height: gap));
    }
    return DocumentPage(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (heading != null) ...[Text(heading!, style: _t(13, weight: FontWeight.w700)), const SizedBox(height: 10)],
          ...rows,
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ delivery sheet

class DeliverySheetPage extends StatelessWidget {
  const DeliverySheetPage({super.key, required this.orders, required this.title, required this.printedAt, this.showTotal = true, this.pageLabel});

  static const int perPage = 12;

  final List<OrderDetail> orders;
  final String title;
  final DateTime printedAt;
  final bool showTotal;
  final String? pageLabel;

  @override
  Widget build(BuildContext context) {
    final head = _t(9, weight: FontWeight.w600);
    final cell = _t(9.5, tabular: true);
    return DocumentPage(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: Text(title, style: _t(16, weight: FontWeight.w700, height: 1.2))),
              Text('Printed ${_dateTimeFmt.format(printedAt)}${pageLabel == null ? '' : ' · $pageLabel'}', style: _t(9, color: Brand.ink70)),
            ],
          ),
          const SizedBox(height: 10),
          Container(height: 2, color: Brand.ink),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                SizedBox(width: 62, child: Text('Delivery no.', style: head)),
                SizedBox(width: 62, child: Text('Order no.', style: head)),
                SizedBox(width: 100, child: Text('Customer', style: head)),
                SizedBox(width: 78, child: Text('Phone', style: head)),
                Expanded(child: Text('Address', style: head)),
                SizedBox(width: 62, child: Text('Cash due', textAlign: TextAlign.right, style: head)),
              ],
            ),
          ),
          for (final o in orders)
            Container(
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: Brand.line))),
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 62, child: Text(o.deliveryNumber ?? '—', style: cell)),
                  SizedBox(width: 62, child: Text(o.number, style: cell)),
                  SizedBox(width: 100, child: Text(o.customer.name, style: _t(9.5))),
                  SizedBox(width: 78, child: Text(o.contact.phone, style: cell)),
                  Expanded(child: Text('${o.delivery.address}, ${o.delivery.areaName}', style: _t(9.5))),
                  SizedBox(width: 62, child: Text(formatCents(o.totalCents), textAlign: TextAlign.right, style: cell)),
                ],
              ),
            ),
          if (showTotal) ...[
            Container(height: 2, color: Brand.ink),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  Expanded(child: Text('Total cash to collect (${orders.length} ${orders.length == 1 ? 'order' : 'orders'})', style: _t(10.5, weight: FontWeight.w700))),
                  Text(formatCents(orders.fold(0, (sum, o) => sum + o.totalCents)), style: _t(10.5, weight: FontWeight.w700, tabular: true)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

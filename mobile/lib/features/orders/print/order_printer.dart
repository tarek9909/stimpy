import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:screenshot/screenshot.dart';

import '../data/order_models.dart';
import '../data/orders_api.dart';
import 'print_documents.dart';

/// What to print (the web's `view`): invoices, labels, or the delivery sheet.
enum PrintView {
  sheet('Delivery sheet', 'One table of orders with the cash to collect'),
  labels('Labels', 'A shipping label per order, two across'),
  invoices('Invoices', 'One invoice page per order');

  const PrintView(this.label, this.description);
  final String label;
  final String description;
}

/// How a batch is split into pages (the web's `group`).
enum PrintGroup {
  none('No grouping'),
  area('Area'),
  status('Status'),
  source('Source'),
  date('Order date'),
  delivery('Delivery number');

  const PrintGroup(this.label);
  final String label;
}

class OrderGroup {
  const OrderGroup(this.key, this.title, this.orders);
  final String key;
  final String? title;
  final List<OrderDetail> orders;
}

/// Splits orders into groups like the web's `groupOrders`. Groups are sorted by name, dates oldest first.
List<OrderGroup> groupOrders(List<OrderDetail> orders, PrintGroup group) {
  if (group == PrintGroup.none) return [OrderGroup('all', null, orders)];
  final dateFmt = DateFormat('d MMM y');
  String keyOf(OrderDetail o) => switch (group) {
        PrintGroup.area => o.delivery.areaName.isEmpty ? 'No area' : o.delivery.areaName,
        PrintGroup.status => o.status.label,
        PrintGroup.source => sourceLabels[o.source] ?? o.source,
        PrintGroup.date => o.placedAt == null ? 'No date' : dateFmt.format(o.placedAt!),
        PrintGroup.delivery => o.deliveryNumber ?? 'No delivery number',
        PrintGroup.none => 'all',
      };
  final map = <String, List<OrderDetail>>{};
  for (final o in orders) {
    map.putIfAbsent(keyOf(o), () => []).add(o);
  }
  final entries = map.entries.toList();
  if (group == PrintGroup.date) {
    entries.sort((a, b) => (a.value.first.placedAt ?? DateTime(0)).compareTo(b.value.first.placedAt ?? DateTime(0)));
  } else {
    entries.sort((a, b) => a.key.compareTo(b.key));
  }
  return [for (final e in entries) OrderGroup(e.key, '${group.label}: ${e.key}', e.value)];
}

/// Builds printable PDFs from orders and hands them to Android's print dialog (printers, "Save as PDF") or share sheet.
class OrderPrinter {
  OrderPrinter({ScreenshotController? screenshots}) : _shots = screenshots ?? ScreenshotController();

  final ScreenshotController _shots;

  /// Draws one document page to a PNG at 3x (about 215 dpi on A4), the width of an A4 page.
  Future<Uint8List> renderPage(BuildContext context, Widget page) {
    return _shots.captureFromLongWidget(
      page,
      context: context,
      pixelRatio: 3,
      delay: const Duration(milliseconds: 250),
      constraints: const BoxConstraints(maxWidth: kPageWidth),
    );
  }

  /// One PDF page per PNG, each scaled to fit an A4 page (taller content shrinks instead of being cut).
  Future<Uint8List> pdfFromPages(List<Uint8List> pages) async {
    final doc = pw.Document(title: 'Stimpy orders', creator: 'Stimpy Admin');
    for (final png in pages) {
      final image = pw.MemoryImage(png);
      final aspect = (image.height ?? 1) / (image.width ?? 1);
      var width = PdfPageFormat.a4.width;
      var height = width * aspect;
      if (height > PdfPageFormat.a4.height) {
        height = PdfPageFormat.a4.height;
        width = height / aspect;
      }
      doc.addPage(pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: pw.EdgeInsets.zero,
        build: (_) => pw.Align(alignment: pw.Alignment.topCenter, child: pw.Image(image, width: width, height: height)),
      ));
    }
    return doc.save();
  }

  Future<Uint8List> invoices(BuildContext context, List<OrderDetail> orders, BusinessInfo business) async {
    final pages = <Uint8List>[];
    for (final o in orders) {
      pages.add(await renderPage(context, InvoiceDocument(order: o, business: business)));
    }
    return pdfFromPages(pages);
  }

  Future<Uint8List> labels(BuildContext context, List<OrderDetail> orders, {PrintGroup group = PrintGroup.none}) async {
    final pages = <Uint8List>[];
    for (final g in groupOrders(orders, group)) {
      final chunks = _chunks(g.orders, LabelsPage.perPage);
      for (var i = 0; i < chunks.length; i++) {
        final heading = g.title == null ? null : '${g.title} (${g.orders.length})';
        pages.add(await renderPage(context, LabelsPage(orders: chunks[i], heading: i == 0 ? heading : null)));
      }
    }
    return pdfFromPages(pages);
  }

  Future<Uint8List> deliverySheet(BuildContext context, List<OrderDetail> orders, {PrintGroup group = PrintGroup.none, DateTime? printedAt}) async {
    final when = printedAt ?? DateTime.now();
    final pages = <Uint8List>[];
    for (final g in groupOrders(_bySheetOrder(orders), group)) {
      final chunks = _chunks(g.orders, DeliverySheetPage.perPage);
      for (var i = 0; i < chunks.length; i++) {
        pages.add(await renderPage(
          context,
          DeliverySheetPage(
            orders: chunks[i],
            title: g.title ?? 'Delivery sheet',
            printedAt: when,
            pageLabel: chunks.length > 1 ? 'Page ${i + 1} of ${chunks.length}' : null,
            // The cash total belongs on the last page of each group, over the whole group.
            showTotal: i == chunks.length - 1,
          ),
        ));
      }
    }
    return pdfFromPages(pages);
  }

  Future<Uint8List> build(
    BuildContext context, {
    required PrintView view,
    required List<OrderDetail> orders,
    required BusinessInfo business,
    PrintGroup group = PrintGroup.none,
  }) {
    switch (view) {
      case PrintView.invoices:
        return invoices(context, orders, business);
      case PrintView.labels:
        return labels(context, orders, group: group);
      case PrintView.sheet:
        return deliverySheet(context, orders, group: group);
    }
  }

  /// Opens Android's print preview (choose a printer, or "Save as PDF").
  static Future<bool> printPdf(Uint8List bytes, String name) => Printing.layoutPdf(name: name, onLayout: (_) async => bytes);

  /// Opens the share sheet with the PDF attached (WhatsApp, email, Drive...).
  static Future<bool> sharePdf(Uint8List bytes, String filename) async {
    await Printing.sharePdf(bytes: bytes, filename: filename);
    return true;
  }

  static List<List<T>> _chunks<T>(List<T> list, int size) =>
      [for (var i = 0; i < list.length; i += size) list.sublist(i, i + size > list.length ? list.length : i + size)];

  /// The web sorts the delivery sheet by delivery number, then id.
  static List<OrderDetail> _bySheetOrder(List<OrderDetail> orders) {
    final sorted = [...orders];
    sorted.sort((a, b) => (a.deliveryNumber ?? '').compareTo(b.deliveryNumber ?? '') != 0
        ? (a.deliveryNumber ?? '').compareTo(b.deliveryNumber ?? '')
        : a.id.compareTo(b.id));
    return sorted;
  }
}

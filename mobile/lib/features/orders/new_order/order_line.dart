import 'order_catalog.dart';

/// One line of a manual order. The four kinds are exactly the API's cart item kinds
/// (website/backend/src/modules/orders/schemas.ts `cartItemSchema`):
///
///  - [HoodieLine]      `hoodie`       a hoodie in a colour and size
///  - [HoodieSetLine]   `pack`         a hoodie plus N different Stimpies at the set price
///  - [StimpieLine]     `stimpie`      one Stimpie
///  - [StimpiePackLine] `stimpie_pack` N Stimpies (any mix of designs) at the offer price
///
/// `qty` is 1..10 on every kind. The server sets the real prices and checks stock; the totals here are an estimate,
/// as on the web form.
sealed class OrderLine {
  const OrderLine({required this.qty});

  static const int maxQty = 10;
  static const int minQty = 1;

  final int qty;

  OrderLine withQty(int qty);

  /// The API's cart item.
  Map<String, dynamic> toJson();

  /// Price of one unit, in cents, from the catalog.
  int unitPriceCents(OrderCatalog catalog);

  int lineTotalCents(OrderCatalog catalog) => unitPriceCents(catalog) * qty;

  /// Short name for the line card.
  String title(OrderCatalog catalog);

  /// A line describing the choices (colour, size, designs).
  String detail(OrderCatalog catalog);

  /// The first thing wrong with this line, or null when it can be sent.
  String? problem(OrderCatalog catalog);

  bool isValid(OrderCatalog catalog) => problem(catalog) == null;
}

String? _qtyProblem(int qty) => (qty < OrderLine.minQty || qty > OrderLine.maxQty) ? 'Quantity must be 1 to 10.' : null;

String _hoodieChoiceText(OrderCatalog c, int hoodieId, int colorId, int sizeId) {
  final h = c.hoodie(hoodieId);
  final color = h?.colors.where((x) => x.id == colorId).firstOrNull?.name ?? '?';
  final size = h?.sizes.where((x) => x.id == sizeId).firstOrNull?.label ?? '?';
  return '$color, $size';
}

String? _hoodieProblem(OrderCatalog c, int hoodieId, int colorId, int sizeId) {
  final h = c.hoodie(hoodieId);
  if (h == null) return 'Choose a hoodie.';
  if (!h.colors.any((x) => x.id == colorId)) return 'Choose a colour.';
  if (!h.sizes.any((x) => x.id == sizeId)) return 'Choose a size.';
  if (!h.available(colorId, sizeId)) return 'That colour and size is sold out.';
  return null;
}

class HoodieLine extends OrderLine {
  const HoodieLine({required this.hoodieId, required this.colorId, required this.sizeId, super.qty = 1});

  final int hoodieId;
  final int colorId;
  final int sizeId;

  @override
  HoodieLine withQty(int qty) => HoodieLine(hoodieId: hoodieId, colorId: colorId, sizeId: sizeId, qty: qty);

  @override
  Map<String, dynamic> toJson() => {'kind': 'hoodie', 'hoodieId': hoodieId, 'colorId': colorId, 'sizeId': sizeId, 'qty': qty};

  @override
  int unitPriceCents(OrderCatalog catalog) => catalog.hoodie(hoodieId)?.priceCents ?? 0;

  @override
  String title(OrderCatalog catalog) => catalog.hoodie(hoodieId)?.name ?? 'Hoodie';

  @override
  String detail(OrderCatalog catalog) => _hoodieChoiceText(catalog, hoodieId, colorId, sizeId);

  @override
  String? problem(OrderCatalog catalog) => _hoodieProblem(catalog, hoodieId, colorId, sizeId) ?? _qtyProblem(qty);
}

class HoodieSetLine extends OrderLine {
  const HoodieSetLine({
    required this.packId,
    required this.hoodieId,
    required this.colorId,
    required this.sizeId,
    required this.stimpieIds,
    super.qty = 1,
  });

  final int packId;
  final int hoodieId;
  final int colorId;
  final int sizeId;
  final List<int> stimpieIds;

  @override
  HoodieSetLine withQty(int qty) =>
      HoodieSetLine(packId: packId, hoodieId: hoodieId, colorId: colorId, sizeId: sizeId, stimpieIds: stimpieIds, qty: qty);

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'pack',
        'packId': packId,
        'hoodieId': hoodieId,
        'colorId': colorId,
        'sizeId': sizeId,
        'stimpieIds': stimpieIds,
        'qty': qty,
      };

  @override
  int unitPriceCents(OrderCatalog catalog) => catalog.pack(packId)?.priceCents ?? 0;

  @override
  String title(OrderCatalog catalog) => catalog.pack(packId)?.name ?? 'Hoodie set';

  @override
  String detail(OrderCatalog catalog) {
    final names = [for (final id in stimpieIds) catalog.stimpie(id)?.name ?? 'Stimpie'];
    return '${_hoodieChoiceText(catalog, hoodieId, colorId, sizeId)} · ${names.join(', ')}';
  }

  @override
  String? problem(OrderCatalog catalog) {
    final pack = catalog.pack(packId);
    if (pack == null || pack.type != PackType.hoodieSet) return 'Choose a hoodie set.';
    final hoodie = _hoodieProblem(catalog, hoodieId, colorId, sizeId);
    if (hoodie != null) return hoodie;
    if (stimpieIds.length != pack.stimpieCount) return 'Choose exactly ${pack.stimpieCount} different Stimpies.';
    if (stimpieIds.toSet().length != stimpieIds.length) return 'Pick different Stimpies: a set has no repeats.';
    if (stimpieIds.any((id) => !pack.allows(id))) return 'Choose designs allowed by this set.';
    return _qtyProblem(qty);
  }
}

class StimpieLine extends OrderLine {
  const StimpieLine({required this.stimpieId, super.qty = 1});

  final int stimpieId;

  @override
  StimpieLine withQty(int qty) => StimpieLine(stimpieId: stimpieId, qty: qty);

  @override
  Map<String, dynamic> toJson() => {'kind': 'stimpie', 'stimpieId': stimpieId, 'qty': qty};

  @override
  int unitPriceCents(OrderCatalog catalog) => catalog.stimpie(stimpieId)?.priceCents ?? 0;

  @override
  String title(OrderCatalog catalog) => catalog.stimpie(stimpieId)?.name ?? 'Stimpie';

  @override
  String detail(OrderCatalog catalog) => 'Single Stimpie';

  @override
  String? problem(OrderCatalog catalog) => catalog.stimpie(stimpieId) == null ? 'Choose a Stimpie.' : _qtyProblem(qty);
}

class StimpiePackLine extends OrderLine {
  /// [stimpies] maps a design id to how many of that design are in one offer.
  const StimpiePackLine({required this.packId, required this.stimpies, super.qty = 1});

  final int packId;
  final Map<int, int> stimpies;

  int get chosenCount => stimpies.values.fold(0, (a, b) => a + b);

  @override
  StimpiePackLine withQty(int qty) => StimpiePackLine(packId: packId, stimpies: stimpies, qty: qty);

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'stimpie_pack',
        'packId': packId,
        'stimpies': [
          for (final e in stimpies.entries)
            if (e.value > 0) {'stimpieId': e.key, 'qty': e.value},
        ],
        'qty': qty,
      };

  @override
  int unitPriceCents(OrderCatalog catalog) => catalog.pack(packId)?.priceCents ?? 0;

  @override
  String title(OrderCatalog catalog) => catalog.pack(packId)?.name ?? 'Stimpie offer';

  @override
  String detail(OrderCatalog catalog) => [
        for (final e in stimpies.entries)
          if (e.value > 0) '${e.value > 1 ? '${e.value} × ' : ''}${catalog.stimpie(e.key)?.name ?? 'Stimpie'}',
      ].join(', ');

  @override
  String? problem(OrderCatalog catalog) {
    final pack = catalog.pack(packId);
    if (pack == null || pack.type != PackType.stimpieOnly) return 'Choose a Stimpie offer.';
    if (chosenCount != pack.stimpieCount) return 'Choose exactly ${pack.stimpieCount} Stimpies across the designs.';
    if (stimpies.keys.any((id) => !pack.allows(id))) return 'Choose designs allowed by this offer.';
    return _qtyProblem(qty);
  }
}

/// Estimate shown under the items (the server sets the final prices).
class OrderTotals {
  const OrderTotals({required this.subtotalCents, required this.deliveryCents});
  final int subtotalCents;
  final int deliveryCents;
  int get totalCents => subtotalCents + deliveryCents;

  factory OrderTotals.of(List<OrderLine> lines, OrderCatalog catalog, int? areaId) => OrderTotals(
        subtotalCents: lines.fold(0, (sum, l) => sum + l.lineTotalCents(catalog)),
        deliveryCents: lines.isEmpty ? 0 : catalog.fees.feeFor(areaId),
      );
}

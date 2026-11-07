import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/media.dart';
import '../../../core/providers.dart';

/// What the New order form can offer: exactly what a customer could buy on the website. The dashboard reads the same
/// public endpoints (see website/frontend/admin/src/pages/orders/catalog.ts), so staff cannot add something the
/// storefront would refuse.

class OrderColor {
  const OrderColor({required this.id, required this.name, required this.color});
  final int id;
  final String name;
  final Color color;

  factory OrderColor.fromJson(Map<String, dynamic> j) =>
      OrderColor(id: j['id'] as int, name: j['name'] as String, color: parseHex(j['hex'] as String?));
}

class OrderSize {
  const OrderSize({required this.id, required this.label});
  final int id;
  final String label;

  factory OrderSize.fromJson(Map<String, dynamic> j) => OrderSize(id: j['id'] as int, label: j['label'] as String);
}

/// Stock of one colour and size. `remaining` is null when the count is not tracked or plentiful.
class VariantStock {
  const VariantStock({required this.colorId, required this.sizeId, required this.inStock, this.remaining});
  final int colorId;
  final int sizeId;
  final bool inStock;
  final int? remaining;

  factory VariantStock.fromJson(Map<String, dynamic> j) => VariantStock(
        colorId: j['colorId'] as int,
        sizeId: j['sizeId'] as int,
        inStock: j['inStock'] as bool,
        remaining: j['remaining'] as int?,
      );
}

class OrderHoodie {
  const OrderHoodie({
    required this.id,
    required this.name,
    required this.priceCents,
    required this.imageUrl,
    required this.colors,
    required this.sizes,
    required this.variants,
  });

  final int id;
  final String name;
  final int priceCents;
  final String? imageUrl;
  final List<OrderColor> colors;
  final List<OrderSize> sizes;
  final List<VariantStock> variants;

  VariantStock? variant(int colorId, int sizeId) {
    for (final v in variants) {
      if (v.colorId == colorId && v.sizeId == sizeId) return v;
    }
    return null;
  }

  /// A size/colour pair can be sold only when the hoodie offers it and it is in stock.
  bool available(int colorId, int sizeId) => variant(colorId, sizeId)?.inStock ?? false;

  bool colorAvailable(int colorId) => sizes.any((s) => available(colorId, s.id));

  factory OrderHoodie.fromJson(Map<String, dynamic> summary, Map<String, dynamic> detail) {
    final images = (summary['images'] as List? ?? const []).cast<String>();
    return OrderHoodie(
      id: summary['id'] as int,
      name: summary['name'] as String,
      priceCents: summary['priceCents'] as int,
      imageUrl: resolveMediaUrl(images.isEmpty ? null : images.first),
      colors: [for (final c in (detail['colors'] as List)) OrderColor.fromJson(c as Map<String, dynamic>)],
      sizes: [for (final s in (detail['sizes'] as List)) OrderSize.fromJson(s as Map<String, dynamic>)],
      variants: [for (final v in (detail['variants'] as List)) VariantStock.fromJson(v as Map<String, dynamic>)],
    );
  }
}

class OrderStimpie {
  const OrderStimpie({
    required this.id,
    required this.name,
    required this.priceCents,
    required this.imageUrl,
    required this.status,
    required this.purchasable,
    this.remaining,
  });

  final int id;
  final String name;
  final int priceCents;
  final String? imageUrl;

  /// AVAILABLE, LOW, SOLD_OUT, UPCOMING or ENDED.
  final String status;
  final bool purchasable;
  final int? remaining;

  bool get soldOut => status == 'SOLD_OUT';
  bool get canOrder => purchasable && !soldOut;

  factory OrderStimpie.fromJson(Map<String, dynamic> j) {
    final images = (j['images'] as List? ?? const []).cast<String>();
    final art = (j['artworkUrl'] as String?) ?? (images.isEmpty ? null : images.first);
    return OrderStimpie(
      id: j['id'] as int,
      name: j['name'] as String,
      priceCents: j['priceCents'] as int,
      imageUrl: resolveMediaUrl(art),
      status: j['status'] as String,
      purchasable: j['purchasable'] as bool,
      remaining: j['remaining'] as int?,
    );
  }
}

enum PackType { hoodieSet, stimpieOnly }

class OrderPack {
  const OrderPack({
    required this.id,
    required this.type,
    required this.name,
    required this.stimpieCount,
    required this.eligibleStimpieIds,
    required this.priceCents,
    this.badge,
  });

  final int id;
  final PackType type;
  final String name;
  final int stimpieCount;

  /// Null means any Stimpie is allowed.
  final List<int>? eligibleStimpieIds;
  final int priceCents;
  final String? badge;

  bool allows(int stimpieId) => eligibleStimpieIds == null || eligibleStimpieIds!.contains(stimpieId);

  factory OrderPack.fromJson(Map<String, dynamic> j) => OrderPack(
        id: j['id'] as int,
        type: j['type'] == 'HOODIE_SET' ? PackType.hoodieSet : PackType.stimpieOnly,
        name: j['name'] as String,
        stimpieCount: j['stimpieCount'] as int,
        eligibleStimpieIds: (j['eligibleStimpieIds'] as List?)?.cast<int>(),
        priceCents: j['priceCents'] as int,
        badge: j['badge'] as String?,
      );
}

class AreaFee {
  const AreaFee({required this.id, required this.name, this.feeCents});
  final int id;
  final String name;

  /// Null means the default delivery fee applies.
  final int? feeCents;

  factory AreaFee.fromJson(Map<String, dynamic> j) => AreaFee(id: j['id'] as int, name: j['name'] as String, feeCents: j['feeCents'] as int?);
}

class DeliveryFees {
  const DeliveryFees({required this.defaultFeeCents, required this.areas, required this.estimateText});
  final int defaultFeeCents;
  final List<AreaFee> areas;
  final String estimateText;

  int feeFor(int? areaId) {
    if (areaId == null) return defaultFeeCents;
    for (final a in areas) {
      if (a.id == areaId) return a.feeCents ?? defaultFeeCents;
    }
    return defaultFeeCents;
  }

  factory DeliveryFees.fromJson(Map<String, dynamic> j) => DeliveryFees(
        defaultFeeCents: j['defaultFeeCents'] as int,
        areas: [for (final a in (j['areas'] as List)) AreaFee.fromJson(a as Map<String, dynamic>)],
        estimateText: (j['estimateText'] as String?) ?? '',
      );
}

class OrderCatalog {
  const OrderCatalog({required this.hoodies, required this.stimpies, required this.packs, required this.fees});

  final List<OrderHoodie> hoodies;
  final List<OrderStimpie> stimpies;
  final List<OrderPack> packs;
  final DeliveryFees fees;

  List<OrderPack> get hoodieSets => [for (final p in packs) if (p.type == PackType.hoodieSet) p];
  List<OrderPack> get stimpieOffers => [for (final p in packs) if (p.type == PackType.stimpieOnly) p];
  List<OrderStimpie> get orderableStimpies => [for (final s in stimpies) if (s.canOrder) s];

  OrderHoodie? hoodie(int id) => _first(hoodies, (h) => h.id == id);
  OrderStimpie? stimpie(int id) => _first(stimpies, (s) => s.id == id);
  OrderPack? pack(int id) => _first(packs, (p) => p.id == id);

  static T? _first<T>(List<T> list, bool Function(T) test) {
    for (final e in list) {
      if (test(e)) return e;
    }
    return null;
  }
}

/// `#RRGGBB` to a Color; a neutral grey for anything unexpected.
Color parseHex(String? hex) {
  if (hex == null) return const Color(0xFF8B97A6);
  var h = hex.replaceFirst('#', '');
  if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
  final value = int.tryParse(h, radix: 16);
  if (value == null || h.length != 6) return const Color(0xFF8B97A6);
  return Color(0xFF000000 | value);
}

/// Reads every page of a list endpoint (the API caps pages at 100).
Future<List<Map<String, dynamic>>> fetchAllPages(ApiClient api, String path) async {
  final all = <Map<String, dynamic>>[];
  var page = 1;
  while (true) {
    final res = await api.getJson(path, query: {'page': page, 'pageSize': 100});
    final items = (res['items'] as List).cast<Map<String, dynamic>>();
    all.addAll(items);
    final total = res['total'] as int? ?? all.length;
    if (all.length >= total || items.isEmpty) return all;
    page++;
  }
}

Future<OrderCatalog> loadOrderCatalog(ApiClient api) async {
  final results = await Future.wait([
    fetchAllPages(api, '/products/hoodies'),
    fetchAllPages(api, '/products/stimpies'),
    fetchAllPages(api, '/packs'),
    api.getJson('/delivery/fees'),
  ]);
  final hoodieSummaries = results[0] as List<Map<String, dynamic>>;
  final details = await Future.wait([for (final h in hoodieSummaries) api.getJson('/products/hoodies/${h['slug']}')]);
  return OrderCatalog(
    hoodies: [for (var i = 0; i < hoodieSummaries.length; i++) OrderHoodie.fromJson(hoodieSummaries[i], details[i])],
    stimpies: [for (final s in results[1] as List<Map<String, dynamic>>) OrderStimpie.fromJson(s)],
    packs: [for (final p in results[2] as List<Map<String, dynamic>>) OrderPack.fromJson(p)],
    fees: DeliveryFees.fromJson(results[3] as Map<String, dynamic>),
  );
}

/// Fresh on every visit to the form, so stock and prices are current.
final orderCatalogProvider = FutureProvider.autoDispose<OrderCatalog>((ref) => loadOrderCatalog(ref.watch(apiClientProvider)));

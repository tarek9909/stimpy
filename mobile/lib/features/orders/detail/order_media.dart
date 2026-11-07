import '../data/order_models.dart';
import '../new_order/order_catalog.dart';

/// One Stimpie in an order line, with its picture and how many.
class StimpieMedia {
  const StimpieMedia({required this.name, required this.imageUrl, required this.qty});
  final String name;
  final String? imageUrl;
  final int qty;
}

class ResolvedMedia {
  const ResolvedMedia({required this.hoodieImage, required this.stimpies});
  final String? hoodieImage;
  final List<StimpieMedia> stimpies;

  bool get complete => stimpies.every((s) => s.imageUrl != null);
}

/// Pictures for one order line. The order carries its own images; for older orders that lack them this falls back
/// to the live catalog by name, like the web (`resolveOrderMedia` in website/frontend/admin/src/pages/orders/media.tsx).
/// Pass `catalog: null` while it is still loading: the result then only uses what the order itself holds.
ResolvedMedia resolveItemMedia(OrderItem item, OrderCatalog? catalog) {
  final d = item.details;
  String norm(String s) => s.trim().toLowerCase();

  OrderStimpie? stimpieByName(String name) {
    if (catalog == null) return null;
    for (final s in catalog.stimpies) {
      if (norm(s.name) == norm(name)) return s;
    }
    return null;
  }

  String? hoodie = item.isStimpiePack ? null : d.hoodieImage;
  final wantsHoodie = !item.isStimpiePack && (d.hoodie != null || item.kind == 'HOODIE' || item.kind == 'PACK');
  if (hoodie == null && wantsHoodie && catalog != null && catalog.hoodies.isNotEmpty) {
    final byName = d.hoodie == null ? null : catalog.hoodies.where((h) => norm(h.name) == norm(d.hoodie!)).firstOrNull;
    hoodie = (byName ?? catalog.hoodies.first).imageUrl;
  }

  final stimpies = <StimpieMedia>[];
  if (d.stimpieQuantities.isNotEmpty) {
    for (final q in d.stimpieQuantities) {
      final own = d.stimpieImages.where((i) => i.name == q.name).firstOrNull?.imageUrl;
      stimpies.add(StimpieMedia(name: q.name, qty: q.qty, imageUrl: own ?? stimpieByName(q.name)?.imageUrl));
    }
  } else if (d.stimpieImages.isNotEmpty) {
    for (final i in d.stimpieImages) {
      stimpies.add(StimpieMedia(name: i.name, qty: 1, imageUrl: i.imageUrl ?? stimpieByName(i.name)?.imageUrl));
    }
  } else if (d.stimpies.isNotEmpty) {
    for (final name in d.stimpies) {
      stimpies.add(StimpieMedia(name: name, qty: 1, imageUrl: stimpieByName(name)?.imageUrl));
    }
  } else if (item.kind == 'STIMPIE') {
    stimpies.add(StimpieMedia(name: item.name, qty: 1, imageUrl: stimpieByName(item.name)?.imageUrl));
  }
  return ResolvedMedia(hoodieImage: hoodie, stimpies: stimpies);
}

import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../ui/pill.dart';

/// The seven order statuses of the API (`OrderStatus` in the Prisma schema), with how the dashboard shows them
/// (design-system 2.3 / dashboard-pages 1.2): a coloured pill with an icon AND a label, never colour alone.
enum OrderStatus {
  newOrder('NEW', 'New', PillTone.coral, LucideIcons.circleDot),
  confirmed('CONFIRMED', 'Confirmed', PillTone.blue, LucideIcons.check),
  packed('PACKED', 'Packed', PillTone.butter, LucideIcons.package),
  outForDelivery('OUT_FOR_DELIVERY', 'Out for delivery', PillTone.sky, LucideIcons.truck),
  delivered('DELIVERED', 'Delivered', PillTone.success, LucideIcons.checkCheck),
  cancelled('CANCELLED', 'Cancelled', PillTone.neutral, LucideIcons.circleX),
  returned('RETURNED', 'Returned', PillTone.danger, LucideIcons.undo2);

  const OrderStatus(this.apiValue, this.label, this.tone, this.icon);

  /// The value the API sends and accepts.
  final String apiValue;
  final String label;
  final PillTone tone;
  final IconData icon;

  /// Parses the API value; unknown values fall back to [newOrder] like the web (`STATUS_META[status] ?? NEW`).
  static OrderStatus fromApi(String? value) {
    for (final s in OrderStatus.values) {
      if (s.apiValue == value) return s;
    }
    return OrderStatus.newOrder;
  }
}

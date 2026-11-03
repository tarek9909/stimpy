import 'package:flutter/material.dart';

import '../core/order_status.dart';
import 'pill.dart';

/// Order status as the dashboard shows it: round pill, icon and label.
class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key, this.large = false});

  final OrderStatus status;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Status: ${status.label}',
      excludeSemantics: true,
      child: Pill(label: status.label, tone: status.tone, icon: status.icon, large: large, rounded: true),
    );
  }
}

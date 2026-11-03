import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../ui/coming_soon_screen.dart';

/// Replaced by the dashboard overview.
class OverviewPlaceholder extends StatelessWidget {
  const OverviewPlaceholder({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
        title: 'Overview',
        icon: LucideIcons.layoutDashboard,
        headline: 'Today at a glance',
        message: 'New orders, cash to collect and what needs your attention.',
      );
}

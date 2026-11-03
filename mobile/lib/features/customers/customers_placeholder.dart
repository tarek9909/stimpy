import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../ui/coming_soon_screen.dart';

/// Replaced by the customer list and profile.
class CustomersPlaceholder extends StatelessWidget {
  const CustomersPlaceholder({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
        title: 'Customers',
        icon: LucideIcons.users,
        headline: 'Your customers will live here',
        message: 'Profiles, order history, favourites and follow-ups.',
      );
}

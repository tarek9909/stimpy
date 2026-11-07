import 'package:flutter/material.dart';

import '../theme/brand.dart';
import 'brand_logo.dart';

/// Top bar for the tab roots, like the dashboard's phone top bar: the split-S icon, the page title, actions on
/// the right, a hairline below. Sub-pages use a plain AppBar with a back arrow.
class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({super.key, required this.title, this.actions = const []});

  final String title;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      automaticallyImplyLeading: false,
      titleSpacing: 16,
      title: Row(
        children: [
          const BrandLogo.icon(surface: LogoSurface.white, width: 22),
          const SizedBox(width: 12),
          Container(width: 1, height: 20, color: Brand.line),
          const SizedBox(width: 12),
          Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis)),
        ],
      ),
      actions: [...actions, const SizedBox(width: 8)],
    );
  }
}

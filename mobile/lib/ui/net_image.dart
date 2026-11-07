import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/brand.dart';

/// A product picture that never leaves a hole: a quiet panel with an icon while loading, when there is no file, or
/// when the file cannot be loaded (artwork is missing for some designs).
class NetImage extends StatelessWidget {
  const NetImage({super.key, required this.url, this.fit = BoxFit.cover, this.radius = Radii.md, this.icon = LucideIcons.image});

  final String? url;
  final BoxFit fit;
  final double radius;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final placeholder = ColoredBox(
      color: Brand.surface,
      child: Center(child: Icon(icon, size: 22, color: Brand.disabledFg)),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: url == null
          ? placeholder
          : CachedNetworkImage(
              imageUrl: url!,
              fit: fit,
              fadeInDuration: const Duration(milliseconds: 150),
              placeholder: (_, _) => placeholder,
              errorWidget: (_, _, _) => placeholder,
            ),
    );
  }
}

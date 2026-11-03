import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/brand.dart';

/// A product colour as a round swatch with a ring when selected. Sold-out colours are faded with a cross, so
/// availability never depends on colour alone. The name is the accessible label (colour names matter: "Stone").
class ProductSwatch extends StatelessWidget {
  const ProductSwatch({
    super.key,
    required this.name,
    required this.color,
    required this.selected,
    required this.onTap,
    this.enabled = true,
    this.size = 40,
  });

  final String name;
  final Color color;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    // A light swatch (cream, white) needs a visible edge.
    final edge = color.computeLuminance() > 0.8 ? Brand.controlBorder : Colors.transparent;
    final onColor = color.computeLuminance() > 0.5 ? Brand.ink : Brand.white;
    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      label: enabled ? name : '$name, sold out',
      excludeSemantics: true,
      child: InkResponse(
        onTap: enabled ? onTap : null,
        radius: size * 0.8,
        child: SizedBox(
          width: size + 12,
          height: size + 12,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              width: size + 8,
              height: size + 8,
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: selected ? Brand.ink : Colors.transparent, width: 2),
              ),
              child: Opacity(
                opacity: enabled ? 1 : 0.35,
                child: DecoratedBox(
                  decoration: BoxDecoration(shape: BoxShape.circle, color: color, border: Border.all(color: edge)),
                  child: Center(
                    child: selected && enabled
                        ? Icon(LucideIcons.check, size: 18, color: onColor)
                        : (!enabled ? Icon(LucideIcons.x, size: 18, color: onColor) : null),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/brand.dart';
import '../theme/typography.dart';

/// − 2 + : the dashboard's quantity stepper. Buttons are 44px; the number is tabular and announced.
class QtyStepper extends StatelessWidget {
  const QtyStepper({super.key, required this.value, required this.onChanged, this.min = 1, this.max = 10, this.compact = false});

  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;

  /// 36px buttons for dense lists (quantity per design).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 36.0 : 44.0;
    Widget button(IconData icon, String label, bool enabled, VoidCallback onTap) => SizedBox(
          width: size,
          height: size,
          child: IconButton(
            tooltip: label,
            onPressed: enabled ? onTap : null,
            padding: EdgeInsets.zero,
            style: IconButton.styleFrom(minimumSize: Size(size, size), foregroundColor: Brand.ink),
            icon: Icon(icon, size: 18, color: enabled ? Brand.ink : Brand.disabledFg),
          ),
        );

    return DecoratedBox(
      decoration: BoxDecoration(border: Border.all(color: Brand.controlBorder), borderRadius: Radii.mdAll, color: Brand.white),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button(LucideIcons.minus, 'Decrease', value > min, () => onChanged(value - 1)),
          Semantics(
            liveRegion: true,
            label: 'Quantity $value',
            child: SizedBox(
              width: compact ? 28 : 36,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: const TextStyle(fontFamily: kFontFamily, fontSize: 15, fontWeight: FontWeight.w600, color: Brand.ink).tabular,
              ),
            ),
          ),
          button(LucideIcons.plus, 'Increase', value < max, () => onChanged(value + 1)),
        ],
      ),
    );
  }
}

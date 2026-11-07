import 'package:flutter/material.dart';

import '../theme/brand.dart';
import '../theme/typography.dart';

/// A pill you tap to choose (sizes, sources). Selected is the dashboard's filled ink with white text; disabled is
/// struck through so "sold out" never relies on colour alone. 44px tall for fingers.
class SelectChip extends StatelessWidget {
  const SelectChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.enabled = true,
    this.hint,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool enabled;

  /// Small second line, e.g. "4 left".
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final fg = !enabled ? Brand.disabledFg : (selected ? Brand.white : Brand.ink);
    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      label: hint == null ? label : '$label, $hint',
      excludeSemantics: true,
      child: Material(
        color: !enabled ? Brand.disabledBg : (selected ? Brand.ink : Brand.white),
        shape: RoundedRectangleBorder(
          borderRadius: Radii.mdAll,
          side: BorderSide(color: selected ? Brand.ink : Brand.controlBorder),
        ),
        child: InkWell(
          borderRadius: Radii.mdAll,
          onTap: enabled ? onTap : null,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 52, minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontFamily: kFontFamily,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      height: 1.2,
                      color: fg,
                      decoration: enabled ? null : TextDecoration.lineThrough,
                    ),
                  ),
                  if (hint != null)
                    Text(
                      hint!,
                      style: TextStyle(fontFamily: kFontFamily, fontSize: 10, height: 1.2, color: selected ? Brand.white.withValues(alpha: 0.8) : Brand.muted),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

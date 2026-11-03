import 'package:flutter/material.dart';

import '../theme/brand.dart';
import '../theme/typography.dart';

/// Tones of the one small filled label (design-system Pill). Each tone carries its own text colour, so callers
/// pick a tone, never a text colour: this keeps the brand contrast pairs (black on coral/butter/sky/lilac/cream,
/// white on blue/black/green/red/grey).
enum PillTone { coral, black, outline, cream, butter, sky, lilac, neutral, blue, success, danger }

class _ToneStyle {
  const _ToneStyle(this.bg, this.fg, [this.border]);
  final Color bg;
  final Color fg;
  final Color? border;
}

const Map<PillTone, _ToneStyle> _tones = {
  PillTone.coral: _ToneStyle(Brand.coral, Brand.ink),
  PillTone.black: _ToneStyle(Brand.ink, Brand.white),
  PillTone.outline: _ToneStyle(Colors.transparent, Brand.ink, Brand.ink),
  PillTone.cream: _ToneStyle(Brand.cream, Brand.ink, Brand.line),
  PillTone.butter: _ToneStyle(Brand.butter, Brand.ink),
  PillTone.sky: _ToneStyle(Brand.sky, Brand.ink),
  PillTone.lilac: _ToneStyle(Brand.lilac, Brand.ink),
  PillTone.neutral: _ToneStyle(Brand.neutral, Brand.white),
  PillTone.blue: _ToneStyle(Brand.action, Brand.white),
  PillTone.success: _ToneStyle(Brand.success, Brand.white),
  PillTone.danger: _ToneStyle(Brand.danger, Brand.white),
};

class Pill extends StatelessWidget {
  const Pill({
    super.key,
    required this.label,
    this.tone = PillTone.black,
    this.icon,
    this.large = false,
    this.rounded = false,
  });

  final String label;
  final PillTone tone;
  final IconData? icon;

  /// 13px text with more padding instead of the 12px caption size.
  final bool large;

  /// Fully round (status pills) instead of the 4px tag corner.
  final bool rounded;

  @override
  Widget build(BuildContext context) {
    final style = _tones[tone]!;
    final fontSize = large ? 13.0 : 12.0;
    final iconSize = large ? 16.0 : 14.0;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: style.bg,
        borderRadius: BorderRadius.circular(rounded ? Radii.full : Radii.sm),
        border: style.border == null ? null : Border.all(color: style.border!),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: large ? 12 : 8, vertical: large ? 4 : 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: iconSize, color: style.fg),
              const SizedBox(width: 4),
            ],
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: kFontFamily,
                  fontSize: fontSize,
                  fontWeight: FontWeight.w500,
                  height: 1.4,
                  color: style.fg,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../theme/brand.dart';
import '../theme/typography.dart';

/// A dashboard KPI tile (the web's `.overview-metric`): small label with an icon, a large tabular value and an
/// optional note. The lead tile can carry the 2px blue top rule, as the first metric does on the dashboard.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.icon,
    this.note,
    this.highlight = false,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData? icon;
  final String? note;
  final bool highlight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final body = Padding(
      padding: EdgeInsets.fromLTRB(16, highlight ? 14 : 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.labelMedium?.copyWith(color: Brand.muted, fontWeight: FontWeight.w400)),
              ),
              if (icon != null) Icon(icon, size: 16, color: highlight ? Brand.action : Brand.ink55),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontFamily: kFontFamily, fontSize: 26, height: 1.15, fontWeight: FontWeight.w600, color: Brand.ink).tabular,
          ),
          if (note != null) ...[
            const SizedBox(height: 4),
            Text(note!, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.labelSmall),
          ],
        ],
      ),
    );

    return Material(
      color: Brand.white,
      shape: RoundedRectangleBorder(borderRadius: Radii.lgAll, side: const BorderSide(color: Brand.line)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (highlight) Container(height: 2, color: Brand.action),
            body,
          ],
        ),
      ),
    );
  }
}

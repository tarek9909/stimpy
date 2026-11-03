import 'package:flutter/material.dart';

/// Stimpy design tokens.
///
/// Sources of truth (keep in sync when the web changes):
///  - website/packages/ui/tailwind-preset.cjs and src/tokens.css  (brand palette, status colours, radii)
///  - website/frontend/admin/tailwind.config.cjs and src/styles/globals.css  (the dashboard's cooler neutrals,
///    6-8px radii, blue active state)
///
/// The app is the dashboard in your pocket, so neutrals and component shapes follow the dashboard; the identity
/// (coral, the split-S logo, status colours, zip line, Poppins) comes from the brand system.
abstract final class Brand {
  // ---- Identity palette ----
  static const Color coral = Color(0xFFFF7A59); // signature colour
  static const Color butter = Color(0xFFFFE45C);
  static const Color sky = Color(0xFF5CC8FF);
  static const Color lilac = Color(0xFFC9B6FF);
  static const Color cream = Color(0xFFFFF4E6);
  static const Color white = Color(0xFFFFFFFF);

  // ---- Dashboard neutrals ----
  static const Color ink = Color(0xFF202731); // text; also the "black" of pills and the zip line
  static const Color ink70 = Color(0xFF586474);
  static const Color ink55 = Color(0xFF6B7788);
  static const Color muted = Color(0xFF637083); // secondary copy in the dashboard
  static const Color line = Color(0xFFE6E9EE);
  static const Color lineStrong = Color(0xFF8B97A6);
  static const Color controlBorder = Color(0xFFCDD3DD);
  static const Color surface = Color(0xFFF5F7FA);
  static const Color panel = Color(0xFFF8F9FB); // sidebar, table header, search box
  static const Color disabledBg = Color(0xFFEEF0F3);
  static const Color disabledFg = Color(0xFF84909F);

  // ---- Action (blue is reserved for things you can press) ----
  static const Color action = Color(0xFF2563EB);
  static const Color actionDeep = Color(0xFF2358C8); // active nav label
  static const Color actionTint = Color(0xFFE9EFFC); // active nav background

  // ---- Status meaning only ----
  static const Color success = Color(0xFF16805D);
  static const Color danger = Color(0xFFC43838);
  static const Color neutral = Color(0xFF6B6B6B);
  static const Color attentionBg = Color(0xFFFFF3E5);
  static const Color attentionFg = Color(0xFFA3641A);
}

/// Corner radii (dashboard scale: inputs and buttons 6, cards 8, sheets 12).
abstract final class Radii {
  static const double sm = 4;
  static const double md = 6;
  static const double lg = 8;
  static const double sheet = 12;
  static const double full = 999;

  static BorderRadius get mdAll => BorderRadius.circular(md);
  static BorderRadius get lgAll => BorderRadius.circular(lg);
  static BorderRadius get smAll => BorderRadius.circular(sm);
}

/// 4px spacing scale.
abstract final class Space {
  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20;
  static const double s6 = 24;
  static const double s8 = 32;
  static const double s10 = 40;
}

/// Floating layers only (design system 6.2: no shadows on cards).
abstract final class Elevations {
  static const List<BoxShadow> float = [
    BoxShadow(color: Color(0x1F111111), blurRadius: 24, offset: Offset(0, 8)),
  ];
}

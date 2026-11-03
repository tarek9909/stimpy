import 'package:flutter/material.dart';

import 'brand.dart';

const String kFontFamily = 'Poppins';

/// The dashboard type scale in Poppins (website/frontend/admin/tailwind.config.cjs: h1 28, h2 24, h4 17, h5 15,
/// body 14, body-sm 13, caption 12, button 13). Headings are SemiBold (600) as in the dashboard; body is Regular,
/// labels and buttons Medium.
TextTheme buildTextTheme() {
  TextStyle s(double size, FontWeight weight, double height, {Color color = Brand.ink}) => TextStyle(
        fontFamily: kFontFamily,
        fontSize: size,
        fontWeight: weight,
        height: height,
        letterSpacing: 0,
        color: color,
      );

  return TextTheme(
    displaySmall: s(32, FontWeight.w600, 1.2),
    headlineLarge: s(28, FontWeight.w600, 1.25), // page title (h1)
    headlineMedium: s(24, FontWeight.w600, 1.3), // h2
    headlineSmall: s(22, FontWeight.w600, 1.3), // login heading
    titleLarge: s(18, FontWeight.w600, 1.3), // top bar title
    titleMedium: s(15, FontWeight.w600, 1.4), // panel heading (h5)
    titleSmall: s(13, FontWeight.w600, 1.4),
    bodyLarge: s(16, FontWeight.w400, 1.5), // lead, inputs on phones (never below 16)
    bodyMedium: s(14, FontWeight.w400, 1.5), // body
    bodySmall: s(13, FontWeight.w400, 1.5, color: Brand.muted), // body-sm
    labelLarge: s(13, FontWeight.w500, 1.25), // buttons
    labelMedium: s(12, FontWeight.w500, 1.4), // caption
    labelSmall: s(11, FontWeight.w500, 1.4, color: Brand.muted),
  );
}

/// Tabular numerals for money, counts and times so columns do not jitter.
extension NumericStyle on TextStyle {
  TextStyle get tabular => copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
}

import 'package:flutter/material.dart';

/// Which official logo file to use for the surface behind it (brand rule: never recolour the logo).
enum LogoSurface { white, black, coral }

/// The official Stimpy logo, from the same files as the website (assets/brand).
///
/// Rules (design-system section 11): pick the version for the surface behind it; never stretch, tint or add
/// effects; never place it on Butter/Sky/Lilac or on a photo. Minimum widths: full 96, icon 20.
class BrandLogo extends StatelessWidget {
  const BrandLogo.full({super.key, this.surface = LogoSurface.white, this.width = 140, this.semanticLabel = 'Stimpy'})
      : _icon = false;

  const BrandLogo.icon({super.key, this.surface = LogoSurface.white, this.width = 32, this.semanticLabel = 'Stimpy'})
      : _icon = true;

  final LogoSurface surface;
  final double width;
  final String semanticLabel;
  final bool _icon;

  static const double _fullRatio = 480 / 167;
  static const double _iconRatio = 180 / 256;
  static const double _fullMinWidth = 96;
  static const double _iconMinWidth = 20;

  String get _asset {
    if (_icon) {
      return switch (surface) {
        LogoSurface.white => 'assets/brand/icon-on-white.png',
        LogoSurface.black => 'assets/brand/icon-on-black.png',
        LogoSurface.coral => 'assets/brand/icon-main.png',
      };
    }
    return switch (surface) {
      LogoSurface.white => 'assets/brand/logo-on-white.webp',
      LogoSurface.black => 'assets/brand/logo-on-black.webp',
      LogoSurface.coral => 'assets/brand/logo-main.webp',
    };
  }

  /// Every logo file the app uses. Pre-loaded at startup so the first frame never shows a gap where a logo belongs.
  static const List<String> assets = [
    'assets/brand/logo-main.webp',
    'assets/brand/logo-on-white.webp',
    'assets/brand/logo-on-black.webp',
    'assets/brand/icon-main.png',
    'assets/brand/icon-on-white.png',
    'assets/brand/icon-on-black.png',
  ];

  static Future<void> precacheAll(BuildContext context) async {
    await Future.wait([for (final a in assets) precacheImage(AssetImage(a), context)]);
  }

  @override
  Widget build(BuildContext context) {
    final w = width < (_icon ? _iconMinWidth : _fullMinWidth) ? (_icon ? _iconMinWidth : _fullMinWidth) : width;
    final h = w / (_icon ? _iconRatio : _fullRatio);
    return Image.asset(
      _asset,
      width: w,
      height: h,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      gaplessPlayback: true,
      semanticLabel: semanticLabel,
      excludeFromSemantics: semanticLabel.isEmpty,
      // If the file is not decoded yet, fade in rather than pop in.
      frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
        if (wasSynchronouslyLoaded) return child;
        return AnimatedOpacity(opacity: frame == null ? 0 : 1, duration: const Duration(milliseconds: 160), child: child);
      },
    );
  }
}

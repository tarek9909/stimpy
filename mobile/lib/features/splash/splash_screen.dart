import 'package:flutter/material.dart';

import '../../theme/brand.dart';
import '../../ui/brand_logo.dart';
import '../../ui/zip_line.dart';

/// Shown while the saved session is checked. Coral with the main logo, the zip closing underneath
/// (it picks up from the native launch screen, which is coral with the split-S).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Brand.coral,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandLogo.full(surface: LogoSurface.coral, width: 200),
            SizedBox(height: 32),
            ZipLoader(width: 96),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../theme/brand.dart';

/// The brand's zip line: a solid 4px bar with 2px teeth every 6px (design-system 10.2 / tokens.css `.zip-line`).
/// Black on light surfaces, white on dark. Use it at section boundaries only, never as decoration everywhere.
class ZipLine extends StatelessWidget {
  const ZipLine({super.key, this.color = Brand.ink, this.flip = false});

  final Color color;

  /// Teeth above the bar instead of below.
  final bool flip;

  static const double thickness = 4;
  static const double tooth = 2;
  static const double pitch = 6;
  static const double height = thickness + tooth;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(painter: ZipPainter(color: color, flip: flip)),
      ),
    );
  }
}

/// Paints a zip line, optionally only the first `progress` (0..1) of its width.
class ZipPainter extends CustomPainter {
  const ZipPainter({required this.color, this.flip = false, this.progress = 1});

  final Color color;
  final bool flip;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final w = size.width * progress.clamp(0, 1);
    if (w <= 0) return;
    final barTop = flip ? ZipLine.tooth : 0.0;
    final toothTop = flip ? 0.0 : ZipLine.thickness;
    canvas.drawRect(Rect.fromLTWH(0, barTop, w, ZipLine.thickness), paint);
    for (double x = 0; x < w; x += ZipLine.pitch) {
      final tw = (x + ZipLine.tooth) > w ? w - x : ZipLine.tooth;
      canvas.drawRect(Rect.fromLTWH(x, toothTop, tw, ZipLine.tooth), paint);
    }
  }

  @override
  bool shouldRepaint(ZipPainter old) => old.color != color || old.flip != flip || old.progress != progress;
}

/// A loading indicator in the brand's language: the zip closes from left to right, then starts again.
/// Falls back to a static, full line when the system asks for reduced motion.
class ZipLoader extends StatefulWidget {
  const ZipLoader({super.key, this.width = 120, this.color = Brand.ink});

  final double width;
  final Color color;

  @override
  State<ZipLoader> createState() => _ZipLoaderState();
}

class _ZipLoaderState extends State<ZipLoader> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduce) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return Semantics(
      label: 'Loading',
      child: SizedBox(
        width: widget.width,
        height: ZipLine.height,
        child: reduce
            ? CustomPaint(painter: ZipPainter(color: widget.color))
            : AnimatedBuilder(
                animation: _controller,
                builder: (context, _) => CustomPaint(
                  painter: ZipPainter(color: widget.color, progress: Curves.easeInOutCubic.transform(_controller.value)),
                ),
              ),
      ),
    );
  }
}

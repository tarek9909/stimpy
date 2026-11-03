import 'package:flutter/material.dart';

import 'app_top_bar.dart';
import 'empty_state.dart';

/// A tab whose feature is not built yet: top bar plus a calm empty state, so the shell already looks finished.
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title, required this.icon, required this.headline, required this.message});

  final String title;
  final IconData icon;
  final String headline;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(title: title),
      body: EmptyState(icon: icon, title: headline, message: message),
    );
  }
}

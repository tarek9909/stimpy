import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/config.dart';
import '../../theme/brand.dart';
import '../../ui/app_top_bar.dart';
import '../../ui/brand_logo.dart';
import '../../ui/pill.dart';
import '../auth/auth_controller.dart';

/// Account, session and sign-out. Settings that need the full dashboard stay on the web.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    final expires = auth.sessionExpiresAt;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const AppTopBar(title: 'More'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (user != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    _Avatar(name: user.name),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user.name, style: text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 2),
                          Text(user.email, style: text.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Pill(label: _roleLabel(user.role), tone: PillTone.cream),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 20),
          const _SectionLabel('Session'),
          Card(
            child: Column(
              children: [
                _InfoRow(
                  icon: LucideIcons.clock,
                  label: 'Signed in until',
                  value: expires == null ? 'Unknown' : DateFormat('EEE d MMM, HH:mm').format(expires),
                ),
                const Divider(indent: 16, endIndent: 16),
                _InfoRow(icon: LucideIcons.server, label: 'Connected to', value: Uri.parse(apiBaseUrl).authority),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Card(
            clipBehavior: Clip.antiAlias,
            child: ListTile(
              leading: const Icon(LucideIcons.logOut, size: 20, color: Brand.danger),
              title: Text('Sign out', style: text.bodyMedium?.copyWith(color: Brand.danger, fontWeight: FontWeight.w500)),
              onTap: () => _confirmSignOut(context, ref),
            ),
          ),
          const SizedBox(height: 32),
          const Center(child: Opacity(opacity: 0.9, child: BrandLogo.full(surface: LogoSurface.white, width: 104))),
          const SizedBox(height: 8),
          Center(child: Text('Stimpy Admin', style: text.labelSmall)),
        ],
      ),
    );
  }

  static String _roleLabel(String role) => role.isEmpty ? '' : role[0] + role.substring(1).toLowerCase();

  static Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your email and password to get back in.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Brand.danger),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider.notifier).logout();
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name});
  final String name;

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: Brand.coral, shape: BoxShape.circle),
      child: Text(_initials, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Brand.ink)),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Brand.muted)),
      );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Brand.ink55),
          const SizedBox(width: 12),
          Text(label, style: text.bodyMedium),
          const SizedBox(width: 12),
          Expanded(child: Text(value, textAlign: TextAlign.end, style: text.bodySmall?.copyWith(color: Brand.ink), maxLines: 1, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}

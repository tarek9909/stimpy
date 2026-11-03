import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api_client.dart';
import '../../../core/api_error.dart';
import '../../../theme/brand.dart';
import '../../../ui/empty_state.dart';
import '../../../ui/error_banner.dart';

/// An existing customer, as returned by `GET /admin/customers`.
class CustomerHit {
  const CustomerHit({required this.id, required this.name, required this.email, required this.phone, required this.whatsapp, required this.ordersCount});

  final int id;
  final String name;
  final String? email;
  final String phone;
  final String whatsapp;
  final int ordersCount;

  /// The WhatsApp number counts as "same as phone" when it is empty or equal.
  bool get whatsappSameAsPhone => whatsapp.isEmpty || whatsapp == phone;

  factory CustomerHit.fromJson(Map<String, dynamic> j) => CustomerHit(
        id: j['id'] as int,
        name: j['name'] as String,
        email: j['email'] as String?,
        phone: j['phone'] as String,
        whatsapp: (j['whatsapp'] as String?) ?? '',
        ordersCount: (j['ordersCount'] as int?) ?? 0,
      );
}

Future<CustomerHit?> showCustomerSearch(BuildContext context, ApiClient api) {
  return showModalBottomSheet<CustomerHit>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: false,
    builder: (context) => FractionallySizedBox(heightFactor: 0.9, child: _CustomerSearchSheet(api: api)),
  );
}

class _CustomerSearchSheet extends StatefulWidget {
  const _CustomerSearchSheet({required this.api});
  final ApiClient api;

  @override
  State<_CustomerSearchSheet> createState() => _CustomerSearchSheetState();
}

class _CustomerSearchSheetState extends State<_CustomerSearchSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<CustomerHit> _hits = const [];
  bool _loading = false;
  String? _error;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final q = value.trim();
    if (q.length < 2) {
      setState(() {
        _query = q;
        _hits = const [];
        _error = null;
        _loading = false;
      });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q));
  }

  Future<void> _search(String q) async {
    try {
      final res = await widget.api.getJson('/admin/customers', query: {'q': q, 'pageSize': 20});
      if (!mounted || _controller.text.trim() != q) return; // a newer search is in flight
      setState(() {
        _query = q;
        _hits = [for (final i in (res['items'] as List)) CustomerHit.fromJson(i as Map<String, dynamic>)];
        _error = null;
        _loading = false;
      });
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 8, 6),
          child: Row(
            children: [
              Expanded(child: Text('Find a customer', style: text.titleLarge)),
              IconButton(tooltip: 'Close', icon: const Icon(LucideIcons.x, size: 22), onPressed: () => Navigator.of(context).pop()),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
          child: TextField(
            controller: _controller,
            autofocus: true,
            onChanged: _onChanged,
            textInputAction: TextInputAction.search,
            style: text.bodyLarge,
            decoration: const InputDecoration(
              hintText: 'Name, phone or email',
              prefixIcon: Icon(LucideIcons.search, size: 20, color: Brand.ink55),
            ),
          ),
        ),
        const Divider(),
        Expanded(child: _results(text)),
      ],
    );
  }

  Widget _results(TextTheme text) {
    if (_error != null) return Padding(padding: const EdgeInsets.all(20), child: ErrorBanner(message: _error!));
    if (_query.length < 2 && _controller.text.trim().length < 2) {
      return const EmptyState(icon: LucideIcons.userSearch, title: 'Search your customers', message: 'Type at least two letters of a name, phone number or email.');
    }
    if (_loading && _hits.isEmpty) return const Center(child: CircularProgressIndicator());
    if (_hits.isEmpty) {
      return EmptyState(icon: LucideIcons.userSearch, title: 'No customer found', message: 'Check the spelling, or fill in the details by hand.');
    }
    return ListView.separated(
      itemCount: _hits.length,
      separatorBuilder: (_, _) => const Divider(indent: 20),
      itemBuilder: (context, i) {
        final c = _hits[i];
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 20),
          title: Text(c.name, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
          subtitle: Text('${c.phone}${c.email == null ? '' : ' · ${c.email}'}', style: text.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
          trailing: Text(c.ordersCount == 1 ? '1 order' : '${c.ordersCount} orders', style: text.labelSmall),
          onTap: () => Navigator.of(context).pop(c),
        );
      },
    );
  }
}

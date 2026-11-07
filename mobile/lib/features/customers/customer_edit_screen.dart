import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_error.dart';
import '../../ui/app_text_field.dart';
import '../../ui/error_banner.dart';
import 'data/customer_models.dart';
import 'data/customers_api.dart';

/// Edit a customer like the web form: name, email, WhatsApp, team notes, and the marketing switches. The phone is
/// the customer's identity and cannot change. Only changed fields are sent; the server's per-field messages
/// (`ApiError.fields`) appear under the matching input. Pops with `true` once saved.
class CustomerEditScreen extends ConsumerStatefulWidget {
  const CustomerEditScreen({super.key, required this.profile});
  final CustomerProfile profile;

  @override
  ConsumerState<CustomerEditScreen> createState() => _CustomerEditScreenState();
}

class _CustomerEditScreenState extends ConsumerState<CustomerEditScreen> {
  static final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  late final _name = TextEditingController(text: widget.profile.name);
  late final _mail = TextEditingController(text: widget.profile.email ?? '');
  late final _whatsapp = TextEditingController(text: widget.profile.whatsapp);
  late final _notes = TextEditingController(text: widget.profile.notes ?? '');
  late bool _optOut = widget.profile.optedOut;
  late bool _emailConsent = widget.profile.emailConsent;
  late bool _whatsappConsent = widget.profile.whatsappConsent;

  Map<String, String> _errors = {};
  String? _banner;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _mail.dispose();
    _whatsapp.dispose();
    _notes.dispose();
    super.dispose();
  }

  /// The server's rules, checked first so obvious mistakes do not need a round trip.
  Map<String, String> _validate() {
    final e = <String, String>{};
    final name = _name.text.trim();
    if (name.length < 2) e['name'] = 'Enter at least 2 characters.';
    if (name.length > 80) e['name'] = 'That name is too long.';
    final mail = _mail.text.trim();
    if (mail.isNotEmpty && !_email.hasMatch(mail)) e['email'] = 'Enter a valid email address.';
    if (_whatsapp.text.trim().isEmpty) e['whatsapp'] = 'Enter a WhatsApp number.';
    if (_notes.text.length > 2000) e['notes'] = 'Notes are too long.';
    return e;
  }

  Map<String, Object?> _changes() {
    final p = widget.profile;
    final mail = _mail.text.trim();
    final notes = _notes.text.trim();
    return {
      if (_name.text.trim() != p.name) 'name': _name.text.trim(),
      if (mail != (p.email ?? '')) 'email': mail.isEmpty ? null : mail,
      if (_whatsapp.text.trim() != p.whatsapp) 'whatsapp': _whatsapp.text.trim(),
      if (notes != (p.notes ?? '').trim()) 'notes': notes.isEmpty ? null : _notes.text,
      if (_optOut != p.optedOut) 'marketingOptOut': _optOut,
      if (_emailConsent != p.emailConsent) 'emailConsent': _emailConsent,
      if (_whatsappConsent != p.whatsappConsent) 'whatsappConsent': _whatsappConsent,
    };
  }

  Future<void> _save() async {
    final invalid = _validate();
    if (invalid.isNotEmpty) {
      setState(() {
        _errors = invalid;
        _banner = 'Please check the highlighted fields.';
      });
      return;
    }
    final changes = _changes();
    if (changes.isEmpty) {
      Navigator.of(context).pop(false);
      return;
    }
    setState(() {
      _busy = true;
      _errors = {};
      _banner = null;
    });
    try {
      await ref.read(customersApiProvider).update(widget.profile.id, changes);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (!mounted) return;
      const known = {'name', 'email', 'whatsapp', 'notes'};
      final leftovers = e.fields.keys.any((k) => !known.contains(k));
      setState(() {
        _errors = e.fields;
        _banner = (e.fields.isEmpty || leftovers) ? e.message : 'Please check the highlighted fields.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _clear(String key) {
    if (_errors.containsKey(key)) setState(() => _errors = {..._errors}..remove(key));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Edit customer')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          if (_banner != null) ...[ErrorBanner(message: _banner!), const SizedBox(height: 14)],
          AppTextField(
            label: 'Name',
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            errorText: _errors['name'],
            onChanged: (_) => _clear('name'),
          ),
          const SizedBox(height: 14),
          AppTextField(
            label: 'Email',
            controller: _mail,
            optional: true,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            errorText: _errors['email'],
            onChanged: (_) => _clear('email'),
          ),
          const SizedBox(height: 14),
          AppTextField(
            label: 'WhatsApp',
            controller: _whatsapp,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            helper: 'Phone ${widget.profile.phone} is the customer\'s identity and cannot be changed.',
            errorText: _errors['whatsapp'],
            onChanged: (_) => _clear('whatsapp'),
          ),
          const SizedBox(height: 14),
          AppTextField(
            label: 'Notes',
            controller: _notes,
            optional: true,
            minLines: 3,
            maxLines: 6,
            textCapitalization: TextCapitalization.sentences,
            hint: 'Only your team sees this',
            errorText: _errors['notes'],
            onChanged: (_) => _clear('notes'),
          ),
          const SizedBox(height: 20),
          Text('Marketing', style: text.titleSmall),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Email marketing'), value: _emailConsent, onChanged: _busy ? null : (v) => setState(() => _emailConsent = v)),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('WhatsApp marketing'), value: _whatsappConsent, onChanged: _busy ? null : (v) => setState(() => _whatsappConsent = v)),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Opted out of all marketing'), value: _optOut, onChanged: _busy ? null : (v) => setState(() => _optOut = v)),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save changes'),
          ),
        ],
      ),
    );
  }
}

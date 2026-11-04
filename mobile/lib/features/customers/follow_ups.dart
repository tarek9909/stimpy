import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_error.dart';
import '../../theme/brand.dart';
import '../../ui/app_text_field.dart';
import '../../ui/empty_state.dart';
import '../../ui/error_banner.dart';
import '../../ui/select_chip.dart';
import '../../ui/zip_line.dart';
import 'data/customer_models.dart';
import 'data/customers_api.dart';

final DateFormat _dueFmt = DateFormat('EEE d MMM y');

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// The web books a follow-up for a day at 09:00 (business time); the phone uses its own clock for that.
DateTime followUpDueFor(DateTime day) => DateTime(day.year, day.month, day.day, 9);

/// Opens the create / edit sheet. Resolves with the saved follow-up, or null when dismissed.
Future<FollowUp?> showFollowUpSheet(BuildContext context, {int? customerId, FollowUp? existing}) {
  assert(existing != null || customerId != null);
  return showModalBottomSheet<FollowUp>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => FollowUpSheet(customerId: customerId ?? existing!.customerId, existing: existing),
  );
}

/// Due date and note for a follow-up. Server messages for `dueAt` and `note` show under the fields.
class FollowUpSheet extends ConsumerStatefulWidget {
  const FollowUpSheet({super.key, required this.customerId, this.existing});
  final int customerId;
  final FollowUp? existing;

  @override
  ConsumerState<FollowUpSheet> createState() => _FollowUpSheetState();
}

class _FollowUpSheetState extends ConsumerState<FollowUpSheet> {
  late final TextEditingController _note = TextEditingController(text: widget.existing?.note ?? '');
  late DateTime _day = _dateOnly(widget.existing?.dueAt ?? DateTime.now().add(const Duration(days: 1)));
  bool _busy = false;
  String? _noteError;
  String? _dateError;
  String? _banner;

  bool get _editing => widget.existing != null;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickDay() async {
    final today = _dateOnly(DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: _day.isBefore(today) ? _day : today,
      lastDate: today.add(const Duration(days: 365 * 3)),
    );
    if (picked != null) {
      setState(() {
        _day = picked;
        _dateError = null;
      });
    }
  }

  Future<void> _save() async {
    final note = _note.text.trim();
    if (note.isEmpty) {
      setState(() => _noteError = 'Write what to follow up on.');
      return;
    }
    if (note.length > 1000) {
      setState(() => _noteError = 'Keep it under 1000 characters.');
      return;
    }
    setState(() {
      _busy = true;
      _banner = null;
      _noteError = null;
      _dateError = null;
    });
    final api = ref.read(customersApiProvider);
    try {
      final old = widget.existing;
      final FollowUp saved;
      if (old == null) {
        saved = await api.createFollowUp(customerId: widget.customerId, dueAt: followUpDueFor(_day), note: note);
      } else {
        final sameDay = old.dueAt != null && _dateOnly(old.dueAt!) == _day;
        saved = await api.updateFollowUp(
          old.id,
          note: note == old.note ? null : note,
          dueAt: sameDay ? null : followUpDueFor(_day),
        );
      }
      if (mounted) Navigator.of(context).pop(saved);
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _noteError = e.fields['note'];
        _dateError = e.fields['dueAt'];
        final leftovers = e.fields.keys.any((k) => k != 'note' && k != 'dueAt');
        _banner = (e.fields.isEmpty || leftovers) ? e.message : 'Please check the highlighted fields.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_editing ? 'Edit follow-up' : 'New follow-up', style: text.titleMedium),
            const SizedBox(height: 14),
            if (_banner != null) ...[ErrorBanner(message: _banner!), const SizedBox(height: 12)],
            Text('Due', style: text.labelLarge),
            const SizedBox(height: 6),
            OutlinedButton.icon(
              onPressed: _busy ? null : _pickDay,
              icon: const Icon(LucideIcons.calendar, size: 18),
              label: Text(_dueFmt.format(_day)),
            ),
            if (_dateError != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_dateError!, style: text.bodySmall?.copyWith(color: Brand.danger))),
            const SizedBox(height: 14),
            AppTextField(
              label: 'Note',
              controller: _note,
              hint: 'e.g. Ask how the hoodie fits',
              minLines: 2,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              errorText: _noteError,
              onChanged: (_) {
                if (_noteError != null) setState(() => _noteError = null);
              },
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(_editing ? 'Save changes' : 'Add follow-up'),
            ),
          ],
        ),
      ),
    );
  }
}

/// One open follow-up: tick to complete, tap the note to edit, bin to delete. [showCustomer] adds the customer's
/// name (tap opens them) for the all-customers list.
class FollowUpTile extends StatelessWidget {
  const FollowUpTile({
    super.key,
    required this.followUp,
    required this.onDone,
    required this.onEdit,
    required this.onDelete,
    this.showCustomer = false,
    this.now,
  });

  final FollowUp followUp;
  final VoidCallback onDone;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final bool showCustomer;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final f = followUp;
    final today = _dateOnly(now ?? DateTime.now());
    final overdue = f.dueAt != null && !f.isDone && _dateOnly(f.dueAt!).isBefore(today);
    return Container(
      decoration: BoxDecoration(color: Brand.white, borderRadius: Radii.lgAll, border: Border.all(color: Brand.line)),
      padding: const EdgeInsets.fromLTRB(4, 6, 4, 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconButton(
            tooltip: f.isDone ? 'Done' : 'Mark done',
            onPressed: f.isDone ? null : onDone,
            icon: Icon(f.isDone ? LucideIcons.circleCheck : LucideIcons.circle, color: f.isDone ? Brand.action : Brand.ink55),
          ),
          Expanded(
            child: InkWell(
              onTap: onEdit,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (showCustomer)
                      InkWell(
                        onTap: () => context.push('/customers/${f.customerId}'),
                        child: Text(f.customerName, style: text.titleSmall?.copyWith(fontSize: 14, color: Brand.action)),
                      ),
                    Text(f.note, style: text.bodyMedium),
                    const SizedBox(height: 2),
                    Text(
                      '${overdue ? 'Overdue · ' : ''}${f.dueAt == null ? '' : _dueFmt.format(f.dueAt!)}',
                      style: text.labelSmall?.copyWith(color: overdue ? Brand.danger : null, fontWeight: overdue ? FontWeight.w600 : null),
                    ),
                  ],
                ),
              ),
            ),
          ),
          IconButton(tooltip: 'Delete follow-up', onPressed: onDelete, icon: const Icon(LucideIcons.trash2, size: 18, color: Brand.ink55)),
        ],
      ),
    );
  }
}

Future<bool> confirmDeleteFollowUp(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Delete this follow-up?'),
      content: const Text('It will be removed for the whole team.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep it')),
        TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Delete')),
      ],
    ),
  );
  return ok == true;
}

/// Every customer's open follow-ups, in Overdue / Today / Upcoming chips (the server's `due` filter).
class FollowUpsScreen extends ConsumerStatefulWidget {
  const FollowUpsScreen({super.key});

  @override
  ConsumerState<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends ConsumerState<FollowUpsScreen> {
  static const _tabs = [('overdue', 'Overdue'), ('today', 'Today'), ('upcoming', 'Upcoming')];

  String _due = 'today';
  final List<FollowUp> _items = [];
  int _total = 0;
  int _page = 0;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  int _generation = 0;

  CustomersApi get _api => ref.read(customersApiProvider);

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload({bool keepList = false}) async {
    final generation = ++_generation;
    if (!keepList) {
      setState(() {
        _loading = true;
        _error = null;
        _items.clear();
        _page = 0;
        _total = 0;
      });
    }
    try {
      final page = await _api.followUps(due: _due);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _page = page.page;
        _total = page.total;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _loading = false;
        _error = e;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final page = await _api.followUps(due: _due, page: _page + 1);
      if (!mounted || generation != _generation) return;
      final known = _items.map((f) => f.id).toSet();
      setState(() {
        _items.addAll(page.items.where((f) => !known.contains(f.id)));
        _page = page.page;
        _total = page.total;
      });
    } on ApiError catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _done(FollowUp f) async {
    try {
      await _api.updateFollowUp(f.id, done: true);
      if (!mounted) return;
      setState(() {
        _items.removeWhere((x) => x.id == f.id);
        _total--;
      });
      _snack('Marked done.');
    } on ApiError catch (e) {
      _snack(e.message);
    }
  }

  Future<void> _edit(FollowUp f) async {
    final saved = await showFollowUpSheet(context, existing: f);
    if (saved != null) {
      _snack('Follow-up saved.');
      _reload(keepList: true);
    }
  }

  Future<void> _delete(FollowUp f) async {
    if (!await confirmDeleteFollowUp(context)) return;
    try {
      await _api.deleteFollowUp(f.id);
      if (!mounted) return;
      setState(() {
        _items.removeWhere((x) => x.id == f.id);
        _total--;
      });
      _snack('Follow-up deleted.');
    } on ApiError catch (e) {
      _snack(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Follow-ups')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in _tabs)
                SelectChip(
                  label: t.$2,
                  selected: _due == t.$1,
                  onTap: () {
                    if (_due == t.$1) return;
                    setState(() => _due = t.$1);
                    _reload();
                  },
                ),
            ]),
          ),
          const Divider(),
          Expanded(child: _content()),
        ],
      ),
    );
  }

  Widget _content() {
    if (_loading) return const Center(child: ZipLoader());
    if (_error != null) {
      return EmptyState(
        icon: LucideIcons.triangleAlert,
        title: 'Could not load follow-ups',
        message: _error is ApiError ? (_error as ApiError).message : 'Check your connection and try again.',
        actionLabel: 'Try again',
        onAction: _reload,
      );
    }
    if (_items.isEmpty) {
      final label = _tabs.firstWhere((t) => t.$1 == _due).$2.toLowerCase();
      return RefreshIndicator(
        onRefresh: () => _reload(keepList: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 360, child: EmptyState(icon: LucideIcons.bellOff, title: 'No $label follow-ups', message: 'Add one from a customer\'s page.'))],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => _reload(keepList: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          for (final f in _items) ...[
            FollowUpTile(followUp: f, showCustomer: true, onDone: () => _done(f), onEdit: () => _edit(f), onDelete: () => _delete(f)),
            const SizedBox(height: 10),
          ],
          if (_items.length < _total)
            Align(
              child: TextButton(
                onPressed: _loadingMore ? null : _loadMore,
                child: _loadingMore ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Show more'),
              ),
            ),
        ],
      ),
    );
  }
}

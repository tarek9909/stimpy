import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_error.dart';
import '../../core/launch.dart';
import '../../core/money.dart';
import '../../theme/brand.dart';
import '../../theme/typography.dart';
import '../../ui/app_text_field.dart';
import '../../ui/empty_state.dart';
import '../../ui/pill.dart';
import '../../ui/zip_line.dart';
import '../orders/list/orders_list_screen.dart' show OrderCard;
import 'customer_edit_screen.dart';
import 'customers_screen.dart' show TagChip;
import 'data/customer_models.dart';
import 'data/customers_api.dart';
import 'follow_ups.dart';

final DateFormat _when = DateFormat('EEE d MMM y, HH:mm');
final DateFormat _day = DateFormat('d MMM y');
String _fmt(DateTime? d) => d == null ? '' : _when.format(d);
String _fmtDay(DateTime? d) => d == null ? '-' : _day.format(d);

/// One customer: profile and stats, call and WhatsApp, tags, recent orders, activity timeline and team notes.
class CustomerDetailScreen extends ConsumerStatefulWidget {
  const CustomerDetailScreen({super.key, required this.customerId});

  final int customerId;

  @override
  ConsumerState<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends ConsumerState<CustomerDetailScreen> {
  CustomerProfile? _profile;
  List<CustomerTag> _tags = const [];
  List<FollowUp> _followUps = const [];
  bool _tagBusy = false;
  final List<CustomerNote> _notes = [];
  int _notesTotal = 0;
  int _notesPage = 0;
  bool _notesLoadingMore = false;
  final List<TimelineItem> _timeline = [];
  String? _cursor;
  bool _timelineLoadingMore = false;

  Object? _error;
  bool _loading = true;

  final _noteController = TextEditingController();
  bool _noteBusy = false;
  String? _noteError;

  CustomersApi get _api => ref.read(customersApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  /// The profile decides whether the screen works; tags, notes and the timeline are extras that may fail on their own.
  Future<void> _load({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    final id = widget.customerId;
    try {
      final results = await Future.wait<Object?>([
        _api.profile(id),
        _api.tags(id).then<Object?>((v) => v, onError: (_) => <CustomerTag>[]),
        _api.notes(id).then<Object?>((v) => v, onError: (_) => null),
        _api.timeline(id).then<Object?>((v) => v, onError: (_) => null),
        _api.openFollowUps(id).then<Object?>((v) => v, onError: (_) => null),
      ]);
      if (!mounted) return;
      final notes = results[2] as CustomerNotePage?;
      final timeline = results[3] as TimelinePage?;
      setState(() {
        _profile = results[0] as CustomerProfile;
        _tags = results[1] as List<CustomerTag>;
        _followUps = results[4] as List<FollowUp>? ?? _followUps;
        _notes
          ..clear()
          ..addAll(notes?.items ?? const []);
        _notesTotal = notes?.total ?? 0;
        _notesPage = notes == null ? 0 : 1;
        _timeline
          ..clear()
          ..addAll(timeline?.items ?? const []);
        _cursor = timeline?.nextCursor;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _loadMoreNotes() async {
    if (_notesLoadingMore) return;
    setState(() => _notesLoadingMore = true);
    try {
      final page = await _api.notes(widget.customerId, page: _notesPage + 1);
      if (!mounted) return;
      final known = _notes.map((n) => n.id).toSet();
      setState(() {
        _notes.addAll(page.items.where((n) => !known.contains(n.id)));
        _notesPage = page.page;
        _notesTotal = page.total;
      });
    } on ApiError catch (e) {
      if (mounted) _snack(e.message);
    } finally {
      if (mounted) setState(() => _notesLoadingMore = false);
    }
  }

  Future<void> _loadMoreTimeline() async {
    if (_timelineLoadingMore || _cursor == null) return;
    setState(() => _timelineLoadingMore = true);
    try {
      final page = await _api.timeline(widget.customerId, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _timeline.addAll(page.items);
        _cursor = page.nextCursor;
      });
    } on ApiError catch (e) {
      if (mounted) _snack(e.message);
    } finally {
      if (mounted) setState(() => _timelineLoadingMore = false);
    }
  }

  Future<void> _addNote() async {
    final body = _noteController.text.trim();
    if (body.isEmpty) {
      setState(() => _noteError = 'Write a note first.');
      return;
    }
    setState(() {
      _noteBusy = true;
      _noteError = null;
    });
    try {
      final note = await _api.addNote(widget.customerId, body);
      if (!mounted) return;
      _noteController.clear();
      setState(() {
        _notes.insert(0, note);
        _notesTotal++;
      });
      _snack('Note added.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _noteError = e.fields['body'] ?? e.message);
    } finally {
      if (mounted) setState(() => _noteBusy = false);
    }
  }

  Future<void> _edit(CustomerProfile p) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => CustomerEditScreen(profile: p)));
    if (saved == true && mounted) {
      _snack('Customer updated.');
      _load(quiet: true);
    }
  }

  Future<void> _addTag() async {
    final tag = await showModalBottomSheet<CustomerTag>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _TagPicker(attachedIds: {for (final t in _tags) t.id}),
    );
    if (tag == null || !mounted) return;
    setState(() => _tagBusy = true);
    try {
      final tags = await _api.attachTag(widget.customerId, tag.id);
      if (!mounted) return;
      setState(() => _tags = tags.isEmpty ? [..._tags, tag] : tags);
    } on ApiError catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _tagBusy = false);
    }
  }

  Future<void> _removeTag(CustomerTag tag) async {
    setState(() => _tagBusy = true);
    try {
      await _api.detachTag(widget.customerId, tag.id);
      if (!mounted) return;
      setState(() => _tags = [for (final t in _tags) if (t.id != tag.id) t]);
    } on ApiError catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _tagBusy = false);
    }
  }

  Future<void> _addFollowUp() async {
    final saved = await showFollowUpSheet(context, customerId: widget.customerId);
    if (saved != null && mounted) {
      _snack('Follow-up added.');
      _load(quiet: true);
    }
  }

  Future<void> _editFollowUp(FollowUp f) async {
    final saved = await showFollowUpSheet(context, existing: f);
    if (saved != null && mounted) {
      _snack('Follow-up saved.');
      _load(quiet: true);
    }
  }

  Future<void> _completeFollowUp(FollowUp f) async {
    try {
      await _api.updateFollowUp(f.id, done: true);
      if (!mounted) return;
      _snack('Marked done.');
      _load(quiet: true);
    } on ApiError catch (e) {
      _snack(e.message);
    }
  }

  Future<void> _deleteFollowUp(FollowUp f) async {
    if (!await confirmDeleteFollowUp(context)) return;
    try {
      await _api.deleteFollowUp(f.id);
      if (!mounted) return;
      _snack('Follow-up deleted.');
      _load(quiet: true);
    } on ApiError catch (e) {
      _snack(e.message);
    }
  }

  Future<void> _call(CustomerProfile p) async {
    if (!await openExternal(telUri(p.phone)) && mounted) _snack('The dialler could not be opened.');
  }

  Future<void> _whatsapp(CustomerProfile p) async {
    if (!await openExternal(whatsappChatUri(p.whatsappNumber)) && mounted) _snack('WhatsApp could not be opened.');
  }

  @override
  Widget build(BuildContext context) {
    final p = _profile;
    return Scaffold(
      appBar: AppBar(
        title: Text(p?.name ?? 'Customer'),
        actions: [if (p != null) IconButton(tooltip: 'Edit customer', icon: const Icon(LucideIcons.pencil, size: 20), onPressed: () => _edit(p))],
      ),
      body: _body(p),
    );
  }

  Widget _body(CustomerProfile? p) {
    if (p == null) {
      if (_loading) return const Center(child: ZipLoader());
      final notFound = _error is ApiError && (_error as ApiError).statusCode == 404;
      return EmptyState(
        icon: notFound ? LucideIcons.searchX : LucideIcons.triangleAlert,
        title: notFound ? 'Customer not found' : 'Could not load this customer',
        message: notFound ? 'They may have been removed.' : (_error is ApiError ? (_error as ApiError).message : 'Check your connection and try again.'),
        actionLabel: notFound ? null : 'Try again',
        onAction: notFound ? null : _load,
      );
    }
    final text = Theme.of(context).textTheme;
    return RefreshIndicator(
      onRefresh: () => _load(quiet: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          if (p.warning) _Warning(count: p.returnedCount),
          if (p.warning) const SizedBox(height: 12),
          _ProfileCard(profile: p, onCall: () => _call(p), onWhatsapp: () => _whatsapp(p)),
          _Section(
            title: 'Tags',
            child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (_tags.isEmpty) Text('No tags.', style: text.bodySmall),
              for (final t in _tags)
                Row(mainAxisSize: MainAxisSize.min, children: [
                  TagChip(tag: t),
                  InkResponse(
                    onTap: _tagBusy ? null : () => _removeTag(t),
                    radius: 16,
                    child: Semantics(
                      button: true,
                      label: 'Remove tag ${t.name}',
                      child: const Padding(padding: EdgeInsets.all(6), child: Icon(LucideIcons.x, size: 14, color: Brand.ink55)),
                    ),
                  ),
                ]),
              OutlinedButton.icon(onPressed: _tagBusy ? null : _addTag, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Add tag')),
            ]),
          ),
          _Section(title: 'Follow-ups', child: _followUpsBlock()),
          _Section(title: 'Orders', child: _orders(p)),
          _Section(title: 'Activity', child: _timelineBlock()),
          _Section(title: 'Notes', child: _notesBlock(p)),
        ],
      ),
    );
  }

  Widget _followUpsBlock() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_followUps.isEmpty) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('No open follow-ups.', style: Theme.of(context).textTheme.bodySmall)),
        for (final f in _followUps) ...[
          FollowUpTile(followUp: f, onDone: () => _completeFollowUp(f), onEdit: () => _editFollowUp(f), onDelete: () => _deleteFollowUp(f)),
          const SizedBox(height: 8),
        ],
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(onPressed: _addFollowUp, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Add follow-up')),
        ),
      ],
    );
  }

  Widget _orders(CustomerProfile p) {
    if (p.recentOrders.isEmpty) return Text('No orders yet.', style: Theme.of(context).textTheme.bodySmall);
    return Column(
      children: [
        for (final o in p.recentOrders) ...[
          OrderCard(order: o, onTap: () => context.push('/orders/${o.id}')),
          const SizedBox(height: 10),
        ],
        if (p.orderCount > p.recentOrders.length)
          Align(alignment: Alignment.centerLeft, child: Text('Showing the latest ${p.recentOrders.length} of ${p.orderCount} orders.', style: Theme.of(context).textTheme.labelSmall)),
      ],
    );
  }

  static IconData _timelineIcon(String type) => switch (type) {
        'ORDER' => LucideIcons.shoppingBag,
        'ORDER_EVENT' => LucideIcons.truck,
        'ORDER_NOTE' || 'CUSTOMER_NOTE' => LucideIcons.notebookPen,
        'EMAIL' => LucideIcons.mail,
        'FOLLOW_UP' => LucideIcons.bell,
        _ => LucideIcons.circle,
      };

  Widget _timelineBlock() {
    final text = Theme.of(context).textTheme;
    if (_timeline.isEmpty) return Text('No activity yet.', style: text.bodySmall);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _timeline.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 26,
                  child: Column(
                    children: [
                      Padding(padding: const EdgeInsets.only(top: 2), child: Icon(_timelineIcon(_timeline[i].type), size: 16, color: i == 0 ? Brand.action : Brand.ink55)),
                      if (i < _timeline.length - 1) Expanded(child: Container(width: 2, margin: const EdgeInsets.only(top: 4), color: Brand.line)),
                    ],
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_timeline[i].title, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                        if ((_timeline[i].detail ?? '').isNotEmpty) Text(_timeline[i].detail!, style: text.bodySmall),
                        Text(_fmt(_timeline[i].at), style: text.labelSmall),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (_cursor != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _timelineLoadingMore ? null : _loadMoreTimeline,
              child: _timelineLoadingMore ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Show older activity'),
            ),
          ),
      ],
    );
  }

  Widget _notesBlock(CustomerProfile p) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if ((p.notes ?? '').isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Brand.panel, borderRadius: Radii.mdAll, border: Border.all(color: Brand.line)),
            child: Text(p.notes!, style: text.bodyMedium),
          ),
          const SizedBox(height: 8),
        ],
        for (final n in _notes) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Brand.panel, borderRadius: Radii.mdAll, border: Border.all(color: Brand.line)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(n.body, style: text.bodyMedium),
                const SizedBox(height: 4),
                Text('${n.userName} · ${_fmt(n.createdAt)}', style: text.labelSmall),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
        if (_notes.length < _notesTotal)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _notesLoadingMore ? null : _loadMoreNotes,
              child: _notesLoadingMore ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Show older notes'),
            ),
          ),
        AppTextField(
          label: 'Add a note',
          controller: _noteController,
          hint: 'Only your team sees this',
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          errorText: _noteError,
          onChanged: (_) {
            if (_noteError != null) setState(() => _noteError = null);
          },
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: OutlinedButton(
            onPressed: _noteBusy ? null : _addNote,
            child: _noteBusy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Add note'),
          ),
        ),
      ],
    );
  }
}

// ------------------------------------------------------------------ pieces

/// Bottom sheet listing the tags the customer does not have yet (`GET /admin/customer-tags`). Pops with the pick.
class _TagPicker extends ConsumerStatefulWidget {
  const _TagPicker({required this.attachedIds});
  final Set<int> attachedIds;

  @override
  ConsumerState<_TagPicker> createState() => _TagPickerState();
}

class _TagPickerState extends ConsumerState<_TagPicker> {
  List<CustomerTag>? _all;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final tags = await ref.read(customersApiProvider).allTags();
      if (mounted) setState(() => _all = tags);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final available = [for (final t in _all ?? const <CustomerTag>[]) if (!widget.attachedIds.contains(t.id)) t];
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add a tag', style: text.titleMedium),
          const SizedBox(height: 12),
          if (_error != null)
            Column(children: [
              Text(_error is ApiError ? (_error as ApiError).message : 'Could not load tags.', style: text.bodySmall),
              TextButton(onPressed: _load, child: const Text('Try again')),
            ])
          else if (_all == null)
            const Padding(padding: EdgeInsets.all(16), child: Center(child: ZipLoader()))
          else if (available.isEmpty)
            Text(_all!.isEmpty ? 'No tags exist yet. Create them in the web dashboard.' : 'This customer already has every tag.', style: text.bodySmall)
          else
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in available) InkWell(borderRadius: Radii.smAll, onTap: () => Navigator.of(context).pop(t), child: TagChip(tag: t)),
            ]),
        ],
      ),
    );
  }
}

class _Warning extends StatelessWidget {
  const _Warning({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Brand.danger.withValues(alpha: 0.07), borderRadius: Radii.mdAll, border: Border.all(color: Brand.danger.withValues(alpha: 0.4))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(LucideIcons.triangleAlert, size: 18, color: Brand.danger),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Returned $count ${count == 1 ? 'order' : 'orders'}. Consider confirming by phone before sending the next one.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Brand.ink),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.profile, required this.onCall, required this.onWhatsapp});
  final CustomerProfile profile;
  final VoidCallback onCall;
  final VoidCallback onWhatsapp;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final p = profile;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(p.name, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text('Customer since ${_fmtDay(p.createdAt)}', style: text.bodySmall),
            const SizedBox(height: 10),
            _Line(icon: LucideIcons.phone, text: p.phone),
            if (p.whatsapp.isNotEmpty && p.whatsapp != p.phone) _Line(icon: LucideIcons.messageCircle, text: p.whatsapp),
            if ((p.email ?? '').isNotEmpty) _Line(icon: LucideIcons.mail, text: p.email!),
            if ((p.areaName ?? '').isNotEmpty) _Line(icon: LucideIcons.mapPin, text: p.areaName!, copy: false),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: onCall, icon: const Icon(LucideIcons.phone, size: 18), label: const Text('Call'))),
              const SizedBox(width: 10),
              Expanded(child: OutlinedButton.icon(onPressed: onWhatsapp, icon: const Icon(LucideIcons.messageCircle, size: 18), label: const Text('WhatsApp'))),
            ]),
            const Divider(height: 28),
            Row(children: [
              _Stat(label: 'Orders', value: '${p.orderCount}'),
              _Stat(label: 'Spent', value: formatCents(p.lifetimeValueCents)),
              _Stat(label: 'Average', value: formatCents(p.averageOrderValueCents)),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              _Stat(label: 'First order', value: _fmtDay(p.firstOrderAt)),
              _Stat(label: 'Last order', value: _fmtDay(p.lastOrderAt)),
              _Stat(label: 'Returned', value: '${p.returnedCount}'),
            ]),
            if ((p.favouriteStimpie ?? '').isNotEmpty || (p.favouriteColor ?? '').isNotEmpty || p.optedOut) ...[
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 6, children: [
                if ((p.favouriteStimpie ?? '').isNotEmpty) Pill(label: 'Favourite: ${p.favouriteStimpie}', tone: PillTone.lilac),
                if ((p.favouriteColor ?? '').isNotEmpty) Pill(label: p.favouriteColor!, tone: PillTone.cream),
                if (p.optedOut) const Pill(label: 'Opted out of marketing', tone: PillTone.neutral),
              ]),
            ],
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.labelSmall),
          const SizedBox(height: 2),
          Text(value, style: text.titleSmall?.tabular, maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text, this.copy = true});
  final IconData icon;
  final String text;
  final bool copy;

  @override
  Widget build(BuildContext context) {
    final body = Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 2), child: Icon(icon, size: 18, color: Brand.ink55)),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.tabular)),
        ],
      ),
    );
    if (!copy) return body;
    return InkWell(
      borderRadius: Radii.mdAll,
      onLongPress: () async {
        await Clipboard.setData(ClipboardData(text: text));
        if (context.mounted) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(const SnackBar(content: Text('Copied.')));
        }
      },
      child: body,
    );
  }
}

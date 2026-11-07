import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api_error.dart';
import '../../../core/money.dart';
import '../../../core/order_status.dart';
import '../../../core/providers.dart';
import '../../../theme/brand.dart';
import '../../../theme/typography.dart';
import '../../../ui/app_text_field.dart';
import '../../../ui/empty_state.dart';
import '../../../ui/error_banner.dart';
import '../../../ui/net_image.dart';
import '../../../ui/status_pill.dart';
import '../../../ui/zip_line.dart';
import '../../../app/nav_badges.dart';
import 'customer_search.dart';
import 'line_editor.dart';
import 'order_catalog.dart';
import 'order_line.dart';
import 'order_validation.dart';

/// Manual order: the app's version of the dashboard's "+ New order" (dashboard-pages 5.6).
/// Posts to `POST /admin/orders`. The server applies the same availability rules as for customers and sets the
/// final prices; the totals shown here are an estimate.
class NewOrderScreen extends ConsumerStatefulWidget {
  const NewOrderScreen({super.key, this.customer});

  /// Pre-fills the customer (used from a customer's profile: "New order for this customer").
  final CustomerHit? customer;

  @override
  ConsumerState<NewOrderScreen> createState() => _NewOrderScreenState();
}

class _NewOrderScreenState extends ConsumerState<NewOrderScreen> {
  final _scroll = ScrollController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _whatsapp = TextEditingController();
  final _email = TextEditingController();
  final _areaName = TextEditingController();
  final _address = TextEditingController();
  final _notes = TextEditingController();
  final _sections = {for (final k in ['customer', 'delivery', 'items']) k: GlobalKey()};

  String _source = 'WHATSAPP';
  bool _whatsappSame = true;
  int? _areaId;
  String _initialStatus = 'CONFIRMED';
  bool _sendEmail = true;
  final List<OrderLine> _lines = [];

  bool _busy = false;
  String? _banner;
  Map<String, String> _errors = {};
  Map<int, String> _lineProblems = {};
  bool _allowPop = false;

  List<TextEditingController> get _controllers => [_name, _phone, _whatsapp, _email, _areaName, _address, _notes];

  @override
  void initState() {
    super.initState();
    for (final c in _controllers) {
      c.addListener(_onChanged);
    }
    if (widget.customer != null) _applyCustomer(widget.customer!);
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.removeListener(_onChanged);
      c.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  void _onChanged() => setState(() {});

  bool get _dirty => _lines.isNotEmpty || _controllers.any((c) => c.text.trim().isNotEmpty);

  void _clearError(String key) {
    if (_errors.containsKey(key)) setState(() => _errors = {..._errors}..remove(key));
  }

  void _applyCustomer(CustomerHit c) {
    _name.text = c.name;
    _phone.text = c.phone;
    _email.text = c.email ?? '';
    _whatsappSame = c.whatsappSameAsPhone;
    _whatsapp.text = c.whatsappSameAsPhone ? '' : c.whatsapp;
    _errors = {};
  }

  // ---------------------------------------------------------------- actions

  Future<void> _findCustomer() async {
    final hit = await showCustomerSearch(context, ref.read(apiClientProvider));
    if (hit != null && mounted) setState(() => _applyCustomer(hit));
  }

  Future<void> _pickArea(DeliveryFees fees) async {
    final choice = await showModalBottomSheet<_AreaChoice>(
      context: context,
      showDragHandle: true,
      builder: (context) => _AreaSheet(fees: fees, selectedId: _areaId),
    );
    if (choice == null || !mounted) return;
    setState(() {
      _areaId = choice.id;
      if (choice.name != null) _areaName.text = choice.name!;
      _errors = {..._errors}..remove('areaName');
    });
  }

  Future<void> _addItem(OrderCatalog catalog) async {
    final kind = await showModalBottomSheet<LineKind>(
      context: context,
      showDragHandle: true,
      builder: (context) => _KindChooser(catalog: catalog),
    );
    if (kind == null || !mounted) return;
    final line = await showLineEditor(context, catalog: catalog, kind: kind);
    if (line != null && mounted) {
      setState(() {
        _lines.add(line);
        _errors = {..._errors}..remove('items');
        _lineProblems = {};
      });
    }
  }

  Future<void> _editItem(OrderCatalog catalog, int index) async {
    final line = _lines[index];
    final edited = await showLineEditor(context, catalog: catalog, kind: LineKind.of(line), initial: line);
    if (edited != null && mounted) {
      setState(() {
        _lines[index] = edited;
        _lineProblems = {..._lineProblems}..remove(index);
      });
    }
  }

  void _removeItem(int index) => setState(() {
        _lines.removeAt(index);
        _lineProblems = {};
      });

  Future<bool> _confirmDiscard() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard this order?'),
        content: const Text('What you entered will be lost.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep editing')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Brand.danger),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  Map<String, dynamic> _body() => buildOrderBody(
        source: _source,
        initialStatus: _initialStatus,
        sendEmail: _sendEmail,
        name: _name.text,
        phone: _phone.text,
        whatsappSame: _whatsappSame,
        whatsapp: _whatsapp.text,
        email: _email.text,
        areaId: _areaId,
        areaName: _areaName.text,
        address: _address.text,
        notes: _notes.text,
        lines: _lines,
      );

  Future<void> _submit(OrderCatalog catalog) async {
    if (_busy) return;
    FocusScope.of(context).unfocus();
    final problems = validateOrderForm(
      name: _name.text,
      phone: _phone.text,
      whatsappSame: _whatsappSame,
      whatsapp: _whatsapp.text,
      email: _email.text,
      areaName: _areaName.text,
      address: _address.text,
      notes: _notes.text,
      lines: _lines,
      catalog: catalog,
    );
    if (problems.isNotEmpty) {
      setState(() {
        _errors = problems;
        _banner = null;
      });
      _scrollToFirstError(problems.keys);
      return;
    }

    setState(() {
      _busy = true;
      _banner = null;
      _errors = {};
      _lineProblems = {};
    });
    Map<String, dynamic>? order;
    ApiError? failure;
    try {
      order = await ref.read(apiClientProvider).postJson('/admin/orders', body: _body());
    } on ApiError catch (e) {
      failure = e;
    }
    if (!mounted) return;
    // Stop the button's spinner before any sheet or dialog opens over it.
    setState(() => _busy = false);
    if (order != null) {
      ref.invalidate(orderCatalogProvider); // stock changed
      await _showCreated(order);
    } else {
      await _handleError(failure!);
    }
  }

  Future<void> _handleError(ApiError e) async {
    // SOLD_OUT / NOT_PURCHASABLE: tell which lines, and refresh the catalog so pickers show the new stock.
    final raw = e.details?['items'];
    if ((e.code == 'SOLD_OUT' || e.code == 'NOT_PURCHASABLE') && raw is List) {
      final byIndex = describeStockProblems(e.code!, raw);
      ref.invalidate(orderCatalogProvider);
      setState(() => _lineProblems = byIndex);
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(e.code == 'SOLD_OUT' ? 'Not enough stock' : 'Not available to order'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final entry in byIndex.entries) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(entry.value)),
              const SizedBox(height: 4),
              const Text('Change those items and try again.'),
            ],
          ),
          actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
        ),
      );
      return;
    }

    final mapped = mapServerFields(e.fields);
    setState(() {
      _errors = mapped.fieldErrors;
      _banner = (mapped.fieldErrors.isEmpty || mapped.leftovers.isNotEmpty) ? [e.message, ...mapped.leftovers].join(' ') : 'Please check the highlighted fields.';
    });
    if (_errors.isNotEmpty) {
      _scrollToFirstError(_errors.keys);
    } else if (_scroll.hasClients) {
      _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  void _scrollToFirstError(Iterable<String> keys) {
    const order = ['name', 'phone', 'whatsapp', 'email', 'areaName', 'address', 'notes', 'items'];
    final first = order.firstWhere(keys.contains, orElse: () => keys.first);
    final section = switch (first) { 'name' || 'phone' || 'whatsapp' || 'email' => 'customer', 'items' => 'items', _ => 'delivery' };
    final ctx = _sections[section]?.currentContext;
    if (ctx != null) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 250), alignment: 0.05);
  }

  Future<void> _showCreated(Map<String, dynamic> order) async {
    final another = await showModalBottomSheet<bool>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (context) => _CreatedSheet(order: order),
    );
    if (!mounted) return;
    if (another == true) {
      setState(() {
        for (final c in _controllers) {
          c.clear();
        }
        _lines.clear();
        _areaId = null;
        _whatsappSame = true;
        _errors = {};
        _banner = null;
      });
      if (_scroll.hasClients) _scroll.jumpTo(0);
    } else {
      // The Orders tab will list it; for now make sure the "new orders" badge is not stale.
      ref.read(newOrdersBadgeProvider.notifier).set(ref.read(newOrdersBadgeProvider));
      _allowPop = true;
      Navigator.of(context).pop(true);
    }
  }

  Future<void> _onPopInvoked(bool didPop) async {
    if (didPop) return;
    final discard = await _confirmDiscard();
    if (!discard || !mounted) return;
    _allowPop = true;
    Navigator.of(context).pop();
  }

  // ---------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    final catalogAsync = ref.watch(orderCatalogProvider);
    return PopScope(
      canPop: !_dirty || _allowPop,
      onPopInvokedWithResult: (didPop, _) => _onPopInvoked(didPop),
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(tooltip: 'Close', icon: const Icon(LucideIcons.x), onPressed: () => Navigator.of(context).maybePop()),
          title: const Text('New order'),
        ),
        body: catalogAsync.when(
          // Keep the form on screen while the catalog reloads in the background (after an order changes stock).
          skipLoadingOnReload: true,
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: ZipLoader()),
          error: (e, _) => EmptyState(
            icon: LucideIcons.triangleAlert,
            title: 'Could not load the catalog',
            message: e is ApiError ? e.message : 'Check your connection and try again.',
            actionLabel: 'Try again',
            onAction: () => ref.invalidate(orderCatalogProvider),
          ),
          data: _form,
        ),
        bottomNavigationBar: catalogAsync.hasValue ? _bottomBar(catalogAsync.requireValue) : null,
      ),
    );
  }

  Widget _bottomBar(OrderCatalog catalog) {
    final totals = OrderTotals.of(_lines, catalog, _areaId);
    final text = Theme.of(context).textTheme;
    return DecoratedBox(
      decoration: const BoxDecoration(color: Brand.white, border: Border(top: BorderSide(color: Brand.line))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Estimated total', style: text.labelSmall),
                  Text(formatCents(totals.totalCents), style: text.titleLarge?.tabular),
                ],
              ),
              const SizedBox(width: 16),
              Expanded(
                child: FilledButton(
                  onPressed: _busy ? null : () => _submit(catalog),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  child: _busy
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Brand.white))
                      : const Text('Create order'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _form(OrderCatalog catalog) {
    final text = Theme.of(context).textTheme;
    final totals = OrderTotals.of(_lines, catalog, _areaId);
    final hasEmail = _email.text.trim().isNotEmpty;
    final area = _areaId == null ? null : catalog.fees.areas.where((a) => a.id == _areaId).firstOrNull;

    return ListView(
      controller: _scroll,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.all(16),
      children: [
        if (_banner != null) ...[ErrorBanner(message: _banner!), const SizedBox(height: 16)],
        _Section(
          title: 'Source',
          subtitle: 'Where did this order come from?',
          child: SegmentedButton<String>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: 'INSTAGRAM', label: Text('Instagram')),
              ButtonSegment(value: 'WHATSAPP', label: Text('WhatsApp')),
              ButtonSegment(value: 'MANUAL', label: Text('Manual')),
            ],
            selected: {_source},
            onSelectionChanged: (s) => setState(() => _source = s.first),
          ),
        ),
        _Section(
          key: _sections['customer'],
          title: 'Customer',
          trailing: TextButton.icon(
            onPressed: _findCustomer,
            icon: const Icon(LucideIcons.userSearch, size: 18),
            label: const Text('Find'),
          ),
          child: Column(
            children: [
              AppTextField(
                label: 'Name',
                controller: _name,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                errorText: _errors['name'],
                onChanged: (_) => _clearError('name'),
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: 'Phone',
                controller: _phone,
                hint: '03 123 456 or +961 3 123 456',
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                errorText: _errors['phone'],
                onChanged: (_) => _clearError('phone'),
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: 'Email',
                controller: _email,
                optional: true,
                helper: 'Needed to email the customer about this order.',
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                errorText: _errors['email'],
                onChanged: (_) => _clearError('email'),
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('WhatsApp is the same as the phone', style: text.bodyMedium),
                value: _whatsappSame,
                onChanged: (v) => setState(() {
                  _whatsappSame = v;
                  _errors = {..._errors}..remove('whatsapp');
                }),
              ),
              if (!_whatsappSame) ...[
                const SizedBox(height: 8),
                AppTextField(
                  label: 'WhatsApp number',
                  controller: _whatsapp,
                  keyboardType: TextInputType.phone,
                  errorText: _errors['whatsapp'],
                  onChanged: (_) => _clearError('whatsapp'),
                ),
              ],
            ],
          ),
        ),
        _Section(
          key: _sections['delivery'],
          title: 'Delivery',
          child: Column(
            children: [
              _PickerField(
                label: 'Area',
                optional: true,
                value: area == null ? null : '${area.name} · ${formatCents(area.feeCents ?? catalog.fees.defaultFeeCents)}',
                placeholder: 'Choose an area',
                onTap: () => _pickArea(catalog.fees),
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: 'Area name',
                controller: _areaName,
                helper: 'Filled from the area above; edit it if needed.',
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                errorText: _errors['areaName'],
                onChanged: (_) => _clearError('areaName'),
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: 'Address',
                controller: _address,
                hint: 'Street, building, floor',
                minLines: 2,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                keyboardType: TextInputType.multiline,
                errorText: _errors['address'],
                onChanged: (_) => _clearError('address'),
              ),
              const SizedBox(height: 16),
              AppTextField(
                label: 'Delivery notes',
                controller: _notes,
                optional: true,
                minLines: 2,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                keyboardType: TextInputType.multiline,
                errorText: _errors['notes'],
                onChanged: (_) => _clearError('notes'),
              ),
            ],
          ),
        ),
        _Section(
          key: _sections['items'],
          title: 'Items',
          subtitle: 'Sold-out sizes and Stimpies are disabled.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < _lines.length; i++) ...[
                _LineCard(
                  line: _lines[i],
                  catalog: catalog,
                  problem: _lineProblems[i],
                  onEdit: () => _editItem(catalog, i),
                  onRemove: () => _removeItem(i),
                ),
                const SizedBox(height: 10),
              ],
              if (_errors['items'] != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: ErrorBanner(message: _errors['items']!)),
              OutlinedButton.icon(
                onPressed: _lines.length >= 20 ? null : () => _addItem(catalog),
                icon: const Icon(LucideIcons.plus, size: 18),
                label: Text(_lines.isEmpty ? 'Add an item' : 'Add another item'),
              ),
              if (_lines.length >= 20) Padding(padding: const EdgeInsets.only(top: 8), child: Text('An order can have at most 20 items.', style: text.labelSmall)),
            ],
          ),
        ),
        _Section(
          title: 'Order',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Start as', style: text.labelLarge),
              const SizedBox(height: 6),
              SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [ButtonSegment(value: 'CONFIRMED', label: Text('Confirmed')), ButtonSegment(value: 'NEW', label: Text('New'))],
                selected: {_initialStatus},
                onSelectionChanged: (s) => setState(() => _initialStatus = s.first),
              ),
              const SizedBox(height: 8),
              Text(
                _initialStatus == 'CONFIRMED'
                    ? 'Confirmed: stock is reserved and the customer is emailed "Order confirmed".'
                    : 'New: the order waits for you to confirm it.',
                style: text.labelSmall,
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Email the customer', style: text.bodyMedium),
                subtitle: hasEmail ? null : Text('Enter an email address to turn this on.', style: text.labelSmall),
                value: hasEmail && _sendEmail,
                onChanged: hasEmail ? (v) => setState(() => _sendEmail = v) : null,
              ),
            ],
          ),
        ),
        _TotalsCard(totals: totals, estimateText: catalog.fees.estimateText),
        const SizedBox(height: 24),
      ],
    );
  }
}

// ------------------------------------------------------------------ pieces

class _Section extends StatelessWidget {
  const _Section({super.key, required this.title, required this.child, this.subtitle, this.trailing});

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text(title, style: text.titleMedium)),
                  ?trailing,
                ],
              ),
              if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(subtitle!, style: text.bodySmall)),
              const SizedBox(height: 14),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// A read-only field that opens a sheet (same look as [AppTextField]).
class _PickerField extends StatelessWidget {
  const _PickerField({required this.label, required this.placeholder, required this.onTap, this.value, this.optional = false});

  final String label;
  final String placeholder;
  final String? value;
  final bool optional;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(text: label, children: [if (optional) TextSpan(text: '  Optional', style: text.labelSmall)]),
          style: text.labelLarge,
        ),
        const SizedBox(height: 6),
        Semantics(
          button: true,
          label: '$label, ${value ?? placeholder}',
          excludeSemantics: true,
          child: InkWell(
            onTap: onTap,
            borderRadius: Radii.mdAll,
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(border: Border.all(color: Brand.controlBorder), borderRadius: Radii.mdAll),
              child: Row(
                children: [
                  Expanded(child: Text(value ?? placeholder, style: text.bodyLarge?.copyWith(color: value == null ? Brand.disabledFg : Brand.ink))),
                  const Icon(LucideIcons.chevronDown, size: 20, color: Brand.ink55),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _AreaChoice {
  const _AreaChoice(this.id, this.name);
  final int? id;
  final String? name;
}

class _AreaSheet extends StatelessWidget {
  const _AreaSheet({required this.fees, required this.selectedId});

  final DeliveryFees fees;
  final int? selectedId;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Delivery area', style: text.titleLarge)),
          for (final a in fees.areas)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
              title: Text(a.name, style: text.bodyMedium),
              trailing: Text(formatCents(a.feeCents ?? fees.defaultFeeCents), style: text.bodySmall?.tabular),
              selected: a.id == selectedId,
              selectedColor: Brand.action,
              onTap: () => Navigator.of(context).pop(_AreaChoice(a.id, a.name)),
            ),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            title: Text('Another area', style: text.bodyMedium),
            subtitle: Text('Default delivery fee (${formatCents(fees.defaultFeeCents)}). Type the area name.', style: text.labelSmall),
            selected: selectedId == null,
            selectedColor: Brand.action,
            onTap: () => Navigator.of(context).pop(const _AreaChoice(null, null)),
          ),
        ],
      ),
    );
  }
}

class _KindChooser extends StatelessWidget {
  const _KindChooser({required this.catalog});
  final OrderCatalog catalog;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('What are you adding?', style: text.titleLarge)),
          for (final kind in LineKind.values)
            Builder(builder: (context) {
              final reason = kind.unavailableReason(catalog);
              return ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                enabled: reason == null,
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: Brand.surface, borderRadius: Radii.mdAll),
                  child: Icon(kind.icon, size: 20, color: reason == null ? Brand.ink70 : Brand.disabledFg),
                ),
                title: Text(kind.label, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                subtitle: Text(reason ?? kind.description, style: text.labelSmall),
                trailing: reason == null ? const Icon(LucideIcons.chevronRight, size: 18, color: Brand.ink55) : null,
                onTap: reason == null ? () => Navigator.of(context).pop(kind) : null,
              );
            }),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({required this.line, required this.catalog, required this.onEdit, required this.onRemove, this.problem});

  final OrderLine line;
  final OrderCatalog catalog;
  final String? problem;
  final VoidCallback onEdit;
  final VoidCallback onRemove;

  String? get _imageUrl => switch (line) {
        HoodieLine l => catalog.hoodie(l.hoodieId)?.imageUrl,
        HoodieSetLine l => catalog.hoodie(l.hoodieId)?.imageUrl,
        StimpieLine l => catalog.stimpie(l.stimpieId)?.imageUrl,
        StimpiePackLine l => l.stimpies.keys.map((id) => catalog.stimpie(id)?.imageUrl).whereType<String>().firstOrNull,
      };

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final kind = LineKind.of(line);
    final unit = line.unitPriceCents(catalog);
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: problem == null ? Brand.line : Brand.danger),
        borderRadius: Radii.lgAll,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: Radii.lgAll,
          onTap: onEdit,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 48, height: 60, child: NetImage(url: _imageUrl, icon: kind.icon)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(line.title(catalog), style: text.titleSmall),
                      const SizedBox(height: 2),
                      Text(line.detail(catalog), style: text.bodySmall, maxLines: 3, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 6),
                      Text('${line.qty} × ${formatCents(unit)}  =  ${formatCents(line.lineTotalCents(catalog))}', style: text.labelMedium?.copyWith(color: Brand.ink).tabular),
                      if (problem != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(problem!, style: text.labelMedium?.copyWith(color: Brand.danger))),
                    ],
                  ),
                ),
                IconButton(tooltip: 'Remove item', icon: const Icon(LucideIcons.trash2, size: 20), onPressed: onRemove),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.totals, required this.estimateText});

  final OrderTotals totals;
  final String estimateText;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget row(String label, String value, {bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            children: [
              Expanded(child: Text(label, style: strong ? text.titleSmall : text.bodyMedium)),
              Text(value, style: (strong ? text.titleMedium : text.bodyMedium)?.tabular),
            ],
          ),
        );
    return DecoratedBox(
      decoration: BoxDecoration(color: Brand.panel, border: Border.all(color: Brand.line), borderRadius: Radii.lgAll),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Summary', style: text.titleMedium),
            const SizedBox(height: 2),
            Text('Uses the configured prices; the server checks the final prices.', style: text.bodySmall),
            const SizedBox(height: 10),
            row('Subtotal', formatCents(totals.subtotalCents)),
            row('Delivery fee', formatCents(totals.deliveryCents)),
            const Divider(height: 16),
            row('Total', formatCents(totals.totalCents), strong: true),
            if (estimateText.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Delivery: $estimateText', style: text.labelSmall)),
          ],
        ),
      ),
    );
  }
}

class _CreatedSheet extends StatelessWidget {
  const _CreatedSheet({required this.order});
  final Map<String, dynamic> order;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final number = order['number'] as String? ?? '';
    final total = order['totalCents'] as int?;
    final status = OrderStatus.fromApi(order['status'] as String?);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 56,
                height: 56,
                decoration: const BoxDecoration(color: Brand.success, shape: BoxShape.circle),
                child: const Icon(LucideIcons.check, color: Brand.white, size: 30),
              ),
            ),
            const SizedBox(height: 16),
            Text('Order $number created', textAlign: TextAlign.center, style: text.titleLarge),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                StatusPill(status),
                if (total != null) ...[const SizedBox(width: 12), Text(formatCents(total), style: text.titleSmall?.tabular)],
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: () => Navigator.of(context).pop(false), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Done')),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => Navigator.of(context).pop(true), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Create another order')),
          ],
        ),
      ),
    );
  }
}

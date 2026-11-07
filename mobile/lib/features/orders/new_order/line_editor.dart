import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/money.dart';
import '../../../theme/brand.dart';
import '../../../theme/typography.dart';
import '../../../ui/color_swatch.dart';
import '../../../ui/net_image.dart';
import '../../../ui/pill.dart';
import '../../../ui/qty_stepper.dart';
import '../../../ui/select_chip.dart';
import 'order_catalog.dart';
import 'order_line.dart';

/// The four things a manual order line can be (see [OrderLine]).
enum LineKind {
  hoodie('Hoodie', 'One hoodie in a colour and size', LucideIcons.shirt),
  hoodieSet('Hoodie + Stimpies', 'A hoodie with Stimpies at the set price', LucideIcons.packagePlus),
  stimpie('Single Stimpie', 'One Stimpie design', LucideIcons.layers),
  stimpiePack('Stimpie offer', 'A bundle of Stimpies at the offer price', LucideIcons.gift);

  const LineKind(this.label, this.description, this.icon);
  final String label;
  final String description;
  final IconData icon;

  static LineKind of(OrderLine line) => switch (line) {
        HoodieLine() => LineKind.hoodie,
        HoodieSetLine() => LineKind.hoodieSet,
        StimpieLine() => LineKind.stimpie,
        StimpiePackLine() => LineKind.stimpiePack,
      };

  /// Why this kind cannot be added right now, or null when it can.
  String? unavailableReason(OrderCatalog c) => switch (this) {
        LineKind.hoodie => c.hoodies.isEmpty ? 'No hoodies are on sale.' : null,
        LineKind.hoodieSet => c.hoodieSets.isEmpty
            ? 'No hoodie sets are on sale.'
            : c.hoodies.isEmpty
                ? 'No hoodies are on sale.'
                : c.orderableStimpies.isEmpty
                    ? 'No Stimpies are on sale right now.'
                    : null,
        LineKind.stimpie => c.orderableStimpies.isEmpty ? 'No Stimpies are on sale right now.' : null,
        LineKind.stimpiePack => c.stimpieOffers.isEmpty
            ? 'No Stimpie offers are on sale.'
            : c.orderableStimpies.isEmpty
                ? 'No Stimpies are on sale right now.'
                : null,
      };
}

/// Opens the editor as a tall sheet. Returns the finished line, or null when dismissed.
Future<OrderLine?> showLineEditor(BuildContext context, {required OrderCatalog catalog, required LineKind kind, OrderLine? initial}) {
  return showModalBottomSheet<OrderLine>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: false,
    builder: (context) => FractionallySizedBox(
      heightFactor: 0.95,
      child: LineEditor(catalog: catalog, kind: kind, initial: initial),
    ),
  );
}

class LineEditor extends StatefulWidget {
  const LineEditor({super.key, required this.catalog, required this.kind, this.initial});

  final OrderCatalog catalog;
  final LineKind kind;
  final OrderLine? initial;

  @override
  State<LineEditor> createState() => _LineEditorState();
}

class _LineEditorState extends State<LineEditor> {
  late int? _hoodieId;
  int? _colorId;
  int? _sizeId;
  int? _packId;
  List<int> _stimpieIds = [];
  int? _stimpieId;
  Map<int, int> _offerCounts = {};
  int _qty = 1;

  OrderCatalog get _c => widget.catalog;
  bool get _editing => widget.initial != null;
  bool get _hasHoodie => widget.kind == LineKind.hoodie || widget.kind == LineKind.hoodieSet;

  @override
  void initState() {
    super.initState();
    _hoodieId = _c.hoodies.length == 1 ? _c.hoodies.first.id : null;
    final packs = widget.kind == LineKind.hoodieSet ? _c.hoodieSets : _c.stimpieOffers;
    if (widget.kind == LineKind.hoodieSet || widget.kind == LineKind.stimpiePack) {
      _packId = packs.length == 1 ? packs.first.id : null;
    }
    switch (widget.initial) {
      case HoodieLine l:
        _hoodieId = l.hoodieId;
        _colorId = l.colorId;
        _sizeId = l.sizeId;
        _qty = l.qty;
      case HoodieSetLine l:
        _packId = l.packId;
        _hoodieId = l.hoodieId;
        _colorId = l.colorId;
        _sizeId = l.sizeId;
        _stimpieIds = [...l.stimpieIds];
        _qty = l.qty;
      case StimpieLine l:
        _stimpieId = l.stimpieId;
        _qty = l.qty;
      case StimpiePackLine l:
        _packId = l.packId;
        _offerCounts = {...l.stimpies};
        _qty = l.qty;
      case null:
        break;
    }
  }

  OrderHoodie? get _hoodie => _hoodieId == null ? null : _c.hoodie(_hoodieId!);
  OrderPack? get _pack => _packId == null ? null : _c.pack(_packId!);

  /// The line as currently chosen; `problem()` says what is still missing (one source of truth with the model).
  OrderLine get _candidate => switch (widget.kind) {
        LineKind.hoodie => HoodieLine(hoodieId: _hoodieId ?? 0, colorId: _colorId ?? 0, sizeId: _sizeId ?? 0, qty: _qty),
        LineKind.hoodieSet => HoodieSetLine(
            packId: _packId ?? 0,
            hoodieId: _hoodieId ?? 0,
            colorId: _colorId ?? 0,
            sizeId: _sizeId ?? 0,
            stimpieIds: _stimpieIds,
            qty: _qty,
          ),
        LineKind.stimpie => StimpieLine(stimpieId: _stimpieId ?? 0, qty: _qty),
        LineKind.stimpiePack => StimpiePackLine(packId: _packId ?? 0, stimpies: _offerCounts, qty: _qty),
      };

  void _pickHoodie(int id) => setState(() {
        _hoodieId = id;
        _colorId = null;
        _sizeId = null;
      });

  void _pickColor(int id) => setState(() {
        _colorId = id;
        // Keep the size only if that colour still has it.
        final h = _hoodie;
        if (h != null && _sizeId != null && !h.available(id, _sizeId!)) _sizeId = null;
      });

  void _pickPack(int id) => setState(() {
        _packId = id;
        final n = _c.pack(id)?.stimpieCount ?? 0;
        if (widget.kind == LineKind.hoodieSet && _stimpieIds.length > n) _stimpieIds = _stimpieIds.take(n).toList();
        if (widget.kind == LineKind.stimpiePack) _offerCounts = {};
      });

  void _toggleSetStimpie(int id) => setState(() {
        final n = _pack?.stimpieCount ?? 1;
        if (_stimpieIds.contains(id)) {
          _stimpieIds = [..._stimpieIds]..remove(id);
        } else if (n == 1) {
          _stimpieIds = [id]; // a one-Stimpie set behaves like a radio button
        } else if (_stimpieIds.length < n) {
          _stimpieIds = [..._stimpieIds, id];
        }
      });

  void _setOfferCount(int id, int count) => setState(() {
        final next = {..._offerCounts};
        if (count <= 0) {
          next.remove(id);
        } else {
          next[id] = count;
        }
        _offerCounts = next;
      });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final line = _candidate;
    final problem = line.problem(_c);
    final total = line.lineTotalCents(_c);

    return Column(
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 8, 6),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: Brand.surface, borderRadius: Radii.mdAll),
                child: Icon(widget.kind.icon, size: 18, color: Brand.ink70),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(_editing ? 'Edit ${widget.kind.label.toLowerCase()}' : 'Add ${widget.kind.label.toLowerCase()}', style: text.titleLarge)),
              IconButton(tooltip: 'Close', icon: const Icon(LucideIcons.x, size: 22), onPressed: () => Navigator.of(context).pop()),
            ],
          ),
        ),
        const Divider(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
            children: [
              if (widget.kind == LineKind.hoodieSet || widget.kind == LineKind.stimpiePack) ..._packSection(text),
              if (_hasHoodie) ..._hoodieSection(text),
              if (widget.kind == LineKind.hoodieSet) ..._setStimpieSection(text),
              if (widget.kind == LineKind.stimpie) ..._singleStimpieSection(text),
              if (widget.kind == LineKind.stimpiePack) ..._offerStimpieSection(text),
              _label(text, widget.kind == LineKind.stimpiePack ? 'How many offers' : 'Quantity'),
              Align(alignment: Alignment.centerLeft, child: QtyStepper(value: _qty, onChanged: (v) => setState(() => _qty = v))),
            ],
          ),
        ),
        // Footer: what is missing, the line total and the action.
        DecoratedBox(
          decoration: const BoxDecoration(color: Brand.white, border: Border(top: BorderSide(color: Brand.line))),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (problem != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.info, size: 14, color: Brand.muted),
                          const SizedBox(width: 6),
                          Expanded(child: Text(problem, style: text.labelSmall)),
                        ],
                      ),
                    ),
                  Row(
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Line total', style: text.labelSmall),
                          Text(formatCents(total), style: text.titleMedium?.tabular),
                        ],
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: FilledButton(
                          onPressed: problem == null ? () => Navigator.of(context).pop(line) : null,
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                          child: Text(_editing ? 'Save changes' : 'Add to order'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------- sections

  Widget _label(TextTheme text, String label, {String? trailing}) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 10),
        child: Row(
          children: [
            Expanded(child: Text(label, style: text.titleSmall)),
            if (trailing != null) Text(trailing, style: text.labelSmall),
          ],
        ),
      );

  List<Widget> _packSection(TextTheme text) {
    final packs = widget.kind == LineKind.hoodieSet ? _c.hoodieSets : _c.stimpieOffers;
    return [
      Text(widget.kind == LineKind.hoodieSet ? 'Choose the set' : 'Choose the offer', style: text.titleSmall),
      const SizedBox(height: 10),
      for (final p in packs)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _PackOption(pack: p, selected: p.id == _packId, onTap: () => _pickPack(p.id)),
        ),
    ];
  }

  List<Widget> _hoodieSection(TextTheme text) {
    final hoodie = _hoodie;
    return [
      _label(text, 'Hoodie'),
      if (_c.hoodies.length > 1)
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final h in _c.hoodies) SelectChip(label: h.name, selected: h.id == _hoodieId, onTap: () => _pickHoodie(h.id)),
        ])
      else if (hoodie != null)
        Row(children: [
          SizedBox(width: 56, height: 70, child: NetImage(url: hoodie.imageUrl, icon: LucideIcons.shirt)),
          const SizedBox(width: 12),
          Expanded(child: Text(hoodie.name, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
          if (widget.kind == LineKind.hoodie) Text(formatCents(hoodie.priceCents), style: text.bodyMedium?.tabular),
        ]),
      if (hoodie != null) ...[
        _label(text, 'Colour', trailing: _colorId == null ? null : hoodie.colors.where((x) => x.id == _colorId).firstOrNull?.name),
        Wrap(spacing: 4, runSpacing: 4, children: [
          for (final color in hoodie.colors)
            ProductSwatch(
              name: color.name,
              color: color.color,
              selected: color.id == _colorId,
              enabled: hoodie.colorAvailable(color.id),
              onTap: () => _pickColor(color.id),
            ),
        ]),
        _label(text, 'Size'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final size in hoodie.sizes) _sizeChip(hoodie, size),
        ]),
      ],
    ];
  }

  Widget _sizeChip(OrderHoodie hoodie, OrderSize size) {
    final color = _colorId;
    final stock = color == null ? null : hoodie.variant(color, size.id);
    final enabled = color == null ? hoodie.colors.any((c) => hoodie.available(c.id, size.id)) : hoodie.available(color, size.id);
    final remaining = stock?.remaining;
    return SelectChip(
      label: size.label,
      selected: size.id == _sizeId,
      enabled: enabled,
      hint: enabled && remaining != null && remaining <= 5 ? '$remaining left' : null,
      onTap: () => setState(() => _sizeId = size.id),
    );
  }

  List<Widget> _setStimpieSection(TextTheme text) {
    final pack = _pack;
    final n = pack?.stimpieCount ?? 0;
    return [
      _label(text, 'Stimpies', trailing: pack == null ? null : '${_stimpieIds.length} of $n chosen'),
      if (pack == null)
        Text('Choose the set first.', style: text.bodySmall)
      else
        _stimpieGrid(
          builder: (s) => _StimpieTile(
            stimpie: s,
            selected: _stimpieIds.contains(s.id),
            enabled: pack.allows(s.id) && (_stimpieIds.contains(s.id) || _stimpieIds.length < n || n == 1),
            note: pack.allows(s.id) ? null : 'Not in this set',
            onTap: () => _toggleSetStimpie(s.id),
          ),
        ),
    ];
  }

  List<Widget> _singleStimpieSection(TextTheme text) => [
        _label(text, 'Stimpie'),
        _stimpieGrid(
          builder: (s) => _StimpieTile(stimpie: s, selected: s.id == _stimpieId, showPrice: true, onTap: () => setState(() => _stimpieId = s.id)),
        ),
      ];

  List<Widget> _offerStimpieSection(TextTheme text) {
    final pack = _pack;
    final n = pack?.stimpieCount ?? 0;
    final chosen = _offerCounts.values.fold(0, (a, b) => a + b);
    return [
      _label(text, 'Designs', trailing: pack == null ? null : '$chosen of $n chosen'),
      if (pack == null)
        Text('Choose the offer first.', style: text.bodySmall)
      else
        _stimpieGrid(
          builder: (s) {
            final count = _offerCounts[s.id] ?? 0;
            final allowed = pack.allows(s.id);
            return _StimpieTile(
              stimpie: s,
              selected: count > 0,
              enabled: allowed,
              note: allowed ? null : 'Not in this offer',
              count: count,
              maxCount: n - chosen + count,
              onCount: (v) => _setOfferCount(s.id, v),
              onTap: () => _setOfferCount(s.id, count > 0 ? 0 : (chosen < n ? 1 : 0)),
            );
          },
        ),
    ];
  }

  Widget _stimpieGrid({required Widget Function(OrderStimpie) builder}) {
    final list = _c.stimpies;
    if (list.isEmpty) {
      return Text('No Stimpies are on sale right now.', style: Theme.of(context).textTheme.bodySmall);
    }
    return LayoutBuilder(builder: (context, box) {
      const gap = 10.0;
      final columns = box.maxWidth >= 520 ? 4 : 3;
      final w = (box.maxWidth - gap * (columns - 1)) / columns;
      return Wrap(spacing: gap, runSpacing: gap, children: [
        for (final s in list) SizedBox(width: w, child: builder(s)),
      ]);
    });
  }
}

class _PackOption extends StatelessWidget {
  const _PackOption({required this.pack, required this.selected, required this.onTap});

  final OrderPack pack;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? Brand.actionTint : Brand.white,
        shape: RoundedRectangleBorder(
          borderRadius: Radii.lgAll,
          side: BorderSide(color: selected ? Brand.action : Brand.controlBorder, width: selected ? 2 : 1),
        ),
        child: InkWell(
          borderRadius: Radii.lgAll,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(selected ? LucideIcons.circleCheck : LucideIcons.circle, size: 20, color: selected ? Brand.action : Brand.lineStrong),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(pack.name, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                      const SizedBox(height: 2),
                      Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Text('${pack.stimpieCount} Stimpie${pack.stimpieCount == 1 ? '' : 's'}', style: text.labelSmall),
                        if (pack.badge != null) Pill(label: pack.badge!, tone: PillTone.coral),
                      ]),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(formatCents(pack.priceCents), style: text.titleSmall?.tabular),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StimpieTile extends StatelessWidget {
  const _StimpieTile({
    required this.stimpie,
    required this.selected,
    required this.onTap,
    this.enabled = true,
    this.note,
    this.showPrice = false,
    this.count,
    this.maxCount,
    this.onCount,
  });

  final OrderStimpie stimpie;
  final bool selected;
  final bool enabled;
  final String? note;
  final bool showPrice;
  final VoidCallback onTap;

  /// Offer mode: how many of this design, with a stepper once chosen.
  final int? count;
  final int? maxCount;
  final ValueChanged<int>? onCount;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final canOrder = stimpie.canOrder && enabled;
    final badge = stimpie.soldOut
        ? 'Sold out'
        : !stimpie.purchasable
            ? 'Not on sale'
            : (stimpie.status == 'LOW' && stimpie.remaining != null ? '${stimpie.remaining} left' : null);
    return Semantics(
      button: true,
      selected: selected,
      enabled: canOrder,
      label: '${stimpie.name}${badge == null ? '' : ', $badge'}',
      excludeSemantics: true,
      child: Opacity(
        opacity: canOrder ? 1 : 0.5,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: canOrder ? onTap : null,
              child: AspectRatio(
                aspectRatio: 16 / 25,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    NetImage(url: stimpie.imageUrl, radius: Radii.md, icon: LucideIcons.layers),
                    if (selected)
                      DecoratedBox(
                        decoration: BoxDecoration(border: Border.all(color: Brand.ink, width: 3), borderRadius: Radii.mdAll),
                      ),
                    if (selected)
                      const Positioned(
                        top: 6,
                        right: 6,
                        child: CircleAvatar(radius: 11, backgroundColor: Brand.ink, child: Icon(LucideIcons.check, size: 14, color: Brand.white)),
                      ),
                    if (badge != null) Positioned(left: 6, bottom: 6, child: Pill(label: badge, tone: stimpie.soldOut || !stimpie.purchasable ? PillTone.neutral : PillTone.butter)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(stimpie.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.labelMedium?.copyWith(color: Brand.ink, height: 1.25)),
            if (showPrice) Text(formatCents(stimpie.priceCents), style: text.labelSmall?.tabular),
            if (note != null) Text(note!, style: text.labelSmall),
            if (onCount != null && (count ?? 0) > 0) ...[
              const SizedBox(height: 6),
              Center(child: QtyStepper(value: count!, min: 0, max: maxCount ?? count!, compact: true, onChanged: onCount!)),
            ],
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/brand.dart';

/// A form field with its label above it, as on the dashboard's forms (13px Medium label, 6px gap, 6px-radius
/// input). Passwords get a show/hide toggle. Text is 16px so phones never zoom on focus.
///
/// `errorText` shows a message from the server (e.g. `fields['customer.phone']`) until the user edits the field.
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.helper,
    this.obscure = false,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.validator,
    this.onSubmitted,
    this.onChanged,
    this.inputFormatters,
    this.errorText,
    this.enabled = true,
    this.autofocus = false,
    this.minLines,
    this.maxLines = 1,
    this.optional = false,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final String? helper;
  final bool obscure;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;
  final String? errorText;
  final bool enabled;
  final bool autofocus;
  final int? minLines;
  final int maxLines;

  /// Adds a quiet "Optional" next to the label.
  final bool optional;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late bool _hidden = widget.obscure;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: widget.label,
            children: [
              if (widget.optional) TextSpan(text: '  Optional', style: text.labelSmall),
            ],
          ),
          style: text.labelLarge,
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: widget.controller,
          obscureText: _hidden,
          enabled: widget.enabled,
          autofocus: widget.autofocus,
          keyboardType: widget.keyboardType,
          textInputAction: widget.textInputAction,
          textCapitalization: widget.textCapitalization,
          autofillHints: widget.autofillHints,
          validator: widget.validator,
          onFieldSubmitted: widget.onSubmitted,
          onChanged: widget.onChanged,
          inputFormatters: widget.inputFormatters,
          forceErrorText: widget.errorText,
          minLines: widget.obscure ? 1 : widget.minLines,
          maxLines: widget.obscure ? 1 : widget.maxLines,
          style: text.bodyLarge,
          decoration: InputDecoration(
            hintText: widget.hint,
            helperText: widget.helper,
            helperStyle: text.labelSmall,
            helperMaxLines: 2,
            suffixIcon: widget.obscure
                ? IconButton(
                    tooltip: _hidden ? 'Show password' : 'Hide password',
                    icon: Icon(_hidden ? LucideIcons.eye : LucideIcons.eyeOff, size: 20, color: Brand.ink55),
                    onPressed: () => setState(() => _hidden = !_hidden),
                  )
                : null,
          ),
        ),
      ],
    );
  }
}

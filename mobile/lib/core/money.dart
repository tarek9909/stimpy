import 'package:intl/intl.dart';

/// Money is integer cents everywhere (as in the API). Display as US dollars with two decimals, like the dashboard
/// (`formatCents(x, { fixed: true })`).
final NumberFormat _usd = NumberFormat.currency(locale: 'en_US', symbol: r'$', decimalDigits: 2);

String formatCents(int cents) => _usd.format(cents / 100);

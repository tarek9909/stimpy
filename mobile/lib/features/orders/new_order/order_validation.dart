import 'order_catalog.dart';
import 'order_line.dart';

/// Checks the form before it is sent, with the same rules and wording as the web form
/// (website/frontend/admin/src/pages/orders/NewOrder.tsx `makeSchema`). Returns field key to message.
///
/// Keys: name, phone, whatsapp, email, areaName, address, notes, items. The phone *format* is checked by the server
/// (Lebanese numbers) and comes back through [mapServerFields].
Map<String, String> validateOrderForm({
  required String name,
  required String phone,
  required bool whatsappSame,
  required String whatsapp,
  required String email,
  required String areaName,
  required String address,
  required String notes,
  required List<OrderLine> lines,
  required OrderCatalog catalog,
}) {
  final errors = <String, String>{};
  final n = name.trim();
  if (n.length < 2) {
    errors['name'] = "Enter the customer's name (at least 2 characters).";
  } else if (n.length > 80) {
    errors['name'] = 'Use at most 80 characters.';
  }

  final p = phone.trim();
  if (p.isEmpty) {
    errors['phone'] = 'Enter a phone number.';
  } else if (p.length > 40) {
    errors['phone'] = 'That number is too long.';
  }

  if (!whatsappSame) {
    final w = whatsapp.trim();
    if (w.isEmpty) {
      errors['whatsapp'] = 'Enter a WhatsApp number or turn on "Same as the phone".';
    } else if (w.length > 40) {
      errors['whatsapp'] = 'That number is too long.';
    }
  }

  final e = email.trim();
  if (e.isNotEmpty && (!_looksLikeEmail(e) || e.length > 190)) {
    errors['email'] = 'Enter a valid email address.';
  }

  final area = areaName.trim();
  if (area.isEmpty) {
    errors['areaName'] = 'Enter the area.';
  } else if (area.length > 120) {
    errors['areaName'] = 'Use at most 120 characters.';
  }

  final a = address.trim();
  if (a.length < 5) {
    errors['address'] = 'Enter the full address (at least 5 characters).';
  } else if (a.length > 300) {
    errors['address'] = 'Use at most 300 characters.';
  }

  if (notes.trim().length > 300) errors['notes'] = 'Use at most 300 characters.';

  if (lines.isEmpty) {
    errors['items'] = 'Add at least one item.';
  } else if (lines.length > 20) {
    errors['items'] = 'An order can have at most 20 items.';
  } else {
    for (var i = 0; i < lines.length; i++) {
      final problem = lines[i].problem(catalog);
      if (problem != null) {
        errors['items'] = 'Item ${i + 1}: $problem';
        break;
      }
    }
  }
  return errors;
}

bool _looksLikeEmail(String v) => RegExp(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$").hasMatch(v);

/// The API names inputs by request path (`customer.phone`); the form names them by field key.
const Map<String, String> _serverFieldKeys = {
  'customer.name': 'name',
  'customer.phone': 'phone',
  'customer.whatsapp': 'whatsapp',
  'customer.email': 'email',
  'delivery.areaName': 'areaName',
  'delivery.address': 'address',
  'delivery.notes': 'notes',
};

class MappedServerFields {
  const MappedServerFields(this.fieldErrors, this.leftovers);

  /// Messages for fields on the form.
  final Map<String, String> fieldErrors;

  /// Messages for anything the form has no field for (shown in the banner so nothing is silently lost).
  final List<String> leftovers;
}

MappedServerFields mapServerFields(Map<String, String> fields) {
  final mapped = <String, String>{};
  final leftovers = <String>[];
  for (final e in fields.entries) {
    final key = _serverFieldKeys[e.key] ?? (e.key == 'items' || e.key.startsWith('items.') ? 'items' : null);
    if (key == null) {
      leftovers.add(e.value);
    } else {
      mapped.putIfAbsent(key, () => e.value);
    }
  }
  return MappedServerFields(mapped, leftovers);
}

const Map<String, String> _notPurchasableReason = {
  'INACTIVE': 'Hidden',
  'DROP_NOT_STARTED': "Drop hasn't started",
  'DROP_ENDED': 'Drop has ended',
};

/// SOLD_OUT / NOT_PURCHASABLE come with `details.items`: one entry per problem with the cart `itemIndex`.
/// Returns line index to a readable sentence (several problems on one line are joined).
Map<int, String> describeStockProblems(String code, List<dynamic> raw) {
  final byIndex = <int, List<String>>{};
  for (final entry in raw) {
    if (entry is! Map) continue;
    final index = entry['itemIndex'] is int ? entry['itemIndex'] as int : -1;
    final name = entry['name'] is String ? entry['name'] as String : 'Item';
    final text = code == 'SOLD_OUT'
        ? 'requested ${entry['requested']}, available ${entry['available']}'
        : (_notPurchasableReason[entry['reason']] ?? 'Not available');
    byIndex.putIfAbsent(index, () => []).add('$name: $text');
  }
  return {for (final e in byIndex.entries) e.key: e.value.join('; ')};
}

/// The `POST /admin/orders` body for a manual order (website/backend/src/modules/orders/schemas.ts `manualOrderBody`).
/// One place builds it, so the screen and the tests send exactly the same thing. Optional parts are left out
/// rather than sent empty, like the web form.
Map<String, dynamic> buildOrderBody({
  required String source,
  required String initialStatus,
  required bool sendEmail,
  required String name,
  required String phone,
  required bool whatsappSame,
  required String whatsapp,
  required String email,
  required int? areaId,
  required String areaName,
  required String address,
  required String notes,
  required List<OrderLine> lines,
}) {
  final mail = email.trim();
  final note = notes.trim();
  return {
    'source': source,
    'initialStatus': initialStatus,
    'sendEmail': mail.isNotEmpty && sendEmail,
    'customer': {
      'name': name.trim(),
      'phone': phone.trim(),
      'whatsappSameAsPhone': whatsappSame,
      if (!whatsappSame) 'whatsapp': whatsapp.trim(),
      if (mail.isNotEmpty) 'email': mail,
    },
    'delivery': {
      'areaId': ?areaId,
      'areaName': areaName.trim(),
      'address': address.trim(),
      if (note.isNotEmpty) 'notes': note,
    },
    'items': [for (final l in lines) l.toJson()],
  };
}

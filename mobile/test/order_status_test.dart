import 'package:flutter_test/flutter_test.dart';
import 'package:stimpy_admin/core/order_status.dart';
import 'package:stimpy_admin/ui/pill.dart';

void main() {
  group('OrderStatus matches the dashboard spec (design-system 2.3)', () {
    test('every status keeps its colour, label and API value', () {
      expect(OrderStatus.values.length, 7);
      final expected = <String, (String, PillTone)>{
        'NEW': ('New', PillTone.coral),
        'CONFIRMED': ('Confirmed', PillTone.blue),
        'PACKED': ('Packed', PillTone.butter),
        'OUT_FOR_DELIVERY': ('Out for delivery', PillTone.sky),
        'DELIVERED': ('Delivered', PillTone.success),
        'CANCELLED': ('Cancelled', PillTone.neutral),
        'RETURNED': ('Returned', PillTone.danger),
      };
      for (final entry in expected.entries) {
        final status = OrderStatus.fromApi(entry.key);
        expect(status.apiValue, entry.key);
        expect(status.label, entry.value.$1, reason: entry.key);
        expect(status.tone, entry.value.$2, reason: entry.key);
      }
    });

    test('unknown or missing values fall back to New, like the web', () {
      expect(OrderStatus.fromApi('SOMETHING_NEW'), OrderStatus.newOrder);
      expect(OrderStatus.fromApi(null), OrderStatus.newOrder);
    });
  });
}

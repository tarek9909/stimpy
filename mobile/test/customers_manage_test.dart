import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stimpy_admin/core/api_error.dart';
import 'package:stimpy_admin/features/customers/customer_detail_screen.dart';
import 'package:stimpy_admin/features/customers/follow_ups.dart';

import 'customers_test.dart' show app, customersApi, phone;
import 'support/fixtures.dart';

// Editing a customer, tags and follow-ups: PATCH /admin/customers/:id, /admin/customer-tags,
// /admin/customers/:id/tags/:tagId and /admin/follow-ups.

Map<String, dynamic> tagJson(int id, String name, [String? color]) =>
    {'id': id, 'name': name, 'color': color, 'createdAt': '2026-09-01T00:00:00.000Z', 'updatedAt': '2026-09-01T00:00:00.000Z'};

Map<String, dynamic> followUpJson(int id, String note, {String due = '2026-11-10T07:00:00.000Z', bool done = false, int customerId = 3, String name = 'Rana Haddad'}) => {
      'id': id,
      'customerId': customerId,
      'customerName': name,
      'userId': 1,
      'userName': 'Owner',
      'dueAt': due,
      'note': note,
      'doneAt': done ? '2026-11-04T09:00:00.000Z' : null,
      'createdAt': '2026-11-03T09:00:00.000Z',
      'updatedAt': '2026-11-03T09:00:00.000Z',
    };

/// Open follow-ups are served per `due` filter; the customer sees the ones in [upcoming].
FakeApi manageApi({List<Map<String, dynamic>> upcoming = const [], Map<String, Object? Function(Map<String, dynamic>? query, Object? body)>? more}) => customersApi(more: {
      'GET /admin/follow-ups': (q, _) => pageJson(q?['due'] == 'upcoming' ? upcoming : <Map<String, dynamic>>[], pageSize: 100),
      'GET /admin/customer-tags': (_, _) => pageJson([tagJson(1, 'VIP', '#FF7A59'), tagJson(2, 'Wholesale')]),
      ...?more,
    });

Future<void> openDetail(WidgetTester tester, FakeApi api) async {
  phone(tester);
  await tester.pumpWidget(app(api, const CustomerDetailScreen(customerId: 3), []));
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder f) async {
  await tester.dragUntilVisible(f, find.byType(Scrollable).first, const Offset(0, -200));
}

final sheetField = find.descendant(of: find.byType(FollowUpSheet), matching: find.byType(TextFormField));

void main() {
  group('Edit customer', () {
    testWidgets('sends only the changed fields and reloads the profile', (tester) async {
      final api = manageApi(more: {'PATCH /admin/customers/3': (_, _) => <String, dynamic>{}});
      await openDetail(tester, api);

      await tester.tap(find.byTooltip('Edit customer'));
      await tester.pumpAndSettle();
      expect(find.text('Edit customer'), findsOneWidget);

      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), '  Rana H. Haddad ');
      await tester.enterText(fields.at(1), ''); // clearing the email sends null
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(api.where('PATCH', '/admin/customers/3').single.body, {'name': 'Rana H. Haddad', 'email': null});
      expect(find.text('Edit customer'), findsNothing);
      expect(find.text('Customer updated.'), findsOneWidget);
      expect(api.where('GET', '/admin/customers/3/profile').length, 2);
    });

    testWidgets('shows the server\'s field errors under the inputs and keeps the form open', (tester) async {
      final api = manageApi(more: {
        'PATCH /admin/customers/3': (_, _) => throw ApiError(
              'Please check the form.',
              statusCode: 400,
              code: 'VALIDATION_FAILED',
              fields: {'whatsapp': 'Enter a Lebanese phone number, e.g. 03 123 456.'},
            ),
      });
      await openDetail(tester, api);
      await tester.tap(find.byTooltip('Edit customer'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).at(2), '12');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(find.text('Enter a Lebanese phone number, e.g. 03 123 456.'), findsOneWidget);
      expect(find.text('Please check the highlighted fields.'), findsOneWidget);
      expect(find.text('Edit customer'), findsOneWidget);

      // Typing in the field clears its error.
      await tester.enterText(find.byType(TextFormField).at(2), '03 123 456');
      await tester.pumpAndSettle();
      expect(find.text('Enter a Lebanese phone number, e.g. 03 123 456.'), findsNothing);
    });

    testWidgets('checks the obvious rules before calling the server', (tester) async {
      final api = manageApi();
      await openDetail(tester, api);
      await tester.tap(find.byTooltip('Edit customer'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).at(0), 'A');
      await tester.enterText(find.byType(TextFormField).at(1), 'not-an-email');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(find.text('Enter at least 2 characters.'), findsOneWidget);
      expect(find.text('Enter a valid email address.'), findsOneWidget);
      expect(api.where('PATCH', '/admin/customers/3'), isEmpty);
    });
  });

  group('Customer tags', () {
    testWidgets('attaches a tag from the picker and detaches it again', (tester) async {
      final api = manageApi(more: {
        'POST /admin/customers/3/tags/2': (_, _) => {
              'items': [tagJson(1, 'VIP', '#FF7A59'), tagJson(2, 'Wholesale')],
            },
        'DELETE /admin/customers/3/tags/2': (_, _) => <String, dynamic>{},
      });
      await openDetail(tester, api);

      await tester.tap(find.text('Add tag'));
      await tester.pumpAndSettle();
      expect(api.where('GET', '/admin/customer-tags'), hasLength(1));
      // VIP is already attached, so only Wholesale is offered.
      expect(find.text('Wholesale'), findsOneWidget);
      expect(find.text('VIP'), findsOneWidget);

      await tester.tap(find.text('Wholesale'));
      await tester.pumpAndSettle();
      expect(api.where('POST', '/admin/customers/3/tags/2'), hasLength(1));
      expect(find.text('Wholesale'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel('Remove tag Wholesale'));
      await tester.pumpAndSettle();
      expect(api.where('DELETE', '/admin/customers/3/tags/2'), hasLength(1));
      expect(find.text('Wholesale'), findsNothing);
      expect(find.text('VIP'), findsOneWidget);
    });

    testWidgets('a refused attach shows the message and leaves the tags alone', (tester) async {
      final api = manageApi(more: {'POST /admin/customers/3/tags/2': (_, _) => throw ApiError('Tag not found.', statusCode: 404)});
      await openDetail(tester, api);
      await tester.tap(find.text('Add tag'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Wholesale'));
      await tester.pumpAndSettle();
      expect(find.text('Tag not found.'), findsOneWidget);
      expect(find.text('Wholesale'), findsNothing);
    });
  });

  group('Follow-ups', () {
    testWidgets('creates one from the customer with a due date and a note', (tester) async {
      var created = false;
      final api = manageApi(more: {
        'GET /admin/follow-ups': (q, _) => pageJson(created && q?['due'] == 'upcoming' ? [followUpJson(9, 'Ask how the hoodie fits')] : <Map<String, dynamic>>[], pageSize: 100),
        'POST /admin/follow-ups': (_, body) {
          created = true;
          return followUpJson(9, (body as Map)['note'] as String);
        },
      });
      await openDetail(tester, api);

      await reveal(tester, find.text('Add follow-up'));
      expect(find.text('No open follow-ups.'), findsOneWidget);
      await tester.tap(find.text('Add follow-up'));
      await tester.pumpAndSettle();
      expect(find.text('New follow-up'), findsOneWidget);

      // An empty note is refused locally.
      await tester.tap(find.widgetWithText(FilledButton, 'Add follow-up'));
      await tester.pump();
      expect(find.text('Write what to follow up on.'), findsOneWidget);
      expect(api.where('POST', '/admin/follow-ups'), isEmpty);

      await tester.enterText(sheetField, '  Ask how the hoodie fits ');
      await tester.tap(find.widgetWithText(FilledButton, 'Add follow-up'));
      await tester.pumpAndSettle();

      final body = api.where('POST', '/admin/follow-ups').single.body! as Map;
      expect(body['customerId'], 3);
      expect(body['note'], 'Ask how the hoodie fits');
      final due = DateTime.parse(body['dueAt'] as String);
      expect(due.isUtc, isTrue);
      expect(due.toLocal().hour, 9);
      expect(due.toLocal().isAfter(DateTime.now()), isTrue); // defaults to tomorrow
      expect(find.text('Follow-up added.'), findsOneWidget);
      expect(find.text('Ask how the hoodie fits'), findsOneWidget);
      expect(find.text('No open follow-ups.'), findsNothing);
    });

    testWidgets('marks a follow-up done and it leaves the open list', (tester) async {
      var done = false;
      final api = manageApi(more: {
        'GET /admin/follow-ups': (q, _) => pageJson(!done && q?['due'] == 'upcoming' ? [followUpJson(9, 'Call about the exchange')] : <Map<String, dynamic>>[], pageSize: 100),
        'PATCH /admin/follow-ups/9': (_, _) {
          done = true;
          return followUpJson(9, 'Call about the exchange', done: true);
        },
      });
      await openDetail(tester, api);

      await reveal(tester, find.text('Call about the exchange'));
      await tester.tap(find.byTooltip('Mark done'));
      await tester.pumpAndSettle();

      expect(api.where('PATCH', '/admin/follow-ups/9').single.body, {'done': true});
      expect(find.text('Marked done.'), findsOneWidget);
      expect(find.text('Call about the exchange'), findsNothing);
    });

    testWidgets('edits the note and deletes after confirming', (tester) async {
      var deleted = false;
      final api = manageApi(more: {
        'GET /admin/follow-ups': (q, _) => pageJson(!deleted && q?['due'] == 'upcoming' ? [followUpJson(9, 'Call about the exchange')] : <Map<String, dynamic>>[], pageSize: 100),
        'PATCH /admin/follow-ups/9': (_, body) => followUpJson(9, (body as Map)['note'] as String),
        'DELETE /admin/follow-ups/9': (_, _) {
          deleted = true;
          return <String, dynamic>{};
        },
      });
      await openDetail(tester, api);

      await reveal(tester, find.text('Call about the exchange'));
      await tester.tap(find.text('Call about the exchange'));
      await tester.pumpAndSettle();
      expect(find.text('Edit follow-up'), findsOneWidget);
      await tester.enterText(sheetField, 'Call about the size swap');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      // Only the changed field is sent (the day did not change).
      expect(api.where('PATCH', '/admin/follow-ups/9').single.body, {'note': 'Call about the size swap'});

      await reveal(tester, find.byTooltip('Delete follow-up'));
      await tester.tap(find.byTooltip('Delete follow-up'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Keep it'));
      await tester.pumpAndSettle();
      expect(api.where('DELETE', '/admin/follow-ups/9'), isEmpty);

      await tester.tap(find.byTooltip('Delete follow-up'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(api.where('DELETE', '/admin/follow-ups/9'), hasLength(1));
      expect(find.text('Follow-up deleted.'), findsOneWidget);
    });

    testWidgets('the Follow-ups screen lists by due filter and completes one', (tester) async {
      phone(tester);
      var done = false;
      final api = FakeApi(handlers: {
        'GET /admin/follow-ups': (q, _) {
          final due = q?['due'];
          if (due == 'today' && !done) return pageJson([followUpJson(5, 'Send the sizing chart', name: 'Omar Khoury', customerId: 4)]);
          if (due == 'overdue') return pageJson([followUpJson(6, 'Chase payment', due: '2020-01-01T09:00:00.000Z')]);
          return pageJson(<Map<String, dynamic>>[]);
        },
        'PATCH /admin/follow-ups/5': (_, _) {
          done = true;
          return followUpJson(5, 'Send the sizing chart', done: true);
        },
      });
      await tester.pumpWidget(app(api, const FollowUpsScreen(), []));
      await tester.pumpAndSettle();

      expect(api.where('GET', '/admin/follow-ups').first.query, containsPair('due', 'today'));
      expect(find.text('Omar Khoury'), findsOneWidget);
      await tester.tap(find.byTooltip('Mark done'));
      await tester.pumpAndSettle();
      expect(api.where('PATCH', '/admin/follow-ups/5').single.body, {'done': true});
      expect(find.text('No today follow-ups'), findsOneWidget);

      await tester.tap(find.text('Overdue'));
      await tester.pumpAndSettle();
      expect(api.where('GET', '/admin/follow-ups').last.query, containsPair('due', 'overdue'));
      expect(find.text('Chase payment'), findsOneWidget);
      expect(find.textContaining('Overdue · '), findsOneWidget);
    });
  });
}

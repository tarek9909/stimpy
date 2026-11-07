import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/providers.dart';
import 'customer_models.dart';

/// The customer endpoints the app uses, the same ones as the web dashboard
/// (website/frontend/admin/src/pages/customers/api.ts), under `/admin`.
class CustomersApi {
  CustomersApi(this._api);
  final ApiClient _api;

  /// `GET /admin/customers`. Without [sort] the server orders by last order, newest first.
  Future<CustomerPage> list({String? q, int page = 1, int pageSize = 25, String? sort}) async {
    final res = await _api.getJson('/admin/customers', query: {
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      'sort': ?sort,
      'page': page,
      'pageSize': pageSize,
    });
    return CustomerPage.fromJson(res);
  }

  Future<CustomerProfile> profile(int id) async => CustomerProfile.fromJson(await _api.getJson('/admin/customers/$id/profile'));

  Future<TimelinePage> timeline(int id, {String? cursor, int limit = 20}) async =>
      TimelinePage.fromJson(await _api.getJson('/admin/customers/$id/timeline', query: {'limit': limit, 'cursor': ?cursor}));

  /// `GET /admin/customers/:id/tags` answers with a bare array (ApiClient hands it back as `items`).
  Future<List<CustomerTag>> tags(int id) async {
    final res = await _api.getJson('/admin/customers/$id/tags');
    return [for (final t in (res['items'] as List? ?? const [])) if (t is Map) CustomerTag.fromJson(t.cast<String, dynamic>())];
  }

  /// Newest first.
  Future<CustomerNotePage> notes(int id, {int page = 1, int pageSize = 25}) async =>
      CustomerNotePage.fromJson(await _api.getJson('/admin/customers/$id/notes', query: {'page': page, 'pageSize': pageSize}));

  Future<CustomerNote> addNote(int id, String body) async =>
      CustomerNote.fromJson(await _api.postJson('/admin/customers/$id/notes', body: {'body': body.trim()}));

  /// `PATCH /admin/customers/:id`. Send only changed fields: `name`, `email` (null clears), `whatsapp`, `notes`
  /// (null clears), `marketingOptOut`, `emailConsent`, `whatsappConsent`. The phone cannot change. The server
  /// refuses unknown keys (strict body) and answers a 400 with `fields` for bad values.
  Future<void> update(int id, Map<String, Object?> changes) => _api.patchJson('/admin/customers/$id', body: changes);

  /// `GET /admin/customer-tags`: every tag that exists (the server allows up to 100 per page).
  Future<List<CustomerTag>> allTags() async {
    final res = await _api.getJson('/admin/customer-tags', query: {'page': 1, 'pageSize': 100});
    return [for (final t in (res['items'] as List? ?? const [])) if (t is Map) CustomerTag.fromJson(t.cast<String, dynamic>())];
  }

  /// `POST /admin/customers/:id/tags/:tagId` (idempotent). Answers with the customer's tags after the change.
  Future<List<CustomerTag>> attachTag(int id, int tagId) async {
    final res = await _api.postJson('/admin/customers/$id/tags/$tagId');
    return [for (final t in (res['items'] as List? ?? const [])) if (t is Map) CustomerTag.fromJson(t.cast<String, dynamic>())];
  }

  /// `DELETE /admin/customers/:id/tags/:tagId` (204).
  Future<void> detachTag(int id, int tagId) => _api.deleteJson('/admin/customers/$id/tags/$tagId');

  /// `GET /admin/follow-ups`: open follow-ups only. [due] is `overdue`, `today` or `upcoming` (the server's default),
  /// judged in the business timezone. Oldest due first.
  Future<FollowUpPage> followUps({String due = 'upcoming', int? customerId, int page = 1, int pageSize = 25}) async =>
      FollowUpPage.fromJson(await _api.getJson('/admin/follow-ups', query: {
        'due': due,
        'customerId': ?customerId,
        'page': page,
        'pageSize': pageSize,
      }));

  /// All open follow-ups of one customer (overdue, today and upcoming), soonest first.
  Future<List<FollowUp>> openFollowUps(int customerId) async {
    final pages = await Future.wait([for (final d in const ['overdue', 'today', 'upcoming']) followUps(due: d, customerId: customerId, pageSize: 100)]);
    return [for (final p in pages) ...p.items]..sort((a, b) => (a.dueAt ?? DateTime(0)).compareTo(b.dueAt ?? DateTime(0)));
  }

  /// `POST /admin/follow-ups`. [dueAt] is sent as an absolute UTC time.
  Future<FollowUp> createFollowUp({required int customerId, required DateTime dueAt, required String note}) async =>
      FollowUp.fromJson(await _api.postJson('/admin/follow-ups', body: {'customerId': customerId, 'dueAt': dueAt.toUtc().toIso8601String(), 'note': note.trim()}));

  /// `PATCH /admin/follow-ups/:id` with any of `dueAt`, `note`, `done` (done: false reopens).
  Future<FollowUp> updateFollowUp(int id, {DateTime? dueAt, String? note, bool? done}) async =>
      FollowUp.fromJson(await _api.patchJson('/admin/follow-ups/$id', body: {
        if (dueAt != null) 'dueAt': dueAt.toUtc().toIso8601String(),
        if (note != null) 'note': note.trim(),
        'done': ?done,
      }));

  /// `DELETE /admin/follow-ups/:id` (204).
  Future<void> deleteFollowUp(int id) => _api.deleteJson('/admin/follow-ups/$id');
}

final customersApiProvider = Provider<CustomersApi>((ref) => CustomersApi(ref.watch(apiClientProvider)));

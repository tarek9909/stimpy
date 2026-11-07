import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/providers.dart';
import '../../orders/data/orders_api.dart';
import 'overview_models.dart';

/// The dashboard overview, over the same endpoint as the web (`GET /admin/overview`, no parameters: the web shows
/// a fixed last-7-days window, so there is no range to choose).
class OverviewApi {
  OverviewApi(this._api);
  final ApiClient _api;

  Future<Overview> fetch() async => Overview.fromJson(await _api.getJson('/admin/overview'));
}

final overviewApiProvider = Provider<OverviewApi>((ref) => OverviewApi(ref.watch(apiClientProvider)));

/// No automatic retries: the screen has a Try again button. Reloads whenever an order is created or changed (the orders version), and on pull to refresh.
final overviewProvider = FutureProvider.autoDispose<Overview>(retry: (_, _) => null, (ref) {
  ref.watch(ordersVersionProvider);
  return ref.watch(overviewApiProvider).fetch();
});

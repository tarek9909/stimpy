/// A failed API call, with the server's message and, when it sent them, the per-field messages and details.
///
/// The API's error body is `{ error: { code, message, fields, details, requestId } }`:
///  - `fields` maps a request path such as `customer.phone` to a message for that input;
///  - `details` carries structured data, e.g. `details.items` for SOLD_OUT / NOT_PURCHASABLE.
class ApiError implements Exception {
  ApiError(
    this.message, {
    this.statusCode,
    this.code,
    this.retryAfterSeconds,
    this.fields = const {},
    this.details,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final int? retryAfterSeconds;
  final Map<String, String> fields;
  final Map<String, dynamic>? details;

  bool get isUnauthenticated => statusCode == 401;

  @override
  String toString() => message;
}

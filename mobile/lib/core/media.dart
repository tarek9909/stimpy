import 'config.dart';

/// Image and upload URLs are stored as absolute URLs built from the API's `API_PUBLIC_URL` at the time of seeding or
/// uploading. During development that is `http://localhost:4000`, which a phone cannot open (localhost is the phone
/// itself). This rewrites loopback hosts to the API host the app is configured with, so pictures load on the phone.
/// Real hosts are left untouched.
String? resolveMediaUrl(String? url, {String? apiBase}) {
  if (url == null || url.isEmpty) return null;
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.hasAuthority) return url;
  const loopback = {'localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0'};
  if (!loopback.contains(uri.host)) return url;
  final api = Uri.parse(apiBase ?? apiBaseUrl);
  return uri.replace(scheme: api.scheme, host: api.host, port: api.hasPort ? api.port : null).toString();
}

import 'package:url_launcher/url_launcher.dart';

/// Opens a link in the phone's own app (dialler, WhatsApp, browser). Returns false when nothing could handle it.
Future<bool> openExternal(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}

/// `tel:` link for a phone number as stored (digits, spaces and a leading + are kept).
Uri telUri(String phone) => Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[^\d+]'), ''));

/// A plain `wa.me` chat link (no prefilled text) for when there is no ready-made message.
Uri whatsappChatUri(String number) => Uri.parse('https://wa.me/${number.replaceAll(RegExp(r'\D'), '')}');

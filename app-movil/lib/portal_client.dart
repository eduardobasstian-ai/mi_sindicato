import 'dart:convert';
import 'package:http/http.dart' as http;

const portalUrl = 'https://eyucrgaszheehdklnivx.supabase.co';
const publishableKey = 'sb_publishable_xgRp7Y94c5ak3X0jljNGgA_adsw-PFu';
const webUrl = String.fromEnvironment(
  'MI_SINDICATO_WEB_URL',
  defaultValue: 'https://eduardobasstian-ai.github.io/mi_sindicato/',
);

class PortalException implements Exception {
  const PortalException(this.message, {this.unauthorized = false});
  final String message;
  final bool unauthorized;
  @override
  String toString() => message;
}

class PortalClient {
  PortalClient({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;
  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body, {
    String? token,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$portalUrl/$path'),
          headers: {
            'apikey': publishableKey,
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${token ?? publishableKey}',
          },
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 20));
    final data = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw PortalException(
        data['error_description']?.toString() ??
            data['message']?.toString() ??
            data['error']?.toString() ??
            'No se pudo completar la operación.',
        unauthorized: response.statusCode == 401 || response.statusCode == 403,
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> login(String rut, String password) async {
    final session = await _post('functions/v1/portal', {
      'route': 'login',
      'input': {'username': rut.trim(), 'password': password},
    });
    try {
      await validate(session);
    } catch (_) {
      await logout(session);
      rethrow;
    }
    return session;
  }

  Future<Map<String, dynamic>> restore(
    Map<String, dynamic> saved, {
    Future<void> Function(Map<String, dynamic>)? onRefresh,
  }) async {
    var session = saved;
    if (((session['expires_at'] as num?)?.toInt() ?? 0) <=
        DateTime.now().millisecondsSinceEpoch ~/ 1000 + 60) {
      session = await _post('auth/v1/token?grant_type=refresh_token', {
        'refresh_token': session['refresh_token'],
      });
      await onRefresh?.call(session);
    }
    await validate(session);
    return session;
  }

  Future<void> validate(Map<String, dynamic> session) async {
    final panel = await _post('functions/v1/portal', {
      'route': 'panel',
      'input': <String, dynamic>{'memberView': true},
    }, token: session['access_token'] as String);
    if (panel['general'] == true ||
        panel['noMembership'] == true ||
        (panel['temporaryPassword'] != true && panel['active'] == null)) {
      throw const PortalException(
        'Necesitas una cuenta de socio con afiliación activa. Consulta a Presidencia.',
        unauthorized: true,
      );
    }
  }

  Future<void> logout(Map<String, dynamic>? session) async {
    if (session == null) return;
    try {
      await _post(
        'auth/v1/logout?scope=local',
        {},
        token: session['access_token'] as String?,
      );
    } catch (_) {
      /* Local credentials are erased even without a connection. */
    }
  }

  void close() => _client.close();
}

bool isMemberPage(Uri uri, Uri base) {
  if (uri.scheme != 'https' ||
      uri.origin != base.origin ||
      !uri.path.startsWith(base.path)) {
    return false;
  }
  final relative = uri.path.substring(base.path.length);
  return {'app-entry.html', 'sindicato-panel.html'}.contains(relative) &&
      uri.queryParameters['app'] == 'socio' &&
      !uri.queryParameters.containsKey('mode');
}

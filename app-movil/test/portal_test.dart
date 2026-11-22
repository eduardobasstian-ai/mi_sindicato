import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mi_sindicato/portal_client.dart';

void main() {
  final base = Uri.parse(webUrl);
  test('Only member pages on the exact HTTPS project are admitted', () {
    expect(
      isMemberPage(base.resolve('sindicato-panel.html?app=socio'), base),
      true,
    );
    expect(isMemberPage(base.resolve('app-entry.html?app=socio'), base), true);
    for (final path in [
      'sindicato-panel.html?mode=admin',
      'sindicato-panel.html?app=socio&mode=admin',
      '../smartfit-mantenimiento/index.html',
      'index.html',
      'sindicato-panel.html',
    ]) {
      expect(isMemberPage(base.resolve(path), base), false, reason: path);
    }
    expect(
      isMemberPage(
        Uri.parse('https://example.org/sindicato-panel.html?app=socio'),
        base,
      ),
      false,
    );
    expect(
      isMemberPage(
        Uri.parse(
          'http://${base.host}${base.path}sindicato-panel.html?app=socio',
        ),
        base,
      ),
      false,
    );
  });
  test('President account logs in through membership endpoint', () async {
    final requests = <Map<String, dynamic>>[];
    final api = PortalClient(
      client: MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        requests.add(body);
        return http.Response(
          jsonEncode(
            body['route'] == 'login'
                ? {
                    'access_token': 'test',
                    'refresh_token': 'refresh',
                    'user': {'id': 'president'},
                  }
                : {
                    'active': {'role': 'Presidente'},
                  },
          ),
          200,
        );
      }),
    );
    final session = await api.login('12345678', 'example');
    expect(session['user']['id'], 'president');
    expect(requests.map((r) => r['route']), ['login', 'panel']);
    api.close();
  });
  test(
    'General-admin and missing membership are rejected and session revoked locally',
    () async {
      for (final panel in [
        {'general': true},
        {'noMembership': true},
      ]) {
        var revoked = false;
        final api = PortalClient(
          client: MockClient((request) async {
            if (request.url.path.endsWith('/logout')) {
              revoked = request.url.queryParameters['scope'] == 'local';
              return http.Response('', 204);
            }
            final body = jsonDecode(request.body);
            return http.Response(
              jsonEncode(
                body['route'] == 'login'
                    ? {'access_token': 'test', 'refresh_token': 'refresh'}
                    : panel,
              ),
              200,
            );
          }),
        );
        await expectLater(
          api.login('12345678', 'example'),
          throwsA(isA<PortalException>()),
        );
        expect(revoked, true);
        api.close();
      }
    },
  );
  test(
    'New refresh token is saved before a subsequent network failure',
    () async {
      Map<String, dynamic>? persisted;
      final api = PortalClient(
        client: MockClient((request) async {
          if (request.url.path.endsWith('/token')) {
            return http.Response(
              jsonEncode({
                'access_token': 'new',
                'refresh_token': 'rotated',
                'expires_at': 9999999999,
              }),
              200,
            );
          }
          throw http.ClientException('offline');
        }),
      );
      await expectLater(
        api.restore(
          {'expires_at': 1, 'refresh_token': 'old'},
          onRefresh: (session) async {
            persisted = session;
          },
        ),
        throwsA(isA<http.ClientException>()),
      );
      expect(persisted?['refresh_token'], 'rotated');
      api.close();
    },
  );
  test('Temporary password flow remains available', () async {
    final api = PortalClient(
      client: MockClient(
        (request) async => http.Response('{"temporaryPassword":true}', 200),
      ),
    );
    await api.validate({'access_token': 'test'});
    api.close();
  });
}

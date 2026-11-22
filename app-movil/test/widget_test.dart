import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mi_sindicato/app.dart';
import 'package:mi_sindicato/portal_client.dart';

void main() {
  testWidgets('Login fits a small phone and validates before sending', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = PortalClient();
    addTearDown(api.close);
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(),
        home: LoginScreen(api: api, onLogin: (_) async {}),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Tu sindicato, contigo'), findsOneWidget);
    expect(find.textContaining('administrador'), findsNothing);
    await tester.tap(find.text('Ingresar →'));
    await tester.pumpAndSettle();
    expect(find.text('Ingresa tu clave.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

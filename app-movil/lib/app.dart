import 'dart:async';
import 'dart:convert';
import 'package:file_picker_android/file_picker_android.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'portal_client.dart';

const background = Color(0xFF101116);
const yellow = Color(0xFFFFB51B);
const _store = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);
const _sessionKey = 'misindicato.member.session.v1';

class MiSindicatoApp extends StatelessWidget {
  const MiSindicatoApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Mi Sindicato',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      colorScheme: const ColorScheme.dark(
        primary: yellow,
        surface: Color(0xFF191B22),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: background,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          foregroundColor: Colors.black,
          backgroundColor: yellow,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    ),
    home: const AppGate(),
  );
}

class AppGate extends StatefulWidget {
  const AppGate({super.key});
  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate> {
  final _api = PortalClient();
  Map<String, dynamic>? _session;
  bool _loading = true, _loggingOut = false;
  String? _error;
  Future<void> _writes = Future.value();
  @override
  void initState() {
    super.initState();
    unawaited(_restore());
  }

  Future<void> _restore() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await _store.read(key: _sessionKey);
      if (raw != null) {
        final session = await _api.restore(
          jsonDecode(raw) as Map<String, dynamic>,
          onRefresh: _persist,
        );
        await _persist(session);
        if (mounted) setState(() => _session = session);
      }
    } on PortalException catch (e) {
      if (e.unauthorized) {
        await _store.delete(key: _sessionKey);
      } else {
        _error =
            'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.';
      }
    } on FormatException {
      await _store.delete(key: _sessionKey);
    } catch (_) {
      _error = 'No pudimos abrir tu sesión. Comprueba tu conexión.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _persist(Map<String, dynamic> session) {
    // Serialize token writes so logout always erases the latest update.
    _writes = _writes
        .catchError((Object _) {})
        .then(
          (_) => _store.write(key: _sessionKey, value: jsonEncode(session)),
        );
    return _writes;
  }

  Future<void> _accept(Map<String, dynamic> session) async {
    await _persist(session);
    if (mounted) setState(() => _session = session);
  }

  Future<void> _sync(Map<String, dynamic> session) async {
    if (_loggingOut) return;
    if (mounted) {
      setState(() => _session = session);
    }
    try {
      await _persist(session);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No se pudo guardar la sesión en este teléfono.'),
          ),
        );
      }
    }
  }

  Future<void> _logout() async {
    if (_loggingOut) return;
    _loggingOut = true;
    final previous = _session;
    try {
      await _writes.catchError((Object _) {});
      await _store.delete(key: _sessionKey);
      if (mounted) {
        setState(() {
          _session = null;
          _error = null;
        });
      }
      await _api.logout(previous);
    } finally {
      _loggingOut = false;
    }
  }

  @override
  void dispose() {
    _api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingScreen();
    if (_error != null) return RetryScreen(message: _error!, retry: _restore);
    if (_session == null) return LoginScreen(api: _api, onLogin: _accept);
    return MemberWebScreen(
      key: ValueKey((_session!['user'] as Map?)?['id']),
      session: _session!,
      onSession: _sync,
      onLogout: _logout,
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLogin});
  final PortalClient api;
  final Future<void> Function(Map<String, dynamic>) onLogin;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _rut = TextEditingController(), _password = TextEditingController();
  bool _busy = false, _obscure = true;
  String? _error;
  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await widget.api.login(_rut.text, _password.text);
      await widget.onLogin(session);
      _password.clear();
    } on PortalException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'No pudimos conectar. Revisa tu conexión y vuelve a intentar.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _rut.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: AutofillGroup(
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Brand(),
                    const SizedBox(height: 42),
                    const Text(
                      'Tu sindicato, contigo',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Ingresa a tu perfil de socio conductor.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70),
                    ),
                    const SizedBox(height: 30),
                    TextFormField(
                      controller: _rut,
                      enabled: !_busy,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.username],
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(9),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'RUT sin dígito verificador',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: (v) => RegExp(r'^\d{7,9}$').hasMatch(v ?? '')
                          ? null
                          : 'Ingresa tu RUT sin puntos ni dígito verificador.',
                    ),
                    const SizedBox(height: 18),
                    TextFormField(
                      controller: _password,
                      enabled: !_busy,
                      obscureText: _obscure,
                      enableSuggestions: false,
                      autocorrect: false,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'Clave',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Mostrar clave' : 'Ocultar clave',
                          onPressed: () => setState(() => _obscure = !_obscure),
                          icon: Icon(
                            _obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (v) =>
                          v == null || v.isEmpty ? 'Ingresa tu clave.' : null,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox.square(
                              dimension: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text(
                              'Ingresar →',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                              ),
                            ),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 18),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(
                            _error!,
                            style: const TextStyle(color: yellow),
                          ),
                        ),
                      ),
                    const SizedBox(height: 28),
                    const Text(
                      '¿Necesitas acceso o una nueva clave?\nSolicítala a Presidencia de tu sindicato.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white60, height: 1.5),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class MemberWebScreen extends StatefulWidget {
  const MemberWebScreen({
    super.key,
    required this.session,
    required this.onSession,
    required this.onLogout,
  });
  final Map<String, dynamic> session;
  final Future<void> Function(Map<String, dynamic>) onSession;
  final Future<void> Function() onLogout;
  @override
  State<MemberWebScreen> createState() => _MemberWebScreenState();
}

class _MemberWebScreenState extends State<MemberWebScreen> {
  late final WebViewController _web;
  final _base = Uri.parse(webUrl);
  bool _loading = true;
  String? _error;
  Timer? _timeout;
  DateTime? _lastBack;
  bool _clearing = false;
  Uri _uri(String page) =>
      _base.resolve(page).replace(queryParameters: {'app': 'socio'});
  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(background)
      ..enableZoom(false)
      ..addJavaScriptChannel('MiSindicatoApp', onMessageReceived: _message)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (r) => isMemberPage(Uri.parse(r.url), _base)
              ? NavigationDecision.navigate
              : NavigationDecision.prevent,
          onPageStarted: (_) {
            if (mounted) {
              setState(() {
                _loading = true;
                _error = null;
              });
            }
          },
          onPageFinished: _pageFinished,
          onWebResourceError: (e) {
            if (e.isForMainFrame == true) {
              _fail('No pudimos cargar tu perfil. Revisa tu conexión.');
            }
          },
        ),
      );
    unawaited(_configure());
  }

  Future<void> _configure() async {
    try {
      final android = _web.platform;
      if (android is AndroidWebViewController) {
        await AndroidWebViewController.enableDebugging(false);
        await android.setAllowFileAccess(false);
        await android.setAllowContentAccess(true);
        await android.setOnShowFileSelector((params) async {
          try {
            return await FilePickerAndroid().pickFile(
              openMultiple: params.mode == FileSelectorMode.openMultiple,
              acceptTypes: const ['image/jpeg', 'image/png', 'image/webp'],
            );
          } catch (_) {
            return <String>[];
          }
        });
      }
      await _open();
    } catch (_) {
      _fail('No pudimos abrir la app. Inténtalo nuevamente.');
    }
  }

  Future<void> _open() async {
    _timeout?.cancel();
    if (mounted) {
      setState(() {
        _error = null;
        _loading = true;
      });
    }
    _timeout = Timer(
      const Duration(seconds: 30),
      () => _fail('La conexión está tardando. Puedes volver a intentar.'),
    );
    await _web.loadRequest(_uri('app-entry.html'));
  }

  Future<void> _pageFinished(String url) async {
    if (!isMemberPage(Uri.parse(url), _base)) return;
    if (Uri.parse(url).path.endsWith('/app-entry.html')) {
      // Tokens are injected only into our HTTPS origin, never into a URL.
      final session = jsonEncode(jsonEncode(widget.session));
      final destination = jsonEncode(_uri('sindicato-panel.html').toString());
      try {
        await _web.runJavaScript('''
        localStorage.removeItem('misindicato.auth.v1.admin');
        localStorage.removeItem('misindicato.auth.v1.member');
        sessionStorage.clear();
        sessionStorage.setItem('misindicato.auth.v1.member', $session);
        location.replace($destination);
      ''');
      } catch (_) {
        _fail('No pudimos restaurar tu perfil. Vuelve a intentar.');
      }
    }
  }

  Future<void> _message(JavaScriptMessage message) async {
    if (_clearing) return;
    try {
      final current = Uri.tryParse(await _web.currentUrl() ?? '');
      if (current == null || !isMemberPage(current, _base)) return;
      final data = jsonDecode(message.message) as Map<String, dynamic>;
      if (data['type'] == 'ready') {
        _timeout?.cancel();
        if (mounted) {
          setState(() {
            _loading = false;
            _error = null;
          });
        }
      } else if (data['type'] == 'error') {
        _fail(data['message']?.toString() ?? 'No pudimos cargar tu perfil.');
      } else if (data['type'] == 'logout' ||
          (data['type'] == 'session' && data['session'] == null)) {
        _clearing = true;
        try {
          await _web.runJavaScript(
            'sessionStorage.clear();localStorage.clear();document.body.replaceChildren();',
          );
          await _web.clearLocalStorage();
        } finally {
          await widget.onLogout();
        }
      } else if (data['type'] == 'session' &&
          data['session'] is Map<String, dynamic>) {
        final next = data['session'] as Map<String, dynamic>;
        if (next['access_token'] is String &&
            next['refresh_token'] is String &&
            (next['user'] as Map?)?['id'] ==
                (widget.session['user'] as Map?)?['id']) {
          await widget.onSession(next);
        }
      }
    } catch (_) {
      _fail('No pudimos completar esta acción. Vuelve a intentar.');
    }
  }

  void _fail(String message) {
    _timeout?.cancel();
    if (mounted) {
      setState(() {
        _loading = false;
        _error = message;
      });
    }
  }

  Future<void> _back() async {
    try {
      final handled = await _web.runJavaScriptReturningResult(
        'window.miSindicatoGoHome?.() === true',
      );
      if (handled == true || handled == 'true') {
        _lastBack = null;
        return;
      }
    } catch (_) {
      /* The connection screen also supports leaving the app. */
    }
    final now = DateTime.now();
    if (_lastBack != null &&
        now.difference(_lastBack!) < const Duration(seconds: 2)) {
      await SystemNavigator.pop();
      return;
    }
    _lastBack = now;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pulsa atrás otra vez para salir.'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  void dispose() {
    _timeout?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) unawaited(_back());
    },
    child: Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            WebViewWidget(controller: _web),
            if (_loading) const Positioned.fill(child: LoadingScreen()),
            if (_error != null)
              Positioned.fill(
                child: RetryScreen(
                  message: _error!,
                  retry: _open,
                  logout: widget.onLogout,
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class Brand extends StatelessWidget {
  const Brand({super.key});
  @override
  Widget build(BuildContext context) => Center(
    child: Image.asset(
      'assets/logo.png',
      width: 240,
      semanticLabel: 'Mi Sindicato',
    ),
  );
}

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({super.key});
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: background,
    child: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Brand(),
          const SizedBox(height: 32),
          const SizedBox.square(
            dimension: 30,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          const SizedBox(height: 18),
          Text(
            'Abriendo tu sindicato…',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    ),
  );
}

class RetryScreen extends StatelessWidget {
  const RetryScreen({
    super.key,
    required this.message,
    required this.retry,
    this.logout,
  });
  final String message;
  final Future<void> Function() retry;
  final Future<void> Function()? logout;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Brand(),
              const SizedBox(height: 32),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: FilledButton(
                  onPressed: retry,
                  child: const Text('Volver a intentar'),
                ),
              ),
              if (logout != null)
                TextButton(
                  onPressed: logout,
                  child: const Text('Cerrar sesión'),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

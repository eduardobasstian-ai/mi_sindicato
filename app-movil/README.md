# Mi Sindicato — app de socios conductores

Aplicación Flutter adaptada al flujo de Mantención Smart Fit: acceso propio, sesión cifrada en el dispositivo, vistas web actualizadas y navegación móvil.

## Alcance

- Solo el perfil de socio conductor. Presidente, tesorero, secretario y revisor ven estas mismas pantallas de socio.
- No incluye administración general, gestión de socios, asignación de cargos, publicación de comunicados ni aprobación de vehículos. Estas tareas se realizan en la web.
- Se accede con el RUT sin dígito verificador y la clave de la cuenta de socio. La cuenta de administración general es independiente.
- Fotos de perfil y vehículo, cambio de dirección, solicitudes de vehículo, información del sindicato y estado de cuentas disponible en el sitio. Asistencia y movimientos financieros siguen pendientes de implementar en el sistema.
- Los tokens se guardan con flutter_secure_storage y se restauran tras validar la afiliación. En la vista web se usan solamente en sessionStorage. No se guardan contraseñas.
- Cerrar sesión afecta únicamente la sesión del teléfono. Android no permite respaldar ni restaurar los datos de autenticación de la app.
- Solo se permite navegar a las páginas HTTPS de socios de este proyecto. La seguridad de los datos sigue dependiendo de los permisos y RLS del servidor.

## Desarrollo

Desde esta carpeta: flutter pub get, flutter analyze, flutter test, flutter run.

URL inicial: https://eduardobasstian-ai.github.io/mi_sindicato/
Puede configurarse al compilar con --dart-define=MI_SINDICATO_WEB_URL=https://DOMINIO/RUTA/ (HTTPS y barra final).

## Android

Ejecutar flutter build apk --release --split-per-abi. Los instaladores se generan en build/app/outputs/flutter-apk/.
La APK de pruebas utiliza la firma de desarrollo del equipo. Antes de publicar en una tienda se debe configurar una clave de firma de distribución propia; nunca guardar esa clave en GitHub.
No se incluyen APK, credenciales ni archivos de compilación en el repositorio.

## iPhone

Se incluyen el proyecto iOS, los iconos y la configuración de Keychain. La compilación, firma y prueba para iPhone requieren macOS, Xcode y una cuenta de Apple. No se ha compilado ni probado iOS desde Windows.

## Verificación

Pruebas automáticas del acceso de socio, exclusión de administración general, navegación limitada, conservación del refresh token ante fallos de red y formulario de acceso en pantalla pequeña. El acceso y las fotos con una cuenta real deben verificarse en un teléfono antes de distribuir la app.

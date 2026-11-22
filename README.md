# Mi Sindicato

Para las pruebas sin servidor, abre `index.html` directamente en el navegador. El enlace «Abrir Admin de pruebas» permite entrar con usuario `167704514` y clave `123456789`. Desde allí puedes crear sindicatos y sus presidentes. Los datos y las sesiones de prueba se guardan en ese navegador, separados de los datos del servidor. Usa datos ficticios. El modo local simula la autenticación y omite el autenticador.

Al modificar las reglas de `server.js` o la plantilla `sindicato-panel.html`, ejecuta `node preparar-local.cjs` para actualizar los archivos del modo local. Borrar los datos del navegador, cambiar de navegador o mover el proyecto puede dejar los datos de prueba anteriores fuera de alcance.

En Windows, ejecuta `.\iniciar.ps1` para cargar la configuración de Admin guardada para tu usuario y abrir el servidor local en el puerto 3317. El panel está en `http://127.0.0.1:3317/admin`.

Para iniciar la versión local, usa Node.js y ejecuta `node server.js` desde esta carpeta. El portal de afiliados abre en `http://127.0.0.1:3000/`.

## Primer acceso de administración general

1. Genera una clave TOTP local con `node -e "console.log(Array.from(require('node:crypto').randomBytes(32), n => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[n & 31]).join(''))"`.
2. En tu aplicación de autenticación agrega una cuenta por clave manual. Usa la clave generada y el modo basado en tiempo.
3. En PowerShell define las tres variables y arranca el servidor:

   ```powershell
   $env:SINDICATO_ADMIN_USER = 'tu-usuario'
   $env:SINDICATO_ADMIN_PASSWORD_HASH = Read-Host 'Clave de 12 a 256 caracteres' -MaskInput | node -e "const p=require('node:fs').readFileSync(0,'utf8').replace(/\r?\n$/,''); if(p.length<12||p.length>256) process.exit(1); const c=require('node:crypto'); const s=c.randomBytes(16).toString('hex'); console.log(s+':'+c.scryptSync(p,s,64).toString('hex'))"
   $env:SINDICATO_ADMIN_TOTP = Read-Host 'Clave TOTP en Base32' -MaskInput
   node server.js
   ```

4. Abre `http://127.0.0.1:3000/admin` e ingresa con el usuario, la clave y el código de seis dígitos de tu aplicación. Habilita un sindicato y registra su primer presidente. Esa cuenta entra por el portal principal.

Los datos se guardan en `sindicatos.local.json`. Puedes definir `SINDICATO_DATA` para elegir otra ubicación. Las sesiones duran hasta 30 minutos en administración general y 8 horas en el portal. Las sesiones vigentes se conservan al reiniciar el servidor. Cambiar la configuración de autenticación de Admin invalida sus sesiones anteriores.

Esta versión funciona en una sola instancia local. El identificador de subdominio se reserva al registrar el sindicato. El aprovisionamiento de DNS, HTTPS y el alojamiento de producción quedan pendientes.

## Conexión alojada

La interfaz HTTP utiliza cloud-portal.js y la función Supabase portal, con cuentas de Supabase Auth. Admin abre en sindicato-panel.html?mode=admin, valida MFA TOTP y configura Google Authenticator en el primer ingreso. Presidencia y socios entran por index.html, con su RUT sin dígito verificador. El perfil y el sindicato se verifican en el servidor.

La primera cuenta de Admin corresponde a eduardo.basstian@gmail.com. Completa la confirmación del correo y usa «Establecer o recuperar clave de Admin» para elegir tu contraseña. Configura las URLs permitidas de Auth en Supabase para la dirección publicada.

cloudflare/images-worker.js contiene el servicio de imágenes privadas con límite de 10 MB, comprobación de identidad y aislamiento por sindicato y propietario. Su despliegue requiere Workers Scripts Write y un binding IMAGES al bucket mi-sindicato-imagenes. El servicio está publicado en https://mi-sindicato-imagenes.eduardo-basstian.workers.dev y la ficha de socio permite subir y consultar imágenes privadas.

Sitio publicado: https://eduardobasstian-ai.github.io/mi_sindicato/
Admin: https://eduardobasstian-ai.github.io/mi_sindicato/sindicato-panel.html?mode=admin

En la activación inicial de Admin, después de recuperar la contraseña y vincular el autenticador, puede solicitarse el cambio obligatorio pendiente. Usa la contraseña recién establecida como clave actual y elige una diferente para completar ese paso.

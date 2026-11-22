# Base de datos de Mi Sindicato

Proyecto Supabase: mi_sindicato (eyucrgaszheehdklnivx).
La estructura de schema.sql y los ajustes de hardening.sql ya fueron aplicados al proyecto remoto.

Las cuentas deben crearse con Supabase Auth. profiles referencia la identidad de Auth y genera el usuario desde el RUT. Las contraseñas son responsabilidad de Auth.

Toda afiliación incluye el perfil de socio conductor. memberships.role representa el cargo adicional. Solo se permite un presidente por sindicato y como máximo dos afiliaciones por persona. La segunda exige un administrador general registrado y una razón de aprobación.

RLS permite al socio leer su información y al presidente consultar las fichas de su sindicato. Un sindicato o una afiliación desactivada pierde acceso. La administración general usa la tabla privada site_admins y exige una sesión Auth con MFA aal2. Una cuenta con clave temporal no obtiene acceso a los datos del sindicato hasta completar el cambio.

Las escrituras de perfiles, afiliaciones, auditoría y referencias de imágenes se realizan desde funciones de servidor autorizadas. authenticated tiene acceso de lectura sujeto a RLS. La capa de funciones que valida cada operación y la conexión de los formularios a Supabase Auth están pendientes.

media_objects guarda referencias al bucket R2 mi-sindicato-imagenes. Cada clave de objeto comienza con el identificador del sindicato. El acceso real a R2 se implementará en el servidor con autorización y enlaces temporales.

El modo de pruebas por archivo y server.js siguen usando su almacenamiento actual. Los datos locales no se han importado y los formularios aún no guardan en Supabase.

# Microservicio de Usuarios (`usuarios-cozy`)

Microservicio de autenticación, gestión de usuarios, sesiones y emisión de tokens JWT con firma criptográfica RS256 de la arquitectura Cozy.

## Características
- **Autenticación y Registro:** `POST /api/v1/auth/registro`, `POST /api/v1/auth/login`, `POST /api/v1/auth/renovar`, `GET /api/v1/auth/me`.
- **Firma JWT RS256:** Firma tokens con clave privada RSA y expone su clave pública en `GET /api/v1/interno/usuarios/clave-publica` para verificación en el gateway y servicios.
- **Gestión de Cuentas:** Administración de clientes, aprobaciones de administradores por superadmin (`GET /api/v1/admin/usuarios`, aprobar, suspender, reactivar).
- **Base de datos:** Conexión exclusiva con rol `cozy_usuarios` sobre el esquema `usuarios` de `cozy_v2`.
- **Salud:** `GET /health` en el puerto 3001.

## Instalación y compilación
```bash
npm ci
npm run build
```

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { arrancarModulo, conexionUnicaModulo } from './bootstrap-modulo';
import { CommonModule } from './common/common.module';
import { crearControladorSaludModulo } from './health/salud-modulo';
import { ComunDominioModule } from './modules/comun/comun.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';

const SaludUsuariosController = crearControladorSaludModulo('usuarios');

// Proceso separado del módulo usuarios (fase 9.2): conecta solo como cozy_usuarios y registra únicamente la entidad Usuario.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    conexionUnicaModulo('usuarios'),
    CommonModule,
    ComunDominioModule,
    UsuariosModule,
  ],
  controllers: [SaludUsuariosController],
})
export class UsuariosAppModule {}

if (require.main === module) {
  void arrancarModulo({
    modulo: 'usuarios',
    puertoPorDefecto: 3001,
    variablePuerto: 'PORT_USUARIOS',
    AppModulo: UsuariosAppModule,
  });
}


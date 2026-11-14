import bcrypt from 'bcryptjs';
import { Rol } from '../../common/enums/rol.enum.js';
import { Usuario } from '../../modules/usuarios/entities/usuario.entity.js';
import dataSource from '../data-source.js';

/**
 * Crea el primer administrador para poder entrar al sistema.
 * Toma el usuario y la contraseña de SEED_ADMIN_USUARIO y SEED_ADMIN_PASSWORD (archivo .env).
 * Si ese usuario ya existe, no cambia nada.
 */
const usuario = process.env.SEED_ADMIN_USUARIO?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!usuario || !password || password.length < 8) {
  throw new Error(
    'Define SEED_ADMIN_USUARIO y SEED_ADMIN_PASSWORD (mínimo 8 caracteres) en .env',
  );
}

await dataSource.initialize();
try {
  const usuarios = dataSource.getRepository(Usuario);
  if (await usuarios.existsBy({ usuario })) {
    console.log(`El usuario "${usuario}" ya existe. No se hicieron cambios.`);
  } else {
    await usuarios.save(
      usuarios.create({
        nombre: 'Administrador',
        usuario,
        rol: Rol.ADMIN,
        passwordHash: await bcrypt.hash(password, 12),
      }),
    );
    console.log(`Administrador "${usuario}" creado.`);
  }
} finally {
  await dataSource.destroy();
}

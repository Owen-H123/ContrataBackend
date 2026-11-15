import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import type { UsuarioAutenticado } from './types/usuario-autenticado.js';
import { AuthService } from './auth.service.js';
import {
  type CambiarPasswordDto,
  cambiarPasswordSchema,
  type LoginDto,
  loginSchema,
} from './dto/login.schema.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body({ schema: loginSchema }) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  perfil(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.auth.perfil(usuario.id);
  }

  /** Cambia la contraseña del usuario que tiene la sesión. */
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  cambiarPassword(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body({ schema: cambiarPasswordSchema }) dto: CambiarPasswordDto,
  ) {
    return this.auth.cambiarPassword(usuario.id, dto);
  }
}

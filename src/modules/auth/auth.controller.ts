import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { UsuarioAutenticado } from '../../common/types/usuario-autenticado.js';
import { AuthService } from './auth.service.js';
import { type LoginDto, loginSchema } from './dto/login.schema.js';

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
}

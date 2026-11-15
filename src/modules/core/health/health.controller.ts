import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../../../core/decorators/public.decorator.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  /** Responde si el servidor está arriba y si llega a la base de datos. */
  @Get()
  async estado() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

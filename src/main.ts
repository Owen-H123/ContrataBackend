import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './core/config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`API lista en http://localhost:${port}/api`);
}
await bootstrap();

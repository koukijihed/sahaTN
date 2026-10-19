import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { resolveApiDocsEnabled } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.use(cookieParser());

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigin, credentials: true });

  // Documentation OpenAPI : disponible hors production, desactivee en
  // production sauf activation explicite (ENABLE_API_DOCS=true). Cela evite
  // d'exposer la surface d'API publiquement sans decision consciente.
  const apiDocsEnabled = resolveApiDocsEnabled(
    process.env.ENABLE_API_DOCS,
    process.env.NODE_ENV ?? 'development'
  );
  if (apiDocsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SahaTN API')
      .setDescription(
        'API de la plateforme nationale de santǸ SahaTN. Aucune donnǸe rǸelle.'
      )
      .setVersion('0.1.0')
      .addCookieAuth('sahatn_session')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();

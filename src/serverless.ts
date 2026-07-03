import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { Express, Request, Response } from 'express';
import { AppModule } from './app.module';

let cached: Express | null = null;

async function bootstrap(): Promise<Express> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn'],
  });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('CORS_ORIGIN') ?? '*' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Vantage API')
    .setDescription('B2B finance & ledger backend.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  // init() - not listen() - so it works inside a serverless invocation.
  await app.init();
  return expressApp;
}

/** Vercel serverless handler. The Nest app is built once and reused across warm invocations. */
export default async function handler(req: Request, res: Response) {
  if (!cached) {
    cached = await bootstrap();
  }
  cached(req, res);
}

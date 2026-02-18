import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerPath = process.env.SWAGGER_PATH ?? 'docs';
  const config = new DocumentBuilder()
    .setTitle('Mini-Jenkin API')
    .setDescription('CI/CD orchestrator API powered by PostgreSQL')
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggerPath, app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Swagger: http://localhost:${port}/${swaggerPath}`);
}
bootstrap();

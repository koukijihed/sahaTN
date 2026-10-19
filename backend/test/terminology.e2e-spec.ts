import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Terminology (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/terminology/vital-signs is public and returns the referential', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/terminology/vital-signs')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    for (const entry of response.body) {
      expect(entry).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          category: 'VITAL_SIGN',
          labelFr: expect.any(String),
          labelAr: expect.any(String),
          unit: expect.any(String)
        })
      );
    }
  });

  it('GET /api/terminology/observations returns a namespaced catalogue', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/terminology/observations')
      .expect(200);

    expect(response.body.system).toMatch(/^https:\/\//);
    expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(0);
  });

  it('GET /api/terminology/units returns the UCUM subset', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/terminology/units')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'mm[Hg]' }),
        expect.objectContaining({ code: '/min' })
      ])
    );
  });
});

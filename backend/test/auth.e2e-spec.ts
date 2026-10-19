import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const VALID_PASSWORD = 'Passw0rd!2345';

function uniqueEmail(prefix = 'patient'): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}@example.tn`;
}

function readCookie(
  setCookie: string | string[] | undefined,
  name: string
): string | undefined {
  if (!setCookie) {
    return undefined;
  }
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const prefix = `${name}=`;
  const entry = cookies.find((cookie) => cookie.startsWith(prefix));
  if (!entry) {
    return undefined;
  }
  return entry.slice(prefix.length).split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('1. registers a valid patient with the PATIENT role', async () => {
    const email = uniqueEmail().toUpperCase();
    const response = await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.email).toBe(email.toLowerCase());
    expect(response.body.roles).toEqual(['PATIENT']);
  });

  it('2. rejects invalid input with 400', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('3. rejects an already used email with 409', async () => {
    const email = uniqueEmail();
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(409);
  });

  it('4. logs in with correct credentials and opens a session', async () => {
    const email = uniqueEmail();
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);

    expect(response.body.user.email).toBe(email);
    expect(Array.isArray(response.body.user.roles)).toBe(true);
  });

  it('5. rejects a wrong password with a generic 401', async () => {
    const email = uniqueEmail();
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword!999' })
      .expect(401);

    expect(response.body.message).toBe('Invalid credentials');
  });

  it('6. refuses /api/auth/me without authentication (401)', async () => {
    await request(server()).get('/api/auth/me').expect(401);
  });

  it('7. allows /api/auth/me with a valid session', async () => {
    const email = uniqueEmail();
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const agent = request.agent(server());
    await agent
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);

    const response = await agent.get('/api/auth/me').expect(200);
    expect(response.body.user.email).toBe(email);
  });

  it('8. revokes the session on logout', async () => {
    const email = uniqueEmail();
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const agent = request.agent(server());
    const login = await agent
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);

    const csrf = readCookie(login.headers['set-cookie'], 'sahatn_csrf');
    expect(csrf).toBeDefined();

    await agent
      .post('/api/auth/logout')
      .set('x-csrf-token', csrf as string)
      .expect(204);

    await agent.get('/api/auth/me').expect(401);
  });

  it('9. refuses to self-assign a privileged role', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({
        email: uniqueEmail(),
        password: VALID_PASSWORD,
        role: 'DOCTOR'
      })
      .expect(400);
  });

  it('10. never returns the password hash', async () => {
    const email = uniqueEmail();
    const registerResponse = await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const loginResponse = await request(server())
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);

    expect(JSON.stringify(registerResponse.body)).not.toContain('passwordHash');
    expect(JSON.stringify(loginResponse.body)).not.toContain('passwordHash');
    expect(registerResponse.body).not.toHaveProperty('passwordHash');
    expect(loginResponse.body.user).not.toHaveProperty('passwordHash');
  });

  it('11. locks the account after too many failed attempts', async () => {
    const email = uniqueEmail('lock');
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(server())
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword!999' })
        .expect(401);
    }

    await request(server())
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(429);
  });

  it('12a. requires a CSRF token for logout', async () => {
    const email = uniqueEmail();
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const agent = request.agent(server());
    await agent
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);

    await agent.post('/api/auth/logout').expect(403);
  });

  it('12b. sets a HttpOnly, SameSite=Lax session cookie', async () => {
    const email = uniqueEmail();
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((cookie) =>
      cookie.startsWith('sahatn_session=')
    );

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
  });

  it('12c. rejects state-changing requests from a disallowed origin', async () => {
    await request(server())
      .post('/api/auth/register')
      .set('Origin', 'http://evil.example')
      .send({ email: uniqueEmail(), password: VALID_PASSWORD })
      .expect(403);
  });
});

import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeAll(async () => {
    service = new PasswordService();
    await service.onModuleInit();
  });

  it('produces an Argon2id hash distinct from the password', async () => {
    const hash = await service.hash('Passw0rd!2345');
    expect(hash).not.toBe('Passw0rd!2345');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a correct password', async () => {
    const hash = await service.hash('Passw0rd!2345');
    await expect(service.verify(hash, 'Passw0rd!2345')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('Passw0rd!2345');
    await expect(service.verify(hash, 'WrongPassword!999')).resolves.toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    await expect(service.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });
});

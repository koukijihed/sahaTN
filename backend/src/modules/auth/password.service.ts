import { Injectable, OnModuleInit } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService implements OnModuleInit {
  private readonly options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  };

  private dummyHash: string | null = null;

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(
      'sahatn-timing-equalization-placeholder',
      this.options
    );
  }

  hash(password: string): Promise<string> {
    return hash(password, this.options);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    if (!this.dummyHash) {
      return;
    }
    try {
      await verify(this.dummyHash, password);
    } catch {
      return;
    }
  }
}

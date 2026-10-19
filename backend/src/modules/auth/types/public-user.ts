import { Role } from '@prisma/client';

export interface PublicUser {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: Role[];
  createdAt: Date;
}

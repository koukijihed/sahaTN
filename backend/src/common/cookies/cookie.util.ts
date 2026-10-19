import { CookieOptions, Response } from 'express';

const BASE_PATH = '/';
const SAME_SITE: CookieOptions['sameSite'] = 'lax';

function baseOptions(secure: boolean, domain?: string): CookieOptions {
  const options: CookieOptions = {
    secure,
    sameSite: SAME_SITE,
    path: BASE_PATH
  };
  if (domain) {
    options.domain = domain;
  }
  return options;
}

export function setSessionCookie(
  response: Response,
  name: string,
  token: string,
  ttlSeconds: number,
  secure: boolean,
  domain?: string
): void {
  response.cookie(name, token, {
    ...baseOptions(secure, domain),
    httpOnly: true,
    maxAge: ttlSeconds * 1000
  });
}

export function clearSessionCookie(
  response: Response,
  name: string,
  secure: boolean,
  domain?: string
): void {
  response.clearCookie(name, {
    ...baseOptions(secure, domain),
    httpOnly: true
  });
}

export function setCsrfCookie(
  response: Response,
  name: string,
  token: string,
  ttlSeconds: number,
  secure: boolean,
  domain?: string
): void {
  response.cookie(name, token, {
    ...baseOptions(secure, domain),
    httpOnly: false,
    maxAge: ttlSeconds * 1000
  });
}

export function clearCsrfCookie(
  response: Response,
  name: string,
  secure: boolean,
  domain?: string
): void {
  response.clearCookie(name, {
    ...baseOptions(secure, domain),
    httpOnly: false
  });
}

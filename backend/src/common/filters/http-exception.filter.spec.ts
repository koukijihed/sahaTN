import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

interface Captured {
  status?: number;
  body?: Record<string, unknown>;
  logged?: unknown[];
}

function hostFor(url: string, captured: Captured): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    }
  };
  const request = { url, method: 'GET' };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request
    })
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let logged: unknown[][];

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    logged = [];
    jest
      .spyOn(
        (filter as unknown as { logger: { error: (...a: unknown[]) => void } })
          .logger,
        'error'
      )
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
  });

  afterEach(() => jest.restoreAllMocks());

  it('never echoes the query string back to the client', () => {
    const captured: Captured = {};
    filter.catch(
      new BadRequestException('invalid'),
      hostFor('/api/search?token=SECRET123&q=diabetes', captured)
    );

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body?.path).toBe('/api/search');
    expect(JSON.stringify(captured.body)).not.toContain('SECRET123');
    expect(JSON.stringify(captured.body)).not.toContain('diabetes');
  });

  it('never logs the query string for unhandled exceptions', () => {
    const captured: Captured = {};
    filter.catch(
      new Error('boom'),
      hostFor('/api/medical-records/patients/abc?note=CONFIDENTIAL', captured)
    );

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body?.path).toBe('/api/medical-records/patients/abc');
    const loggedText = JSON.stringify(logged);
    expect(loggedText).toContain('/api/medical-records/patients/abc');
    expect(loggedText).not.toContain('CONFIDENTIAL');
  });

  it('falls back to "/" when the URL is empty', () => {
    const captured: Captured = {};
    filter.catch(new BadRequestException('x'), hostFor('', captured));
    expect(captured.body?.path).toBe('/');
  });
});

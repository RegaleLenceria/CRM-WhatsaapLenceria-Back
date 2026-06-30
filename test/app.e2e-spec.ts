/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

jest.mock('@nestjs/typeorm', () => {
  const actual = jest.requireActual('@nestjs/typeorm');
  class MockTypeOrmModule {
    static forRootAsync() {
      return { module: MockTypeOrmModule };
    }
    static forRoot() {
      return { module: MockTypeOrmModule };
    }
    static forFeature(entities: any[]) {
      const providers = entities.map((entity) => ({
        provide: actual.getRepositoryToken(entity),
        useValue: {
          find: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((dto) => dto),
        },
      }));
      return {
        module: MockTypeOrmModule,
        providers: providers,
        exports: providers,
      };
    }
  }
  return {
    ...actual,
    TypeOrmModule: MockTypeOrmModule,
  };
});

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('@nestjs/bullmq', () => {
  const actual = jest.requireActual('@nestjs/bullmq');
  class MockBullModule {
    static forRoot() {
      return { module: MockBullModule };
    }
    static forRootAsync() {
      return { module: MockBullModule };
    }
    static registerQueue(config: { name: string }) {
      const providers = [
        {
          provide: actual.getQueueToken(config.name),
          useValue: {
            add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
          },
        },
      ];
      return {
        module: MockBullModule,
        providers: providers,
        exports: providers,
      };
    }
  }
  return {
    ...actual,
    BullModule: MockBullModule,
  };
});

jest.mock('@whiskeysockets/baileys', () => {
  return {
    __esModule: true,
    default: jest.fn().mockReturnValue({
      ev: {
        on: jest.fn(),
      },
      end: jest.fn(),
    }),
    useMultiFileAuthState: jest.fn().mockResolvedValue({
      state: {},
      saveCreds: jest.fn(),
    }),
    DisconnectReason: {
      loggedOut: 401,
    },
    initAuthCreds: () => ({
      noiseKey: { public: Buffer.alloc(32), private: Buffer.alloc(32) },
      pairingEphemeralKeyPair: {
        public: Buffer.alloc(32),
        private: Buffer.alloc(32),
      },
      signedIdentityKey: {
        public: Buffer.alloc(32),
        private: Buffer.alloc(32),
      },
      signedPreKey: {
        keyPair: { public: Buffer.alloc(32), private: Buffer.alloc(32) },
        signature: Buffer.alloc(64),
        keyId: 1,
      },
      registrationId: 1234,
      advSecretKey: '',
      processedHistoryMessages: [],
      nextPreKeyId: 1,
      firstUnuploadedPreKeyId: 1,
      accountSettings: { unarchiveChats: false },
      registered: false,
    }),
    BufferJSON: {
      reviver: (key: string, value: unknown) => value,
      replacer: (key: string, value: unknown) => value,
    },
  };
});

import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string; timestamp: string };
        expect(body.status).toBe('ok');
        expect(body.timestamp).toBeDefined();
      });
  });

  afterEach(async () => {
    await app.close();
  });
});

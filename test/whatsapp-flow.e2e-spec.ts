import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Mock bullmq completely to prevent background Worker and Queue instances from establishing physical Redis connections
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

// Mock NestJS BullModule wrapper
jest.mock('@nestjs/bullmq', () => {
  const actual = jest.requireActual('@nestjs/bullmq');
  class MockBullModule {
    static forRoot() {
      return { module: MockBullModule };
    }
    static forRootAsync() {
      return { module: MockBullModule };
    }
    static registerQueue(config: any) {
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

import { AppModule } from '../src/app.module';
import { Customer } from '../src/modules/customers/infrastructure/entities/customer.entity';
import { Message } from '../src/modules/whatsapp/infrastructure/entities/message.entity';
import { Device } from '../src/modules/whatsapp/infrastructure/entities/device.entity';
import { WhatsappService } from '../src/modules/whatsapp/infrastructure/services/whatsapp.service';

const mockEvHandlers: { [key: string]: (arg: any) => void } = {};
const mockSock = {
  ev: {
    on: jest
      .fn()
      .mockImplementation((event: string, handler: (arg: any) => void) => {
        mockEvHandlers[event] = handler;
      }),
  },
  end: jest.fn(),
};

jest.mock('@whiskeysockets/baileys', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockSock),
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
      reviver: (key: string, value: any) => value,
      replacer: (key: string, value: any) => value,
    },
  };
});

describe('WhatsApp Incoming Message Flow (e2e)', () => {
  // Set test timeout to 30 seconds to allow slow Supabase operations if necessary
  jest.setTimeout(30000);

  let app: INestApplication;
  let customerRepository: Repository<Customer>;
  let messageRepository: Repository<Message>;
  let deviceRepository: Repository<Device>;
  let whatsappService: WhatsappService;

  const testDeviceId = 'test-device-e2e-flow';
  const testPhone = '59177123456';
  const testMsgId = 'test-msg-id-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    customerRepository = app.get<Repository<Customer>>(
      getRepositoryToken(Customer),
    );
    messageRepository = app.get<Repository<Message>>(
      getRepositoryToken(Message),
    );
    deviceRepository = app.get<Repository<Device>>(getRepositoryToken(Device));
    whatsappService = app.get<WhatsappService>(WhatsappService);

    // Clean up any potential stale test data from previous runs
    try {
      await messageRepository.delete({ whatsappMessageId: testMsgId });
      await customerRepository.delete({ phone: testPhone });
      await deviceRepository.delete({ id: testDeviceId });
    } catch (err) {
      // Ignore if records don't exist
    }

    // Create and save test device in the real database
    const device = deviceRepository.create({
      id: testDeviceId,
      name: 'E2E Test Device',
      phoneNumber: '12345678',
      isOnline: true,
    });
    await deviceRepository.save(device);
  });

  afterAll(async () => {
    // Teardown / Cleanup test data in correct dependency order
    try {
      if (messageRepository) {
        await messageRepository.delete({ whatsappMessageId: testMsgId });
      }
      if (customerRepository) {
        await customerRepository.delete({ phone: testPhone });
      }
      if (deviceRepository) {
        await deviceRepository.delete({ id: testDeviceId });
      }
    } catch (err) {
      console.error('Error cleaning up E2E test data:', err);
    }
    if (app) {
      await app.close();
    }
  });

  it('Debe crear un nuevo cliente y guardar el mensaje al recibir un payload de Baileys', async () => {
    // Trigger session startup to initialize our mocked socket and capture events
    await whatsappService.startConnection(testDeviceId);

    const upsertHandler = mockEvHandlers['messages.upsert'];
    expect(upsertHandler).toBeDefined();

    // Mock incoming message payload from Baileys
    const mockPayload = {
      type: 'notify' as const,
      messages: [
        {
          key: {
            remoteJid: `${testPhone}@s.whatsapp.net`,
            id: testMsgId,
            fromMe: false,
          },
          message: {
            conversation: 'Hola, me interesan los conjuntos',
          },
          pushName: 'Cliente Test E2E',
        },
      ],
    };

    // Invoke the captured event handler
    await upsertHandler(mockPayload);

    // Wait 1 second for the async repository operations to finish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Assert that the Customer was created in database
    const customer = await customerRepository.findOne({
      where: { phone: testPhone },
    });
    expect(customer).not.toBeNull();
    expect(customer?.phone).toBe(testPhone);
    expect(customer?.name).toBe('Cliente Test E2E');

    // Assert that the Message was stored and correctly linked to the Customer
    const message = await messageRepository.findOne({
      where: { whatsappMessageId: testMsgId },
      relations: { customer: true },
    });
    expect(message).not.toBeNull();
    expect(message?.content).toBe('Hola, me interesan los conjuntos');
    expect(message?.type).toBe('incoming');
    expect(message?.status).toBe('pendiente');
    expect(message?.customer).toBeDefined();
    expect(message?.customer?.id).toBe(customer?.id);
  });
});

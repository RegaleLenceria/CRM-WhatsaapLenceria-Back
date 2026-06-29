// src/modules/whatsapp/infrastructure/adapters/postgres-auth-state.adapter.ts
import { BufferJSON, initAuthCreds, AuthenticationState } from '@whiskeysockets/baileys';
import { Repository } from 'typeorm';
import { Device } from '../entities/device.entity';

export async function usePostgresAuthState(
  deviceId: string,
  deviceRepository: Repository<Device>,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  let device = await deviceRepository.findOne({ where: { id: deviceId } });

  if (!device) {
    device = deviceRepository.create({
      id: deviceId,
      name: `Device ${deviceId}`,
      phoneNumber: '',
      isOnline: false,
      sessionTokens: null,
    });
    await deviceRepository.save(device);
  }

  let creds: any;
  let keys: { [key: string]: any } = {};

  if (device.sessionTokens) {
    try {
      const sessionData = typeof device.sessionTokens === 'string'
        ? JSON.parse(device.sessionTokens, BufferJSON.reviver)
        : JSON.parse(JSON.stringify(device.sessionTokens), BufferJSON.reviver);

      creds = sessionData.creds;
      keys = sessionData.keys || {};
    } catch (err) {
      console.error(`Error parsing sessionTokens for device ${deviceId}, initializing new auth state:`, err);
      creds = initAuthCreds();
      keys = {};
    }
  } else {
    creds = initAuthCreds();
    keys = {};
  }

  const saveState = async () => {
    const sessionString = JSON.stringify({ creds, keys }, BufferJSON.replacer);
    const sessionObj = JSON.parse(sessionString);

    await deviceRepository.update(deviceId, {
      sessionTokens: sessionObj,
    });
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const keyData: { [id: string]: any } = {};
          for (const id of ids) {
            const value = keys[`${type}:${id}`];
            if (value) {
              keyData[id] = value;
            }
          }
          return keyData;
        },
        set: (data) => {
          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id];
              if (value) {
                keys[`${type}:${id}`] = value;
              } else {
                delete keys[`${type}:${id}`];
              }
            }
          }
          return saveState();
        },
      },
    },
    saveCreds: saveState,
  };
}

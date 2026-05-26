import path from 'path';
import os from 'os';
import { userDataDir } from './paths';

export const config = {
  vaultPath: path.join(os.homedir(), 'vault'),
  get dbPath(): string {
    return path.join(userDataDir(), 'laguz.db');
  },
  apiPort: 3144,
};

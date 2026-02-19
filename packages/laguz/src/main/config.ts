import path from 'path';
import os from 'os';
import { app } from 'electron';

export const config = {
  vaultPath: path.join(os.homedir(), 'vault'),
  dbPath: path.join(app.getPath('userData'), 'laguz.db'),
  apiPort: 3144,
};

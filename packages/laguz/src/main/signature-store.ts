import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const STORE_DIR = path.join(app.getPath('userData'), 'signatures');
const PROFILE_PATH = path.join(app.getPath('userData'), 'profile.json');

export interface SignatureInfo {
  name: string;
  pngBase64: string;
}

export interface CompScienceProfile {
  company: string;
  address: string;
  signatory: string;
  title: string;
}

export class SignatureStore {
  constructor() {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
  }

  list(): SignatureInfo[] {
    const files = fs.readdirSync(STORE_DIR).filter(f => f.endsWith('.png'));
    return files.map(f => ({
      name: f.replace(/\.png$/, ''),
      pngBase64: fs.readFileSync(path.join(STORE_DIR, f)).toString('base64'),
    }));
  }

  get(name?: string): string | null {
    const sigs = this.list();
    if (sigs.length === 0) return null;
    if (name) {
      const found = sigs.find(s => s.name === name);
      return found?.pngBase64 ?? null;
    }
    return sigs[0].pngBase64;
  }

  save(name: string, pngBase64: string): void {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(STORE_DIR, `${safeName}.png`);
    fs.writeFileSync(filePath, Buffer.from(pngBase64, 'base64'));
  }

  remove(name: string): void {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(STORE_DIR, `${safeName}.png`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  getProfile(): CompScienceProfile | null {
    if (!fs.existsSync(PROFILE_PATH)) return null;
    try {
      return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }

  saveProfile(profile: CompScienceProfile): void {
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf-8');
  }
}

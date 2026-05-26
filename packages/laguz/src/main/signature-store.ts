import fs from 'fs';
import path from 'path';
import { userDataDir } from './paths';

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
  private readonly storeDir: string;
  private readonly profilePath: string;

  constructor() {
    const base = userDataDir();
    this.storeDir = path.join(base, 'signatures');
    this.profilePath = path.join(base, 'profile.json');
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
  }

  list(): SignatureInfo[] {
    const files = fs.readdirSync(this.storeDir).filter(f => f.endsWith('.png'));
    return files.map(f => ({
      name: f.replace(/\.png$/, ''),
      pngBase64: fs.readFileSync(path.join(this.storeDir, f)).toString('base64'),
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
    const filePath = path.join(this.storeDir, `${safeName}.png`);
    fs.writeFileSync(filePath, Buffer.from(pngBase64, 'base64'));
  }

  remove(name: string): void {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(this.storeDir, `${safeName}.png`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  getProfile(): CompScienceProfile | null {
    if (!fs.existsSync(this.profilePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.profilePath, 'utf-8'));
    } catch (e) {
      console.error('[SignatureStore] Failed to parse profile:', e);
      return null;
    }
  }

  saveProfile(profile: CompScienceProfile): void {
    fs.writeFileSync(this.profilePath, JSON.stringify(profile, null, 2), 'utf-8');
  }
}

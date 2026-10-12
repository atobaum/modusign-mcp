import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertReadablePath,
  assertWritablePath,
  configuredAllowedDirs,
} from '../src/utils/path-guard.js';

let root: string;
let allowed: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'path-guard-'));
  allowed = path.join(root, 'allowed');
  outside = path.join(root, 'outside');
  await mkdir(allowed);
  await mkdir(outside);
  await writeFile(path.join(allowed, 'contract.pdf'), 'pdf');
  await writeFile(path.join(outside, 'id_rsa'), 'secret');
  await symlink(path.join(outside, 'id_rsa'), path.join(allowed, 'link.pdf'));
  await symlink(outside, path.join(allowed, 'escape'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('configuredAllowedDirs', () => {
  it('defaults to ~/Downloads and ~/Documents', () => {
    expect(configuredAllowedDirs(undefined)).toEqual([
      path.join(homedir(), 'Downloads'),
      path.join(homedir(), 'Documents'),
    ]);
    expect(configuredAllowedDirs('  ')).toHaveLength(2);
  });

  it('splits by path delimiter and expands ~', () => {
    expect(configuredAllowedDirs(`~/a${path.delimiter}/tmp/b`)).toEqual([
      path.join(homedir(), 'a'),
      '/tmp/b',
    ]);
  });
});

describe('assertReadablePath', () => {
  it('allows a file inside an allowed dir', async () => {
    await expect(assertReadablePath(path.join(allowed, 'contract.pdf'), [allowed])).resolves.toMatch(
      /contract\.pdf$/,
    );
  });

  it('rejects a file outside allowed dirs', async () => {
    await expect(assertReadablePath(path.join(outside, 'id_rsa'), [allowed])).rejects.toThrow(
      '허용되지 않은 경로',
    );
  });

  it('rejects ../ traversal', async () => {
    await expect(
      assertReadablePath(path.join(allowed, '..', 'outside', 'id_rsa'), [allowed]),
    ).rejects.toThrow('허용되지 않은 경로');
  });

  it('rejects symlinks pointing outside', async () => {
    await expect(assertReadablePath(path.join(allowed, 'link.pdf'), [allowed])).rejects.toThrow(
      '허용되지 않은 경로',
    );
  });

  it('rejects relative paths', async () => {
    await expect(assertReadablePath('contract.pdf', [allowed])).rejects.toThrow('절대 경로');
  });

  it('reports a missing file', async () => {
    await expect(assertReadablePath(path.join(allowed, 'missing.pdf'), [allowed])).rejects.toThrow(
      '파일을 찾을 수 없습니다',
    );
  });
});

describe('assertWritablePath', () => {
  it('allows a not-yet-existing nested path inside an allowed dir', async () => {
    await expect(
      assertWritablePath(path.join(allowed, 'new', 'dir', 'out.pdf'), [allowed]),
    ).resolves.toMatch(/out\.pdf$/);
  });

  it('rejects writing through a symlinked dir that points outside', async () => {
    await expect(
      assertWritablePath(path.join(allowed, 'escape', 'out.pdf'), [allowed]),
    ).rejects.toThrow('허용되지 않은 경로');
  });

  it('rejects the allowed dir itself', async () => {
    await expect(assertWritablePath(allowed, [allowed])).rejects.toThrow('허용되지 않은 경로');
  });
});

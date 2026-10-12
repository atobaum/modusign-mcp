import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

function expandHome(dir: string): string {
  if (dir === '~') return homedir();
  if (dir.startsWith('~/')) return path.join(homedir(), dir.slice(2));
  return dir;
}

export function configuredAllowedDirs(raw: string | undefined = process.env.MODUSIGN_ALLOWED_DIRS): string[] {
  const dirs = (raw ?? '')
    .split(path.delimiter)
    .map((dir) => dir.trim())
    .filter(Boolean);
  if (dirs.length === 0) {
    return [path.join(homedir(), 'Downloads'), path.join(homedir(), 'Documents')];
  }
  return dirs.map((dir) => path.resolve(expandHome(dir)));
}

// Resolves symlinks even when the target (or some of its parents) does not exist yet.
async function realpathOfNearestExisting(target: string): Promise<string> {
  const missingParts: string[] = [];
  let current = target;
  while (true) {
    try {
      return path.join(await realpath(current), ...missingParts.reverse());
    } catch (err) {
      const parent = path.dirname(current);
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || parent === current) throw err;
      missingParts.push(path.basename(current));
      current = parent;
    }
  }
}

function isInside(dir: string, target: string): boolean {
  const relative = path.relative(dir, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function assertAllowed(target: string, allowedDirs: string[]): Promise<string> {
  if (!path.isAbsolute(target)) {
    throw new Error(`절대 경로만 사용할 수 있습니다: ${target}`);
  }
  const resolvedTarget = await realpathOfNearestExisting(path.resolve(target));
  const resolvedDirs = await Promise.all(allowedDirs.map(realpathOfNearestExisting));
  if (!resolvedDirs.some((dir) => isInside(dir, resolvedTarget))) {
    throw new Error(
      `허용되지 않은 경로입니다: ${target}\n` +
      `허용된 디렉토리: ${allowedDirs.join(', ')}\n` +
      `다른 디렉토리를 쓰려면 MODUSIGN_ALLOWED_DIRS 환경변수에 추가하세요.`,
    );
  }
  return resolvedTarget;
}

export async function assertReadablePath(
  target: string,
  allowedDirs: string[] = configuredAllowedDirs(),
): Promise<string> {
  const resolved = await assertAllowed(target, allowedDirs);
  try {
    await realpath(resolved);
  } catch {
    throw new Error(
      `파일을 찾을 수 없습니다: ${target}\n` +
      `실제 파일시스템 경로를 확인하거나 BASE64 모드를 사용해주세요.`,
    );
  }
  return resolved;
}

export async function assertWritablePath(
  target: string,
  allowedDirs: string[] = configuredAllowedDirs(),
): Promise<string> {
  return assertAllowed(target, allowedDirs);
}

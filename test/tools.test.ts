import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModusignClient } from '../src/client/modusign-client.js';
import { registerDocumentTools } from '../src/tools/documents.js';
import { registerFileTools } from '../src/tools/files.js';
import { registerLabelTools } from '../src/tools/labels.js';
import { registerTemplateTools } from '../src/tools/templates.js';
import { registerUserTools } from '../src/tools/user.js';
import { registerWebhookTools } from '../src/tools/webhooks.js';

const fileRef = { type: 'FILE_REF', value: { fileId: 'f1', token: 't1' } };
const participant = {
  type: 'SIGNER',
  role: '근로자',
  name: '김모두',
  signingOrder: 1,
  signingMethod: { type: 'EMAIL', value: 'a@b.c' },
};

let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
let mcp: Client;

beforeEach(async () => {
  api = { get: vi.fn(), post: vi.fn().mockResolvedValue({ id: 'x' }), put: vi.fn().mockResolvedValue({}) };
  const server = new McpServer({ name: 'test', version: '0' });
  const client = api as unknown as ModusignClient;
  registerDocumentTools(server, client);
  registerTemplateTools(server, client);
  registerFileTools(server, client);
  registerUserTools(server, client);
  registerLabelTools(server, client);
  registerWebhookTools(server, client);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  mcp = new Client({ name: 'test-client', version: '0' });
  await mcp.connect(clientTransport);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function call(name: string, args: Record<string, unknown>) {
  const result = await mcp.callTool({ name, arguments: args });
  const text = (result.content as { text: string }[])[0].text;
  return { isError: result.isError, text };
}

describe('annotations', () => {
  it('marks every tool and flags destructive ones', async () => {
    const { tools } = await mcp.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));

    expect(tools.every((tool) => tool.annotations)).toBe(true);
    expect(byName.document_get?.readOnlyHint).toBe(true);
    expect(byName.document_cancel?.destructiveHint).toBe(true);
    expect(byName.template_delete?.destructiveHint).toBe(true);
    expect(byName.document_create?.readOnlyHint).toBe(false);
  });
});

describe('document_get', () => {
  it('strips presigned download URLs', async () => {
    api.get.mockResolvedValue({
      id: 'd1',
      file: { downloadUrl: 'https://s3/doc', name: 'a.pdf' },
      auditTrail: { downloadUrl: 'https://s3/audit' },
    });

    const { text } = await call('document_get', { documentId: 'd1' });

    expect(text).not.toContain('https://s3');
    expect(JSON.parse(text)).toEqual({ id: 'd1', file: { name: 'a.pdf' } });
  });
});

describe('document_create', () => {
  it('sends carbonCopies in the API contact format', async () => {
    await call('document_create', {
      title: '계약서',
      file: fileRef,
      participants: [participant],
      carbonCopies: [{ contact: 'cc@b.c' }],
    });

    expect(api.post).toHaveBeenCalledWith(
      '/documents',
      expect.objectContaining({ carbonCopies: [{ contact: 'cc@b.c' }] }),
    );
  });

  it('sends requesterAttachments with name and file.name', async () => {
    await call('document_create', {
      title: '계약서',
      file: fileRef,
      participants: [participant],
      requesterAttachments: [fileRef, { name: '별첨', file: fileRef }],
    });

    expect(api.post).toHaveBeenCalledWith(
      '/documents',
      expect.objectContaining({
        requesterAttachments: [
          {
            name: 'requester-attachment-1.pdf',
            file: { fileId: 'f1', token: 't1', name: 'requester-attachment-1' },
          },
          { name: '별첨', file: { fileId: 'f1', token: 't1', name: 'requester-attachment-2' } },
        ],
      }),
    );
  });

  it('forwards carbonCopies for embedded drafts', async () => {
    await call('document_create', {
      title: '계약서',
      embedded: true,
      file: fileRef,
      carbonCopies: [{ contact: 'cc@b.c' }],
    });

    expect(api.post).toHaveBeenCalledWith(
      '/embedded-drafts',
      expect.objectContaining({ carbonCopies: [{ contact: 'cc@b.c' }] }),
    );
  });

  it('rejects fields the template endpoint does not accept', async () => {
    const { isError, text } = await call('document_create', {
      title: '계약서',
      templateId: 'tpl-1',
      participantMappings: [{ role: '근로자', name: '김모두', signingMethod: participant.signingMethod }],
      requesterAttachments: [fileRef],
    });

    expect(isError).toBe(true);
    expect(text).toContain('requesterAttachments');
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('document_download', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'download-'));
    vi.stubEnv('MODUSIGN_ALLOWED_DIRS', dir);
    api.get.mockResolvedValue({ title: 't', status: 'COMPLETED', file: { downloadUrl: 'https://s3/doc' } });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('new')));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses to overwrite an existing file by default', async () => {
    const target = path.join(dir, 'a.pdf');
    await writeFile(target, 'old');

    const { isError, text } = await call('document_download', { documentId: 'd1', outputPath: target });

    expect(isError).toBe(true);
    expect(text).toContain('이미 파일이 존재합니다');
    expect(await readFile(target, 'utf8')).toBe('old');
  });

  it('overwrites when overwrite is true', async () => {
    const target = path.join(dir, 'a.pdf');
    await writeFile(target, 'old');

    await call('document_download', { documentId: 'd1', outputPath: target, overwrite: true });

    expect(await readFile(target, 'utf8')).toBe('new');
  });
});

describe('webhook_manage', () => {
  it('requires name and url for create', async () => {
    const { isError } = await call('webhook_manage', { action: 'create', url: 'https://hook.test' });

    expect(isError).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends typed fields for create', async () => {
    await call('webhook_manage', {
      action: 'create',
      name: 'hook',
      url: 'https://hook.test',
      events: ['document_all_signed'],
    });

    expect(api.post).toHaveBeenCalledWith('/webhooks', {
      name: 'hook',
      url: 'https://hook.test',
      events: ['document_all_signed'],
    });
  });
});

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModusignClient } from '../src/client/modusign-client.js';
import { registerDocumentTools } from '../src/tools/documents.js';

const fileRef = { type: 'FILE_REF', value: { fileId: 'f1', token: 't1' } };
const participant = {
  type: 'SIGNER',
  role: '근로자',
  name: '김모두',
  signingOrder: 1,
  signingMethod: { type: 'EMAIL', value: 'a@b.c' },
};

let post: ReturnType<typeof vi.fn>;
let mcp: Client;

beforeEach(async () => {
  post = vi.fn().mockResolvedValue({ id: 'doc-1' });
  const server = new McpServer({ name: 'test', version: '0' });
  registerDocumentTools(server, { post } as unknown as ModusignClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  mcp = new Client({ name: 'test-client', version: '0' });
  await mcp.connect(clientTransport);
});

async function callCreate(args: Record<string, unknown>) {
  return mcp.callTool({ name: 'document_create', arguments: { title: '계약서', ...args } });
}

function errorText(result: Awaited<ReturnType<typeof callCreate>>): string {
  expect(result.isError).toBe(true);
  return (result.content as { text: string }[])[0].text;
}

describe('document_create', () => {
  it('forwards passthrough fields for file-based requests', async () => {
    await callCreate({ file: fileRef, participants: [participant], extraOption: true });

    expect(post).toHaveBeenCalledWith('/documents', expect.objectContaining({ extraOption: true }));
  });

  it('forwards passthrough fields for template-based requests', async () => {
    await callCreate({
      templateId: 'tpl-1',
      participantMappings: [{ role: '근로자', name: '김모두', signingMethod: participant.signingMethod }],
      extraOption: true,
    });

    expect(post).toHaveBeenCalledWith(
      '/documents/request-with-template',
      expect.objectContaining({ templateId: 'tpl-1', extraOption: true }),
    );
  });

  it('requires participants for file-based requests', async () => {
    const result = await callCreate({ file: fileRef });

    expect(errorText(result)).toContain('participants is required');
    expect(post).not.toHaveBeenCalled();
  });

  it('requires participantMappings for template-based requests', async () => {
    const result = await callCreate({ templateId: 'tpl-1' });

    expect(errorText(result)).toContain('participantMappings is required');
    expect(post).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), resolve: vi.fn(), fetch: vi.fn() }));
vi.mock('vscode', () => ({ workspace: { fs: { readFile: mocks.readFile } } }));
vi.mock('../../src/util/documentResourceResolver', () => ({ resolveDocumentResource: mocks.resolve }));
import { imageDataUri } from '../../src/images/imageDataUri';

describe('imageDataUri', () => {
  const document = {} as never;
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.readFile.mockResolvedValue(png);
    mocks.resolve.mockReturnValue({ scheme: 'file', fsPath: 'C:/docs/image.png', fragment: '', with: () => ({ scheme: 'file', fsPath: 'C:/docs/image.png' }) });
  });

  it('embeds local files as base64 with an image MIME type', async () => {
    expect(await imageDataUri(document, 'image.png', false)).toBe('data:image/png;base64,' + png.toString('base64'));
    expect(mocks.resolve).toHaveBeenCalledWith(document, 'image.png');
  });

  it('preserves SVG fragments and does not re-download embedded images', async () => {
    mocks.resolve.mockReturnValue({ scheme: 'file', fsPath: 'C:/docs/image.svg', fragment: 'view', with: () => ({ scheme: 'file', fsPath: 'C:/docs/image.svg' }) });
    mocks.readFile.mockResolvedValue(Buffer.from('<svg/>'));
    expect(await imageDataUri(document, 'image.svg#view', false)).toBe('data:image/svg+xml;base64,PHN2Zy8+#view');
    expect(await imageDataUri(document, 'data:image/png;base64,AA==', false)).toBe('data:image/png;base64,AA==');
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it('downloads remote images only when allowed and rejects HTTP errors or HTML', async () => {
    await expect(imageDataUri(document, 'https://example.com/image.png', false)).rejects.toThrow('disabled');
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValue(new Response(png, { headers: { 'content-type': 'image/png' } }));
    expect(await imageDataUri(document, 'https://example.com/image.png', true)).toBe('data:image/png;base64,' + png.toString('base64'));
    mocks.fetch.mockResolvedValue(new Response('Missing', { status: 404 }));
    await expect(imageDataUri(document, 'https://example.com/missing.png', true)).rejects.toThrow('HTTP 404');
    mocks.fetch.mockResolvedValue(new Response('<html/>', { headers: { 'content-type': 'text/html' } }));
    await expect(imageDataUri(document, 'https://example.com/not-image.png', true)).rejects.toThrow('not a supported image');
  });
});

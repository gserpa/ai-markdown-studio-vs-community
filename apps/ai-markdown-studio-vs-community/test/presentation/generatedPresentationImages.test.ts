import { describe, expect, it, vi } from 'vitest';
import { normalizeGeneratedPresentationImages } from '../../src/generate/generatedPresentationImages';

describe('normalizeGeneratedPresentationImages', () => {
  it('keeps a verified remote image URL', async () => {
    const fetchFn = vi.fn(async () => new Response(null, {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
      },
    }));

    const result = await normalizeGeneratedPresentationImages('![Chart](https://example.com/chart)', {
      allowRemoteResources: true,
      fetchFn,
    });

    expect(result.markdown).toContain('![Chart](https://example.com/chart)');
    expect(result.replacements).toHaveLength(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('replaces an unverifiable remote image with an image suggestion', async () => {
    const fetchFn = vi.fn(async () => new Response(null, {
      status: 404,
      headers: {
        'content-type': 'text/html',
      },
    }));

    const result = await normalizeGeneratedPresentationImages('![Athena](https://example.com/missing-image)', {
      allowRemoteResources: true,
      fetchFn,
    });

    expect(result.markdown).toContain('> Image suggestion: [Athena](https://example.com/missing-image)');
    expect(result.markdown).not.toContain('![Athena](');
    expect(result.replacements).toEqual([{
      alt: 'Athena',
      originalTarget: 'https://example.com/missing-image',
      reason: 'unverifiable-remote',
    }]);
  });

  it('retries a throttled image probe and keeps the URL when a later attempt succeeds', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      }));

    const result = await normalizeGeneratedPresentationImages('![Roadmap](https://example.com/roadmap.png)', {
      allowRemoteResources: true,
      fetchFn,
    });

    expect(result.replacements).toHaveLength(0);
    expect(result.markdown).toContain('![Roadmap](https://example.com/roadmap.png)');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('replaces remote images when remote resources are disabled', async () => {
    const fetchFn = vi.fn();

    const result = await normalizeGeneratedPresentationImages('![Temple](https://example.com/temple.jpg)', {
      allowRemoteResources: false,
      fetchFn,
    });

    expect(result.markdown).toContain('> Image suggestion: [Temple](https://example.com/temple.jpg)');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.replacements[0]?.reason).toBe('remote-disallowed');
  });

  it('replaces invented local image paths that were not supplied by the user', async () => {
    const result = await normalizeGeneratedPresentationImages('![Diagram](images/guessed-diagram.png)', {
      allowRemoteResources: true,
      providedImageSource: 'Build a deck about platform strategy',
      fetchFn: vi.fn(),
    });

    expect(result.markdown).toContain('> Image suggestion: Diagram');
    expect(result.replacements[0]?.reason).toBe('invented-local');
  });

  it('keeps a user-supplied image target unchanged', async () => {
    const fetchFn = vi.fn();

    const result = await normalizeGeneratedPresentationImages('![Logo](https://cdn.example.com/logo.svg)', {
      allowRemoteResources: true,
      providedImageSource: 'Use the existing brand logo from https://cdn.example.com/logo.svg on the cover slide.',
      fetchFn,
    });

    expect(result.replacements).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBuilderConfig: vi.fn(),
  getOptions: vi.fn(),
  getStimpies: vi.fn(),
  getPacks: vi.fn(),
  getHoodie: vi.fn(),
}));

vi.mock('@/lib/data', () => mocks);
vi.mock('@/features/builder/BuilderClient', () => ({ BuilderClient: () => null }));

import BuilderPage, { generateMetadata } from '@/app/builder/page';

const upcoming = {
  id: 9,
  slug: 'future-stimpie',
  name: 'Future Stimpie',
  type: 'LIMITED',
  priceCents: 1200,
  story: '',
  images: [],
  artworkUrl: 'https://cdn.example.test/uploads/future.webp',
  artworkWidth: 800,
  artworkHeight: 1250,
  drop: { slug: 'future-drop', name: 'Future Drop', accentHex: '#FFE45C' },
  status: 'UPCOMING',
  remaining: null,
  purchasable: false,
};

beforeEach(() => {
  mocks.getBuilderConfig.mockReset().mockResolvedValue({ mode: '2D', effectiveMode: '2D', defaultView: '2D', hoodie: null, model3d: null, colors: [], stimpieTextures: [] });
  mocks.getOptions.mockReset().mockResolvedValue({ colors: [], sizes: [] });
  mocks.getStimpies.mockReset().mockResolvedValue([upcoming]);
  mocks.getPacks.mockReset().mockResolvedValue([]);
  mocks.getHoodie.mockReset();
});

describe('Builder shared upcoming preview', () => {
  it('loads a shared upcoming Stimpie into the page data and metadata', async () => {
    const element = (await BuilderPage({ searchParams: Promise.resolve({ stimpie: 'future-stimpie' }) })) as unknown as ReactElement<{
      children: ReactElement<{ data: { stimpies: Array<{ slug: string; status: string; artworkUrl: string }> } }>;
    }>;
    expect(mocks.getStimpies).toHaveBeenCalledWith({ includeSoldOut: true, includeUpcoming: true, includeEnded: false });
    const builder = element.props.children;
    expect(builder.props.data.stimpies[0]).toMatchObject({ slug: 'future-stimpie', status: 'UPCOMING', artworkUrl: upcoming.artworkUrl });

    const metadata = await generateMetadata({ searchParams: Promise.resolve({ stimpie: 'future-stimpie' }) });
    expect(metadata.title).toContain('Future Stimpie on a Stimpy hoodie');
    expect(metadata.openGraph?.images).toContainEqual(expect.objectContaining({ url: upcoming.artworkUrl }));
  });

  it('does not add upcoming items to an ordinary Builder request', async () => {
    await BuilderPage({ searchParams: Promise.resolve({}) });
    expect(mocks.getStimpies).toHaveBeenCalledWith({ includeSoldOut: true, includeUpcoming: false, includeEnded: false });
  });
});

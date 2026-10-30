/** Pre-encoded, versioned assets: no image transformation on the first request. */
function campaignImage(variant: 'desktop' | 'mobile' | 'builder', widths: number[], width: number, height: number) {
  const url = (size: number, format: 'avif' | 'webp') => `/images/stimpy-campaign-${variant}-v2-${size}.${format}`;
  return {
    width,
    height,
    src: url(width, 'webp'),
    webpSrcSet: widths.map((size) => `${url(size, 'webp')} ${size}w`).join(', '),
    avifSrcSet: widths.map((size) => `${url(size, 'avif')} ${size}w`).join(', '),
  };
}

export const campaignImages = {
  desktop: campaignImage('desktop', [960, 1440, 1942], 1942, 809),
  mobile: campaignImage('mobile', [480, 768, 1024], 1024, 1536),
  builder: campaignImage('builder', [400, 640, 809], 809, 809),
};

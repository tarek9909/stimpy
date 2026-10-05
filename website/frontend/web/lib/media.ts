/** Content media (step images and videos) is just a URL: decide how to render it from the extension. */
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  return !!url && VIDEO_EXT.test(url);
}

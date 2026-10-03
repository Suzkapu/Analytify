/** Browser-level return paths include the mount point; Router commands do not. */
export function previewReturnPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return '/new/playlists';
  return /^\/new(?:[/?#]|$)/.test(path) ? path : '/new' + path;
}

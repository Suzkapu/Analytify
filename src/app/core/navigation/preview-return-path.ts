/** Normalize browser return paths, retaining old preview links at the root. */
export function previewReturnPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) return '/playlists';
  const rootPath = path.replace(/^\/new(?=[/?#]|$)/, '');
  if (!rootPath || rootPath.startsWith('?') || rootPath.startsWith('#')) return '/' + rootPath;
  return rootPath.startsWith('//') ? '/playlists' : rootPath;
}

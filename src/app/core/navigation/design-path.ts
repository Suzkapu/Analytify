export const designCommands = (...segments: string[]): string[] =>
  [`/${segments[0]}`, ...segments.slice(1)];

export const designPath = (...segments: string[]): string =>
  designCommands(...segments).join('/');

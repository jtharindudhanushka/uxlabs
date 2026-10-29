// Section renders live in src/assets/sections/<name>.webp. Components ask for a
// render by name and fall back to a placeholder until the file exists.
const files = import.meta.glob<{ default: ImageMetadata }>('../assets/sections/*.webp', { eager: true });

export function sectionImage(name: string): ImageMetadata | undefined {
  const hit = Object.entries(files).find(([path]) => path.endsWith(`/${name}.webp`));
  return hit?.[1].default;
}

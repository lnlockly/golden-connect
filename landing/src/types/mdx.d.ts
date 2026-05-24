/// <reference types="vite/client" />

// MDX module declarations — matched by both @mdx-js/rollup (gives us
// the React component) and our frontmatter convention (frontmatter is
// extracted at build time by scripts/build-kb-index.mjs + injected via
// the mdx plugin options when we move to that pipeline). Until then we
// read frontmatter from the generated kb-index.{lang}.json, so the
// export here is just a compile-time escape hatch.

declare module '*.mdx' {
  import type { ComponentType } from 'react';
  export const frontmatter: Record<string, unknown>;
  const MDXComponent: ComponentType;
  export default MDXComponent;
}

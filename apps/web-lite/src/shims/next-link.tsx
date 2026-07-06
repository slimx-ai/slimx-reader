// Stand-in for next/link under the hash router: `/reader/x` becomes `#/reader/x`. Substituted at
// resolve time by the sharedWebSources plugin, so apps/web components stay untouched.
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
};

export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={`#${href}`} {...rest}>
      {children}
    </a>
  );
}

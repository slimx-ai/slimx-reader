// Minimal hash router: '#/' -> library, '#/reader/<id>' -> reader. Hash-based so the built app
// works from any static host without server-side rewrites.
import { useEffect, useState } from 'react';

export type Route = { name: 'library' } | { name: 'reader'; documentId: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const match = /^\/reader\/([^/?#]+)/.exec(path);
  if (match) return { name: 'reader', documentId: decodeURIComponent(match[1]) };
  return { name: 'library' };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

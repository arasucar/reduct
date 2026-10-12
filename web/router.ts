import { useEffect, useRef, useState } from 'react';

export type Route = { id: string; tab: 'document' | 'history'; thread?: string };
export const defaultRoute: Route = { id: '', tab: 'document' };

export function parseRoute(hash: string): Route {
  const match = /^#\/documents\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!match) return defaultRoute;
  try {
    const id = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return defaultRoute;
    const query = new URLSearchParams(match[2]);
    const tab = query.get('tab');
    const thread = query.get('thread');
    return { id, tab: tab === 'history' ? tab : 'document',
      ...(thread && /^[A-Za-z0-9_-]+$/.test(thread) ? { thread } : {}) };
  } catch { return defaultRoute; }
}

export function routeHash(route: Route): string {
  if(!route.id)return '';
  const query = new URLSearchParams();
  if (route.tab !== 'document') query.set('tab', route.tab);
  if (route.thread) query.set('thread', route.thread);
  return `#/documents/${encodeURIComponent(route.id)}${query.size ? '?' + query : ''}`;
}

export function useDocumentRouter(canLeave: () => boolean) {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const current = useRef(route);
  const position = useRef(0);
  const guard = useRef(canLeave);
  guard.current = canLeave;
  useEffect(() => {
    position.current = Number(window.history.state?.reductPosition ?? 0);
    window.history.replaceState({ ...window.history.state, reductPosition: position.current }, '', routeHash(current.current));
    function restore() {
      const next = parseRoute(window.location.hash);
      if (routeHash(next) === routeHash(current.current)) return;
      const nextPosition = window.history.state?.reductPosition;
      if (!guard.current()) {
        if (typeof nextPosition === 'number' && nextPosition !== position.current) window.history.go(position.current - nextPosition);
        else window.history.pushState({ reductPosition: position.current }, '', routeHash(current.current));
        return;
      }
      position.current = typeof nextPosition === 'number' ? nextPosition : position.current + 1;
      current.current = next;
      setRoute(next);
    }
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  function navigate(next: Route) {
    if (routeHash(next) === routeHash(current.current)) return true;
    if (!guard.current()) return false;
    position.current++;
    window.history.pushState({ reductPosition: position.current }, '', routeHash(next));
    current.current = next;
    setRoute(next);
    return true;
  }
  return { route, navigate };
}

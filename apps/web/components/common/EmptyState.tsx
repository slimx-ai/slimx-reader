import type { ReactNode } from 'react';

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      {icon ? <div className="empty-state-icon" aria-hidden="true">{icon}</div> : null}
      <p className="empty-state-title">{title}</p>
      {children ? <div className="empty-state-body muted">{children}</div> : null}
    </div>
  );
}

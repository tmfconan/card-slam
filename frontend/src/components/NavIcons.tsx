type IconProps = {
  className?: string;
};

const baseProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const defaultClass = "w-4 h-4";

export function KanbanIcon({ className = defaultClass }: IconProps) {
  return (
    <svg {...baseProps} className={className} data-testid="nav-icon-kanban">
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="10" rx="1" />
      <rect x="17" y="4" width="4" height="13" rx="1" />
    </svg>
  );
}

export function ListIcon({ className = defaultClass }: IconProps) {
  return (
    <svg {...baseProps} className={className} data-testid="nav-icon-list">
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="8" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

export function CalendarIcon({ className = defaultClass }: IconProps) {
  return (
    <svg {...baseProps} className={className} data-testid="nav-icon-calendar">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

export function CategoriesIcon({ className = defaultClass }: IconProps) {
  return (
    <svg {...baseProps} className={className} data-testid="nav-icon-categories">
      <path d="M9.568 3H5a2 2 0 0 0-2 2v4.568a2 2 0 0 0 .586 1.414l9 9a2 2 0 0 0 2.828 0l4.568-4.568a2 2 0 0 0 0-2.828l-9-9A2 2 0 0 0 9.568 3Z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function ReportsIcon({ className = defaultClass }: IconProps) {
  return (
    <svg {...baseProps} className={className} data-testid="nav-icon-reports">
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="12" width="3" height="8" />
      <rect x="11" y="8" width="3" height="12" />
      <rect x="16" y="4" width="3" height="16" />
    </svg>
  );
}

export function UsersIcon({ className = defaultClass }: IconProps) {
  return (
    <svg {...baseProps} className={className} data-testid="nav-icon-users">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5a4.5 4.5 0 0 1 5.5 4.5" />
    </svg>
  );
}

export function GettingStartedIcon({ className = defaultClass }: IconProps) {
  return (
    <svg {...baseProps} className={className} data-testid="nav-icon-getting-started">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" />
      <line x1="12" y1="16.5" x2="12" y2="16.5" />
    </svg>
  );
}

export function FeatureRequestsIcon({ className = defaultClass }: IconProps) {
  return (
    <svg
      {...baseProps}
      className={className}
      data-testid="nav-icon-feature-requests"
    >
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

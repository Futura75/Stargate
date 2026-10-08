export type Theme = "light" | "dark" | "system";
export type SearchEngine = "google" | "ddg" | "bing";
export type FaviconSource = "off" | "google-s2" | "duckduckgo";
export type FaviconSize = "sm" | "md" | "lg";
export type BlockTitleSize = "sm" | "md" | "lg";

export interface Settings {
  theme: Theme;
  searchEngine: SearchEngine;
  faviconSource: FaviconSource;
}

export interface Background {
  dataUrl: string | null;
  alpha: number;
}

export interface Favicon {
  dataUrl: string;
  source: "custom" | "direct" | "google-s2" | "duckduckgo";
  fetchedAt: string;
}

export interface Link {
  id: string;
  title: string;
  url: string;
  favicon?: Favicon;
}

export interface Block {
  id: string;
  title: string;
  description?: string;
  faviconSize?: FaviconSize;
  links: Link[];
}

export interface Column {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  due: string | null;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: Task[];
}

export interface WorkspaceLayout {
  /** Number of columns in the Links view; 0 means auto (wrap to fit). */
  columnCount: number;
  /** true = full-width layout; false = centered fixed max-width. */
  fluid: boolean;
  /** Gap between columns in px. */
  columnGap: number;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  color: string;
  background: Background;
  columns: Column[];
  kanban: { columns: KanbanColumn[] };
  layout?: WorkspaceLayout;
  blockTitleSize?: BlockTitleSize;
}

export interface StargateState {
  schemaVersion: "2";
  app: { name: string; version: string };
  exportedAt: string;
  settings: Settings;
  workspaces: Workspace[];
}

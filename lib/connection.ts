export type ConnectionMode = "full" | "readonly" | "checking";

export interface ConnectionState {
  mode: ConnectionMode;
  tunnelUrl: string | null;
  checkedAt: string;
}

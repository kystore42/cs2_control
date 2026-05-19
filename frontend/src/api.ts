import { invoke } from "@tauri-apps/api/core";

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  subscription_tier: string;
}

export interface AuthResponse {
  user: ApiUser;
  access_token: string;
  refresh_token: string;
}

export interface DetectedAccount {
  account_id: number;
  account_name: string;
  persona_name: string;
  userdata_path: string;
  inventory_file: string | null;
  is_installed_cs2: boolean;
}

export interface DetectionResult {
  success: boolean;
  accounts: DetectedAccount[];
  total_found: number;
  error: string | null;
}

export interface CloudSyncResult {
  detected: number;
  synced: number;
  error: string | null;
}

export interface CloudAccount {
  id: string;
  steam_id: string;
  account_name: string;
  persona_name: string;
  is_primary: boolean;
  sync_status: string;
}

export interface BulkCreateResult {
  created: number;
  total: number;
}

export interface ValuedItem {
  hash_name: string;
  lowest_price: number | null;
  median_price: number | null;
  volume: number | null;
  profit_margin: number | null;
  error: string | null;
}

export interface InventoryValuation {
  items: ValuedItem[];
  profitable: ValuedItem[];
  total_value: number;
  item_count: number;
  priced_count: number;
}

export const api = {
  login: (email: string, password: string) =>
    invoke<AuthResponse>("login", { email, password }),

  register: (email: string, password: string, fullName: string) =>
    invoke<AuthResponse>("register", { email, password, fullName }),

  detectSteamAccounts: () => invoke<DetectionResult>("detect_steam_accounts"),

  syncAccountsToCloud: (accessToken: string) =>
    invoke<CloudSyncResult>("sync_accounts_to_cloud", { accessToken }),

  addSteamAccount: (
    accessToken: string,
    steamId: string,
    accountName: string,
    personaName: string
  ) =>
    invoke<BulkCreateResult>("add_steam_account", {
      accessToken,
      steamId,
      accountName,
      personaName,
    }),

  listCloudAccounts: (accessToken: string) =>
    invoke<CloudAccount[]>("list_cloud_accounts", { accessToken }),

  valuateAccountInventory: (accountId: number) =>
    invoke<InventoryValuation>("valuate_account_inventory", { accountId }),

  valuateHashNames: (hashNames: string[]) =>
    invoke<InventoryValuation>("valuate_hash_names", { hashNames }),
};

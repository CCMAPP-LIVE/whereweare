export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      availability: {
        Row: {
          day: string
          id: string
          note: string | null
          slot: Database["public"]["Enums"]["availability_slot"]
          status: Database["public"]["Enums"]["availability_status"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          day: string
          id?: string
          note?: string | null
          slot: Database["public"]["Enums"]["availability_slot"]
          status?: Database["public"]["Enums"]["availability_status"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          day?: string
          id?: string
          note?: string | null
          slot?: Database["public"]["Enums"]["availability_slot"]
          status?: Database["public"]["Enums"]["availability_status"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_accounts: {
        Row: {
          account_email: string | null
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["calendar_provider"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          id?: string
          provider: Database["public"]["Enums"]["calendar_provider"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["calendar_provider"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_oauth_tokens: {
        Row: {
          calendar_account_id: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          calendar_account_id: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          calendar_account_id?: string
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendars: {
        Row: {
          calendar_account_id: string
          color: string | null
          created_at: string
          enabled: boolean
          external_id: string
          id: string
          is_primary: boolean
          summary: string | null
        }
        Insert: {
          calendar_account_id: string
          color?: string | null
          created_at?: string
          enabled?: boolean
          external_id: string
          id?: string
          is_primary?: boolean
          summary?: string | null
        }
        Update: {
          calendar_account_id?: string
          color?: string | null
          created_at?: string
          enabled?: boolean
          external_id?: string
          id?: string
          is_primary?: boolean
          summary?: string | null
        }
        Relationships: []
      }
      day_times: {
        Row: {
          day: string
          leave_time: string | null
          return_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          day: string
          leave_time?: string | null
          return_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          day?: string
          leave_time?: string | null
          return_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      life_calendar_sync: {
        Row: {
          day: string
          google_event_id: string | null
          id: string
          last_synced_at: string | null
          user_id: string
        }
        Insert: {
          day: string
          google_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          user_id: string
        }
        Update: {
          day?: string
          google_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          timezone: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      availability_slot: "am" | "pm" | "eve"
      availability_status: "home" | "office" | "away" | "travelling"
      calendar_provider: "google" | "microsoft"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T]

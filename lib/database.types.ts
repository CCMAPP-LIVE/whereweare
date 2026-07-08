export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
        Relationships: [
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      birthdays: {
        Row: {
          created_at: string
          day: number
          id: string
          month: number
          name: string
          notes: string | null
          sort_order: number
          updated_at: string
          year: number | null
        }
        Insert: {
          created_at?: string
          day: number
          id?: string
          month: number
          name: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          year?: number | null
        }
        Update: {
          created_at?: string
          day?: number
          id?: string
          month?: number
          name?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          year?: number | null
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
        Relationships: [
          {
            foreignKeyName: "calendar_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "calendar_oauth_tokens_calendar_account_id_fkey"
            columns: ["calendar_account_id"]
            isOneToOne: true
            referencedRelation: "calendar_accounts"
            referencedColumns: ["id"]
          },
        ]
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
          label: string | null
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
          label?: string | null
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
          label?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendars_calendar_account_id_fkey"
            columns: ["calendar_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_accounts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "day_times_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      helpers: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          note: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kids: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
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
        Relationships: [
          {
            foreignKeyName: "life_calendar_sync_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          day: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          day: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          day?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_defaults: {
        Row: {
          active: boolean
          created_at: string
          default_assignee_user_id: string | null
          helper_id: string | null
          kid_id: string
          kind: string
          time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_assignee_user_id?: string | null
          helper_id?: string | null
          kid_id: string
          kind: string
          time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string
          default_assignee_user_id?: string | null
          helper_id?: string | null
          kid_id?: string
          kind?: string
          time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_defaults_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_defaults_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      school_events: {
        Row: {
          assignee_user_id: string | null
          created_at: string
          created_by: string | null
          day: string
          google_event_id: string | null
          helper_id: string | null
          id: string
          kid_id: string
          kind: string
          notes: string | null
          time: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string | null
          day: string
          google_event_id?: string | null
          helper_id?: string | null
          id?: string
          kid_id: string
          kind: string
          notes?: string | null
          time: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string | null
          day?: string
          google_event_id?: string | null
          helper_id?: string | null
          id?: string
          kid_id?: string
          kind?: string
          notes?: string | null
          time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_events_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_events_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      school_weeks: {
        Row: {
          is_school_week: boolean
          notes: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          is_school_week?: boolean
          notes?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          is_school_week?: boolean
          notes?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          assignee_user_id: string | null
          created_at: string
          created_by: string | null
          id: string
          position: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      week_events: {
        Row: {
          assignee_user_id: string | null
          created_at: string
          day: string
          end_time: string | null
          google_event_id: string | null
          helper_id: string | null
          id: string
          kid_ids: string[]
          notes: string | null
          start_time: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_user_id?: string | null
          created_at?: string
          day: string
          end_time?: string | null
          google_event_id?: string | null
          helper_id?: string | null
          id?: string
          kid_ids?: string[]
          notes?: string | null
          start_time?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_user_id?: string | null
          created_at?: string
          day?: string
          end_time?: string | null
          google_event_id?: string | null
          helper_id?: string | null
          id?: string
          kid_ids?: string[]
          notes?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_events_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      week_notes: {
        Row: {
          next_week_note: string | null
          this_week_note: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          next_week_note?: string | null
          this_week_note?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          next_week_note?: string | null
          this_week_note?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      availability_slot: "am" | "pm" | "eve"
      availability_status: "home" | "office" | "away" | "travelling"
      calendar_provider: "google" | "microsoft"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      availability_slot: ["am", "pm", "eve"],
      availability_status: ["home", "office", "away", "travelling"],
      calendar_provider: ["google", "microsoft"],
    },
  },
} as const

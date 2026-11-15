export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      check_ins: {
        Row: {
          acknowledged_at: string | null
          consented_at: string | null
          due_at: string
          enabled: boolean
          id: string
          priority: Database["public"]["Enums"]["priority"]
          revision: number
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          consented_at?: string | null
          due_at: string
          enabled?: boolean
          id?: string
          priority?: Database["public"]["Enums"]["priority"]
          revision?: number
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          consented_at?: string | null
          due_at?: string
          enabled?: boolean
          id?: string
          priority?: Database["public"]["Enums"]["priority"]
          revision?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      communication_metadata: {
        Row: {
          attempt_id: string | null
          channel: Database["public"]["Enums"]["channel"]
          event: string
          id: string
          metadata: Json
          occurred_at: string
          provider_id: string | null
          user_id: string
        }
        Insert: {
          attempt_id?: string | null
          channel: Database["public"]["Enums"]["channel"]
          event: string
          id?: string
          metadata?: Json
          occurred_at?: string
          provider_id?: string | null
          user_id: string
        }
        Update: {
          attempt_id?: string | null
          channel?: Database["public"]["Enums"]["channel"]
          event?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          provider_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_metadata_attempt_id_user_id_fkey"
            columns: ["attempt_id", "user_id"]
            isOneToOne: false
            referencedRelation: "notification_attempts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "communication_metadata_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      communication_rules: {
        Row: {
          critical_channel: Database["public"]["Enums"]["channel"]
          critical_fallback_channel:
            | Database["public"]["Enums"]["channel"]
            | null
          critical_fallback_seconds: number | null
          grace_seconds: number
          high_call_seconds: number
          id: string
          low_message: boolean
          max_calls_per_day: number
          medium_follow_up_seconds: number | null
          quiet_end: string | null
          quiet_start: string | null
          user_id: string
        }
        Insert: {
          critical_channel?: Database["public"]["Enums"]["channel"]
          critical_fallback_channel?:
            | Database["public"]["Enums"]["channel"]
            | null
          critical_fallback_seconds?: number | null
          grace_seconds?: number
          high_call_seconds?: number
          id?: string
          low_message?: boolean
          max_calls_per_day?: number
          medium_follow_up_seconds?: number | null
          quiet_end?: string | null
          quiet_start?: string | null
          user_id: string
        }
        Update: {
          critical_channel?: Database["public"]["Enums"]["channel"]
          critical_fallback_channel?:
            | Database["public"]["Enums"]["channel"]
            | null
          critical_fallback_seconds?: number | null
          grace_seconds?: number
          high_call_seconds?: number
          id?: string
          low_message?: boolean
          max_calls_per_day?: number
          medium_follow_up_seconds?: number | null
          quiet_end?: string | null
          quiet_start?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      device_action_logs: {
        Row: {
          confirmed_at: string | null
          created_at: string
          device_id: string
          id: string
          requested_on: boolean
          status: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          device_id: string
          id?: string
          requested_on: boolean
          status: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          device_id?: string
          id?: string
          requested_on?: boolean
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_action_logs_device_id_user_id_fkey"
            columns: ["device_id", "user_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "device_action_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      devices: {
        Row: {
          entity_id: string
          id: string
          integration_id: string | null
          is_on: boolean
          kind: string
          name: string
          permitted: boolean
          source: string
          user_id: string
        }
        Insert: {
          entity_id: string
          id?: string
          integration_id?: string | null
          is_on?: boolean
          kind?: string
          name: string
          permitted?: boolean
          source?: string
          user_id: string
        }
        Update: {
          entity_id?: string
          id?: string
          integration_id?: string | null
          is_on?: boolean
          kind?: string
          name?: string
          permitted?: boolean
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_integration_id_user_id_fkey"
            columns: ["integration_id", "user_id"]
            isOneToOne: false
            referencedRelation: "home_assistant_integrations"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      home_assistant_integrations: {
        Row: {
          base_url: string | null
          enabled: boolean
          id: string
          name: string
          source: string
          user_id: string
        }
        Insert: {
          base_url?: string | null
          enabled?: boolean
          id?: string
          name: string
          source?: string
          user_id: string
        }
        Update: {
          base_url?: string | null
          enabled?: boolean
          id?: string
          name?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_assistant_integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      home_events: {
        Row: {
          acknowledged_at: string | null
          description: string
          id: string
          occurred_at: string
          outreach_eligible: boolean
          revision: number
          severity: Database["public"]["Enums"]["priority"]
          source: string
          type: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          description: string
          id?: string
          occurred_at?: string
          outreach_eligible?: boolean
          revision?: number
          severity?: Database["public"]["Enums"]["priority"]
          source: string
          type: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          description?: string
          id?: string
          occurred_at?: string
          outreach_eligible?: boolean
          revision?: number
          severity?: Database["public"]["Enums"]["priority"]
          source?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_attempts: {
        Row: {
          channel: Database["public"]["Enums"]["channel"]
          check_in_id: string | null
          created_at: string
          error_code: string | null
          home_event_id: string | null
          id: string
          idempotency_key: string
          last_claimed_at: string
          outcome_at: string | null
          provider_id: string | null
          reminder_id: string | null
          revision: number
          simulated: boolean
          stage: Database["public"]["Enums"]["notification_stage"]
          status: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel"]
          check_in_id?: string | null
          created_at?: string
          error_code?: string | null
          home_event_id?: string | null
          id?: string
          idempotency_key: string
          last_claimed_at?: string
          outcome_at?: string | null
          provider_id?: string | null
          reminder_id?: string | null
          revision: number
          simulated?: boolean
          stage: Database["public"]["Enums"]["notification_stage"]
          status?: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel"]
          check_in_id?: string | null
          created_at?: string
          error_code?: string | null
          home_event_id?: string | null
          id?: string
          idempotency_key?: string
          last_claimed_at?: string
          outcome_at?: string | null
          provider_id?: string | null
          reminder_id?: string | null
          revision?: number
          simulated?: boolean
          stage?: Database["public"]["Enums"]["notification_stage"]
          status?: Database["public"]["Enums"]["delivery_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_attempts_check_in_id_user_id_fkey"
            columns: ["check_in_id", "user_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "notification_attempts_home_event_id_user_id_fkey"
            columns: ["home_event_id", "user_id"]
            isOneToOne: false
            referencedRelation: "home_events"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "notification_attempts_reminder_id_user_id_fkey"
            columns: ["reminder_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "notification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          destination: string | null
          opted_in_channels: Database["public"]["Enums"]["channel"][]
          outreach_enabled: boolean
          timezone: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          destination?: string | null
          opted_in_channels?: Database["public"]["Enums"]["channel"][]
          outreach_enabled?: boolean
          timezone?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          destination?: string | null
          opted_in_channels?: Database["public"]["Enums"]["channel"][]
          outreach_enabled?: boolean
          timezone?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      reminder_history: {
        Row: {
          after_state: Json
          before_state: Json | null
          created_at: string
          id: string
          reminder_id: string
          revision: number
          user_id: string
        }
        Insert: {
          after_state: Json
          before_state?: Json | null
          created_at?: string
          id?: string
          reminder_id: string
          revision: number
          user_id: string
        }
        Update: {
          after_state?: Json
          before_state?: Json | null
          created_at?: string
          id?: string
          reminder_id?: string
          revision?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_history_reminder_id_user_id_fkey"
            columns: ["reminder_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "reminder_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reminders: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          due_at: string
          id: string
          priority: Database["public"]["Enums"]["priority"]
          revision: number
          snoozed_until: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          due_at: string
          id?: string
          priority?: Database["public"]["Enums"]["priority"]
          revision?: number
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["priority"]
          revision?: number
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      structured_memory: {
        Row: {
          approved_at: string
          created_at: string
          expires_at: string | null
          id: string
          key: string
          user_id: string
          value: Json
        }
        Insert: {
          approved_at: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key: string
          user_id: string
          value: Json
        }
        Update: {
          approved_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "structured_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_notification_delivery: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      claim_escalation_attempt: { Args: { p_job: Json }; Returns: Json }
      list_escalation_candidates: { Args: { p_limit?: number }; Returns: Json }
    }
    Enums: {
      channel: "imessage" | "facetime"
      delivery_status:
        | "pending"
        | "sending"
        | "unknown"
        | "accepted"
        | "answered"
        | "completed"
        | "unanswered"
        | "failed"
        | "simulated"
        | "canceled"
      notification_stage: "initial" | "follow_up" | "escalation" | "fallback"
      priority: "low" | "medium" | "high" | "critical"
      reminder_status: "pending" | "snoozed" | "completed" | "canceled"
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
      channel: ["imessage", "facetime"],
      delivery_status: [
        "pending",
        "sending",
        "unknown",
        "accepted",
        "answered",
        "completed",
        "unanswered",
        "failed",
        "simulated",
        "canceled",
      ],
      notification_stage: ["initial", "follow_up", "escalation", "fallback"],
      priority: ["low", "medium", "high", "critical"],
      reminder_status: ["pending", "snoozed", "completed", "canceled"],
    },
  },
} as const

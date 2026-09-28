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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      deposit_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          purpose: string
          status: string
          updated_at: string
          user_email: string | null
          user_id: string
          utr_number: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          purpose?: string
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
          utr_number: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          purpose?: string
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
          utr_number?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ads_watched_today: number
          bank_account_no: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bonus_spin_available: boolean
          bonus_spin_granted: boolean
          claimed_milestones: number[]
          created_at: string
          default_upi: string | null
          dob: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          is_vip: boolean
          last_ad_at: string | null
          last_ad_date: string | null
          last_login_date: string | null
          last_spin_result: string | null
          referral_code: string
          referred_by: string | null
          smart_coins: number
          smart_money: number
          spin_date: string | null
          spins_used: number
          streak: number
          total_coins_earned: number
          total_deposited: number
          total_withdrawn: number
          updated_at: string
          vip_since: string | null
        }
        Insert: {
          ads_watched_today?: number
          bank_account_no?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bonus_spin_available?: boolean
          bonus_spin_granted?: boolean
          claimed_milestones?: number[]
          created_at?: string
          default_upi?: string | null
          dob?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          is_vip?: boolean
          last_ad_at?: string | null
          last_ad_date?: string | null
          last_login_date?: string | null
          last_spin_result?: string | null
          referral_code?: string
          referred_by?: string | null
          smart_coins?: number
          smart_money?: number
          spin_date?: string | null
          spins_used?: number
          streak?: number
          total_coins_earned?: number
          total_deposited?: number
          total_withdrawn?: number
          updated_at?: string
          vip_since?: string | null
        }
        Update: {
          ads_watched_today?: number
          bank_account_no?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bonus_spin_available?: boolean
          bonus_spin_granted?: boolean
          claimed_milestones?: number[]
          created_at?: string
          default_upi?: string | null
          dob?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          is_vip?: boolean
          last_ad_at?: string | null
          last_ad_date?: string | null
          last_login_date?: string | null
          last_spin_result?: string | null
          referral_code?: string
          referred_by?: string | null
          smart_coins?: number
          smart_money?: number
          spin_date?: string | null
          spins_used?: number
          streak?: number
          total_coins_earned?: number
          total_deposited?: number
          total_withdrawn?: number
          updated_at?: string
          vip_since?: string | null
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          created_at: string
          id: string
          saved_amount: number
          status: string
          target_amount: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          saved_amount?: number
          status?: string
          target_amount: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          saved_amount?: number
          status?: string
          target_amount?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          coins: number
          created_at: string
          description: string
          id: string
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          coins?: number
          created_at?: string
          description: string
          id?: string
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          coins?: number
          created_at?: string
          description?: string
          id?: string
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          payout_utr: string | null
          status: string
          updated_at: string
          upi_id: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payout_utr?: string | null
          status?: string
          updated_at?: string
          upi_id: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payout_utr?: string | null
          status?: string
          updated_at?: string
          upi_id?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust: {
        Args: {
          coins_in: number
          money_in: number
          note_in: string
          target_in: string
        }
        Returns: undefined
      }
      admin_payout: {
        Args: { approve_in: boolean; req_in: string; utr_in: string }
        Returns: undefined
      }
      admin_review_deposit: {
        Args: { approve_in: boolean; req_in: string }
        Returns: undefined
      }
      admin_review_withdrawal: {
        Args: { approve_in: boolean; req_in: string }
        Returns: undefined
      }
      break_goal: { Args: { goal_in: string; uid_in: string }; Returns: number }
      buy_vip: { Args: { uid_in: string }; Returns: undefined }
      check_in_wallet: { Args: { uid_in: string }; Returns: number }
      claim_streak_reward: {
        Args: { milestone_in: number; uid_in: string }
        Returns: number
      }
      cleanup_old_activity_logs: { Args: never; Returns: number }
      convert_coins: { Args: { uid_in: string }; Returns: number }
      create_goal: {
        Args: { target_in: number; title_in: string; uid_in: string }
        Returns: undefined
      }
      fund_goal: {
        Args: { amount_in: number; goal_in: string; uid_in: string }
        Returns: undefined
      }
      grant_spin_ad: { Args: { uid_in: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_user: {
        Args: { body_in: string; title_in: string; uid_in: string }
        Returns: undefined
      }
      redeem_referral: {
        Args: { code_in: string; uid_in: string }
        Returns: undefined
      }
      request_deposit: {
        Args: { amount_in: number; uid_in: string; utr_in: string }
        Returns: undefined
      }
      request_deposit_for: {
        Args: {
          amount_in: number
          purpose_in: string
          uid_in: string
          utr_in: string
        }
        Returns: undefined
      }
      request_withdrawal: {
        Args: { amount_in: number; uid_in: string; upi_in: string }
        Returns: undefined
      }
      spin_wheel: { Args: { uid_in: string }; Returns: number }
      watch_video_ad: { Args: { uid_in: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const

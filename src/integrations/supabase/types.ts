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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      evidence_points: {
        Row: {
          book_evidence: string | null
          brief_id: string
          claim: string
          confidence: string
          created_at: string
          difference_note: string | null
          evidence_type: string
          exact_quote: string | null
          id: string
          lexicon_support: string | null
          movie_evidence: string | null
          paraphrase: string | null
          source_file: string | null
          source_type: string
          starred: boolean
        }
        Insert: {
          book_evidence?: string | null
          brief_id: string
          claim: string
          confidence?: string
          created_at?: string
          difference_note?: string | null
          evidence_type?: string
          exact_quote?: string | null
          id?: string
          lexicon_support?: string | null
          movie_evidence?: string | null
          paraphrase?: string | null
          source_file?: string | null
          source_type: string
          starred?: boolean
        }
        Update: {
          book_evidence?: string | null
          brief_id?: string
          claim?: string
          confidence?: string
          created_at?: string
          difference_note?: string | null
          evidence_type?: string
          exact_quote?: string | null
          id?: string
          lexicon_support?: string | null
          movie_evidence?: string | null
          paraphrase?: string | null
          source_file?: string | null
          source_type?: string
          starred?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "evidence_points_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "topic_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      file_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          file_id: string
          id: string
          search_vector: unknown
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          file_id: string
          id?: string
          search_vector?: unknown
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          file_id?: string
          id?: string
          search_vector?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "file_chunks_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "source_files"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_outputs: {
        Row: {
          brief_id: string
          content: string
          created_at: string
          id: string
          step_type: Database["public"]["Enums"]["pipeline_step_type"]
        }
        Insert: {
          brief_id: string
          content: string
          created_at?: string
          id?: string
          step_type: Database["public"]["Enums"]["pipeline_step_type"]
        }
        Update: {
          brief_id?: string
          content?: string
          created_at?: string
          id?: string
          step_type?: Database["public"]["Enums"]["pipeline_step_type"]
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_outputs_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "topic_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_files: {
        Row: {
          created_at: string
          file_size: number | null
          file_type: Database["public"]["Enums"]["source_file_type"]
          id: string
          name: string
          status: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          file_type: Database["public"]["Enums"]["source_file_type"]
          id?: string
          name: string
          status?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          file_size?: number | null
          file_type?: Database["public"]["Enums"]["source_file_type"]
          id?: string
          name?: string
          status?: string
          storage_path?: string
        }
        Relationships: []
      }
      topic_briefs: {
        Row: {
          characters: string[] | null
          comparison_mode: boolean
          created_at: string
          description: string
          emotional_angle: string | null
          focus_areas: string[] | null
          id: string
          priority_sources: string[] | null
          proof_goal: string | null
          target_max_words: number
          target_min_words: number
          target_minutes: number
          thesis: string | null
          title: string
          tone: string | null
          updated_at: string
        }
        Insert: {
          characters?: string[] | null
          comparison_mode?: boolean
          created_at?: string
          description: string
          emotional_angle?: string | null
          focus_areas?: string[] | null
          id?: string
          priority_sources?: string[] | null
          proof_goal?: string | null
          target_max_words?: number
          target_min_words?: number
          target_minutes?: number
          thesis?: string | null
          title: string
          tone?: string | null
          updated_at?: string
        }
        Update: {
          characters?: string[] | null
          comparison_mode?: boolean
          created_at?: string
          description?: string
          emotional_angle?: string | null
          focus_areas?: string[] | null
          id?: string
          priority_sources?: string[] | null
          proof_goal?: string | null
          target_max_words?: number
          target_min_words?: number
          target_minutes?: number
          thesis?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_chunks: {
        Args: { max_results?: number; search_query: string }
        Returns: {
          chunk_index: number
          content: string
          file_id: string
          file_name: string
          file_type: Database["public"]["Enums"]["source_file_type"]
          id: string
          rank: number
        }[]
      }
      search_chunks_by_type: {
        Args: {
          max_results?: number
          search_query: string
          source_type: Database["public"]["Enums"]["source_file_type"]
        }
        Returns: {
          chunk_index: number
          content: string
          file_id: string
          file_name: string
          file_type: Database["public"]["Enums"]["source_file_type"]
          id: string
          rank: number
        }[]
      }
    }
    Enums: {
      pipeline_step_type:
        | "evidence_table"
        | "analysis_memo"
        | "outline"
        | "full_script"
        | "verification"
        | "retrieval"
      source_file_type:
        | "book"
        | "transcript"
        | "instructions"
        | "lexicon"
        | "script_strategy"
        | "competitor_analysis"
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
      pipeline_step_type: [
        "evidence_table",
        "analysis_memo",
        "outline",
        "full_script",
        "verification",
        "retrieval",
      ],
      source_file_type: [
        "book",
        "transcript",
        "instructions",
        "lexicon",
        "script_strategy",
        "competitor_analysis",
      ],
    },
  },
} as const

// Supabase database types — hand-crafted from migrations 001–006.
//
// Once NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN are set,
// replace this file with the generator output:
//
//   npx supabase gen types typescript \
//     --project-id <YOUR_PROJECT_REF> \
//     --schema public \
//     > src/types/supabase.ts
//
// Find your project ref: Supabase dashboard → Settings → General → Reference ID.

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
      // ── profiles ────────────────────────────────────────────────────────────
      profiles: {
        Row: {
          id:          string
          full_name:   string | null
          email:       string | null
          global_role: string
          created_at:  string
          updated_at:  string
        }
        Insert: {
          id:           string
          full_name?:   string | null
          email?:       string | null
          global_role?: string
          created_at?:  string
          updated_at?:  string
        }
        Update: {
          id?:          string
          full_name?:   string | null
          email?:       string | null
          global_role?: string
          created_at?:  string
          updated_at?:  string
        }
        Relationships: []
      }

      // ── schools ──────────────────────────────────────────────────────────────
      schools: {
        Row: {
          id:                  string
          name:                string
          slug:                string
          phone:               string | null
          email:               string | null
          address:             string | null
          subscription_status: string
          created_at:          string
          updated_at:          string
        }
        Insert: {
          id?:                  string
          name:                 string
          slug:                 string
          phone?:               string | null
          email?:               string | null
          address?:             string | null
          subscription_status?: string
          created_at?:          string
          updated_at?:          string
        }
        Update: {
          id?:                  string
          name?:                string
          slug?:                string
          phone?:               string | null
          email?:               string | null
          address?:             string | null
          subscription_status?: string
          created_at?:          string
          updated_at?:          string
        }
        Relationships: []
      }

      // ── school_memberships ───────────────────────────────────────────────────
      school_memberships: {
        Row: {
          id:         string
          user_id:    string
          school_id:  string
          role:       string
          status:     string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?:         string
          user_id:     string
          school_id:   string
          role:        string
          status?:     string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?:         string
          user_id?:    string
          school_id?:  string
          role?:       string
          status?:     string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }

      // ── students ─────────────────────────────────────────────────────────────
      students: {
        Row: {
          id:               string
          school_id:        string
          profile_id:       string | null
          admission_number: string
          first_name:       string
          last_name:        string
          gender:           string | null
          date_of_birth:    string | null
          status:           string
          created_at:       string
          updated_at:       string
        }
        Insert: {
          id?:               string
          school_id:         string
          profile_id?:       string | null
          admission_number:  string
          first_name:        string
          last_name:         string
          gender?:           string | null
          date_of_birth?:    string | null
          status?:           string
          created_at?:       string
          updated_at?:       string
        }
        Update: {
          id?:               string
          school_id?:        string
          profile_id?:       string | null
          admission_number?: string
          first_name?:       string
          last_name?:        string
          gender?:           string | null
          date_of_birth?:    string | null
          status?:           string
          created_at?:       string
          updated_at?:       string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }

      // ── teachers ─────────────────────────────────────────────────────────────
      teachers: {
        Row: {
          id:              string
          school_id:       string
          profile_id:      string | null
          employee_number: string
          first_name:      string
          last_name:       string
          phone:           string | null
          email:           string | null
          status:          string
          created_at:      string
          updated_at:      string
        }
        Insert: {
          id?:              string
          school_id:        string
          profile_id?:      string | null
          employee_number:  string
          first_name:       string
          last_name:        string
          phone?:           string | null
          email?:           string | null
          status?:          string
          created_at?:      string
          updated_at?:      string
        }
        Update: {
          id?:              string
          school_id?:       string
          profile_id?:      string | null
          employee_number?: string
          first_name?:      string
          last_name?:       string
          phone?:           string | null
          email?:           string | null
          status?:          string
          created_at?:      string
          updated_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }

      // ── parents ──────────────────────────────────────────────────────────────
      parents: {
        Row: {
          id:         string
          school_id:  string
          profile_id: string | null
          first_name: string
          last_name:  string
          phone:      string | null
          email:      string | null
          status:     string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?:         string
          school_id:   string
          profile_id?: string | null
          first_name:  string
          last_name:   string
          phone?:      string | null
          email?:      string | null
          status?:     string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?:         string
          school_id?:  string
          profile_id?: string | null
          first_name?: string
          last_name?:  string
          phone?:      string | null
          email?:      string | null
          status?:     string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }

      // ── parent_student_links ─────────────────────────────────────────────────
      parent_student_links: {
        Row: {
          id:           string
          school_id:    string
          parent_id:    string
          student_id:   string
          relationship: string
          created_at:   string
          updated_at:   string
        }
        Insert: {
          id?:           string
          school_id:     string
          parent_id:     string
          student_id:    string
          relationship?: string
          created_at?:   string
          updated_at?:   string
        }
        Update: {
          id?:           string
          school_id?:    string
          parent_id?:    string
          student_id?:   string
          relationship?: string
          created_at?:   string
          updated_at?:   string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }

      // ── login_attempts (migration 004) ───────────────────────────────────────
      login_attempts: {
        Row: {
          id:           string
          email:        string
          ip:           string | null
          attempted_at: string
          succeeded:    boolean
        }
        Insert: {
          id?:           string
          email:         string
          ip?:           string | null
          attempted_at?: string
          succeeded?:    boolean
        }
        Update: {
          id?:           string
          email?:        string
          ip?:           string | null
          attempted_at?: string
          succeeded?:    boolean
        }
        Relationships: []
      }

      // ── audit_logs (migration 005) ───────────────────────────────────────────
      audit_logs: {
        Row: {
          id:            string
          actor_id:      string | null
          actor_email:   string | null
          action:        string
          resource_type: string | null
          resource_id:   string | null
          school_id:     string | null
          metadata:      Json | null
          created_at:    string
        }
        Insert: {
          id?:            string
          actor_id?:      string | null
          actor_email?:   string | null
          action:         string
          resource_type?: string | null
          resource_id?:   string | null
          school_id?:     string | null
          metadata?:      Json | null
          created_at?:    string
        }
        Update: {
          id?:            string
          actor_id?:      string | null
          actor_email?:   string | null
          action?:        string
          resource_type?: string | null
          resource_id?:   string | null
          school_id?:     string | null
          metadata?:      Json | null
          created_at?:    string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }

      // ── notifications (migration 006) ────────────────────────────────────────
      notifications: {
        Row: {
          id:         string
          user_id:    string
          school_id:  string | null
          title:      string
          body:       string | null
          type:       string
          read_at:    string | null
          metadata:   Json
          created_at: string
        }
        Insert: {
          id?:         string
          user_id:     string
          school_id?:  string | null
          title:       string
          body?:       string | null
          type?:       string
          read_at?:    string | null
          metadata?:   Json
          created_at?: string
        }
        Update: {
          id?:         string
          user_id?:    string
          school_id?:  string | null
          title?:      string
          body?:       string | null
          type?:       string
          read_at?:    string | null
          metadata?:   Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      is_super_admin: {
        Args:    Record<PropertyKey, never>
        Returns: boolean
      }
      is_school_member: {
        Args:    { p_school_id: string }
        Returns: boolean
      }
      has_school_role: {
        Args:    { p_school_id: string; p_roles: string[] }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          p_actor_id:      string
          p_actor_email:   string
          p_action:        string
          p_resource_type?: string | null
          p_resource_id?:   string | null
          p_school_id?:     string | null
          p_metadata?:      Json | null
        }
        Returns: undefined
      }
      create_notification: {
        Args: {
          p_user_id:   string
          p_title:     string
          p_body?:     string | null
          p_type?:     string
          p_school_id?: string | null
          p_metadata?:  Json | null
        }
        Returns: string
      }
    }

    Enums: {
      [_ in never]: never
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience aliases used across the app.
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

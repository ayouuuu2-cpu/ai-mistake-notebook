import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isPlaceholderConfig =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('your-project.supabase.co') ||
  supabaseAnonKey === 'your-anon-key'

// 诊断内容默认只保留在当前浏览器会话。作品集部署不会设置这个开关，
// 以避免题干、作答与对话日志被用作行为分析数据。
export const isSupabaseEnabled =
  !isPlaceholderConfig && import.meta.env.VITE_ENABLE_RAW_RECORD_STORAGE === 'true'

export const isAnalyticsEnabled = !isPlaceholderConfig

export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const analyticsSupabase = isAnalyticsEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

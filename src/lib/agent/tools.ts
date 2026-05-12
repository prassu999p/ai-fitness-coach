import { tool } from 'ai'
import { z } from 'zod'
import { addDays, format, parseISO } from 'date-fns'
import { calculateProgressiveOverload } from '@/lib/progressiveOverload'
import { validateProgram } from '@/lib/agent/validateProgram'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createAgentTools(supabase: SupabaseClient, userId: string) {
  return {
    get_user_profile: tool({
      description: 'Get the authenticated user profile and their equipment list',
      inputSchema: z.object({}),
      execute: async (_input: Record<string, never>) => {
        const [{ data: profile }, { data: equipment }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('user_equipment').select('*').eq('user_id', userId),
        ])
        return { profile, equipment: equipment ?? [] }
      },
    }),

    get_workout_history: tool({
      description: 'Get recent workouts. Returns raw Workout[] for days ≤14, PerformanceSummary[] for days >14 to avoid context bloat.',
      inputSchema: z.object({
        days: z.number().int().min(1).max(90),
        summarise: z.boolean().optional().describe('Override: true=always summarise, false=always raw. Default: auto based on days'),
      }),
      execute: async (input: { days: number; summarise?: boolean }) => {
        const { days, summarise } = input
        const since = format(addDays(new Date(), -days), 'yyyy-MM-dd')
        const { data } = await supabase
          .from('workouts')
          .select('*, workout_exercises(*)')
          .eq('user_id', userId)
          .gte('date', since)
          .order('date', { ascending: false })

        const workouts = data ?? []
        const shouldSummarise = summarise ?? days > 14

        if (!shouldSummarise) return { workouts }

        // Build PerformanceSummary per exercise
        const byExercise: Record<string, { weights: number[]; rpes: number[]; sessions: Set<string> }> = {}
        for (const w of workouts) {
          for (const ex of (w.workout_exercises ?? [])) {
            if (!ex.exercise_name) continue
            if (!byExercise[ex.exercise_name]) byExercise[ex.exercise_name] = { weights: [], rpes: [], sessions: new Set() }
            if (ex.weight_kg) byExercise[ex.exercise_name].weights.push(ex.weight_kg)
            if (ex.perceived_effort) byExercise[ex.exercise_name].rpes.push(ex.perceived_effort)
            byExercise[ex.exercise_name].sessions.add(w.id)
          }
        }

        const summaries = Object.entries(byExercise).map(([name, data]) => {
          const weights = data.weights
          const trend = weights.length < 2 ? 'stable'
            : weights[0] > weights[weights.length - 1] ? 'increasing'
            : weights[0] < weights[weights.length - 1] ? 'decreasing'
            : 'stable'
          return {
            exercise_name: name,
            estimated_1rm_trend_kg: weights.length ? weights[0] : null,
            weekly_volume_trend: trend as 'increasing' | 'stable' | 'decreasing',
            last_rpe: data.rpes.length ? data.rpes[0] : null,
            sessions_count: data.sessions.size,
          }
        })

        return { summaries }
      },
    }),

    get_current_program: tool({
      description: 'Get the active training program and the current active program_weeks row',
      inputSchema: z.object({}),
      execute: async (_input: Record<string, never>) => {
        const { data: program } = await supabase
          .from('training_programs')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!program) return { program: null, activeWeek: null }

        const { data: activeWeek } = await supabase
          .from('program_weeks')
          .select('*')
          .eq('program_id', program.id)
          .eq('status', 'active')
          .single()

        return { program, activeWeek: activeWeek ?? null }
      },
    }),

    get_exercise_performance: tool({
      description: 'Get historical logged sets for one exercise, newest first',
      inputSchema: z.object({ exercise_name: z.string() }),
      execute: async (input: { exercise_name: string }) => {
        const { data } = await supabase
          .from('workout_exercises')
          .select('weight_kg, reps, sets, workouts!inner(date, user_id)')
          .eq('workouts.user_id', userId)
          .eq('exercise_name', input.exercise_name)
          .order('created_at', { ascending: false })
          .limit(10)
        return { sets: data ?? [] }
      },
    }),

    calculate_progressive_overload: tool({
      description: 'Calculate recommended weight for an exercise based on history, targets, and last RPE',
      inputSchema: z.object({
        exercise_name: z.string(),
        target_sets: z.number().int(),
        target_reps: z.number().int(),
        last_rpe: z.number().min(1).max(10).optional().describe('RPE from most recent session'),
      }),
      execute: async (input: { exercise_name: string; target_sets: number; target_reps: number; last_rpe?: number }) => {
        const { exercise_name, target_sets, target_reps, last_rpe } = input
        const { data } = await supabase
          .from('workout_exercises')
          .select('weight_kg, reps, perceived_effort, workouts!inner(date, user_id)')
          .eq('workouts.user_id', userId)
          .eq('exercise_name', exercise_name)
          .order('created_at', { ascending: false })
          .limit(6)

        const history = (data ?? []).map((row: any) => ({
          weight_kg: row.weight_kg,
          reps: row.reps,
          date: row.workouts.date,
        }))
        const resolvedRpe = last_rpe ?? (data?.[0]?.perceived_effort ?? null)

        return calculateProgressiveOverload({
          exerciseName: exercise_name,
          targetSets: target_sets,
          targetReps: target_reps,
          history,
          lastRpe: resolvedRpe,
        })
      },
    }),

    create_program: tool({
      description: 'Create a new training program and seed program_weeks rows. Call this once after designing the full block.',
      inputSchema: z.object({
        goal: z.enum(['hypertrophy', 'strength', 'fat_loss', 'endurance', 'general_fitness']),
        duration_weeks: z.number().int().min(4).max(16),
        start_date: z.string().describe('ISO date, e.g. 2026-05-12'),
        phases: z.array(z.object({
          name: z.string(),
          week_range: z.tuple([z.number(), z.number()]),
          focus: z.string(),
          intensity: z.string(),
        })),
        week_plan: z.record(z.string(), z.record(z.string(), z.object({
          focus: z.string(),
          exercises: z.array(z.object({
            name: z.string(),
            sets: z.number().int(),
            reps: z.number().int(),
            weight_kg: z.number().optional(),
          })).optional(),
        }))),
      }),
      execute: async (input: {
        goal: 'hypertrophy' | 'strength' | 'fat_loss' | 'endurance' | 'general_fitness'
        duration_weeks: number
        start_date: string
        phases: Array<{ name: string; week_range: [number, number]; focus: string; intensity: string }>
        week_plan: Record<string, Record<string, { focus: string; exercises?: Array<{ name: string; sets: number; reps: number; weight_kg?: number }> }>>
      }) => {
        const { goal, duration_weeks, start_date, phases, week_plan } = input
        const validation = validateProgram({ goal, duration_weeks, start_date, phases, week_plan })
        if (!validation.valid) {
          return { success: false, validationErrors: validation.errors }
        }
        const normalizedWeekPlan = validation.normalized.week_plan

        const startDate = parseISO(start_date)
        const endDate = addDays(startDate, duration_weeks * 7 - 1)

        const { data: program, error } = await supabase
          .from('training_programs')
          .insert({
            user_id: userId,
            goal,
            duration_weeks,
            start_date,
            end_date: format(endDate, 'yyyy-MM-dd'),
            status: 'active',
            phases,
            week_plan: normalizedWeekPlan,
            model_used: 'claude-sonnet-4-6',
          })
          .select()
          .single()

        if (error || !program) return { success: false, error: error?.message }

        // Deactivate any previous active programs
        await supabase
          .from('training_programs')
          .update({ status: 'paused' })
          .eq('user_id', userId)
          .eq('status', 'active')
          .neq('id', program.id)

        // Seed program_weeks
        const weekRows = Array.from({ length: duration_weeks }, (_, i) => ({
          program_id: program.id,
          user_id: userId,
          week_number: i + 1,
          week_start: format(addDays(startDate, i * 7), 'yyyy-MM-dd'),
          status: i === 0 ? 'active' : 'upcoming',
          prescribed: normalizedWeekPlan[String(i + 1)] ?? null,
        }))

        await supabase.from('program_weeks').insert(weekRows)

        // Update profile goal fields
        await supabase
          .from('profiles')
          .update({ primary_goal: goal, goal_duration_weeks: duration_weeks, goal_set_at: new Date().toISOString() })
          .eq('id', userId)

        return { success: true, programId: program.id }
      },
    }),

    adjust_program_week: tool({
      description: 'Adjust a program week with modified exercises or load. Used during weekly review or when user requests a change.',
      inputSchema: z.object({
        week_number: z.number().int(),
        adjustments: z.record(z.string(), z.unknown()).describe('Partial week_plan override for this week'),
        reasoning: z.string(),
      }),
      execute: async (input: { week_number: number; adjustments: Record<string, unknown>; reasoning: string }) => {
        const { week_number, adjustments, reasoning } = input
        const { data: program } = await supabase
          .from('training_programs')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single()

        if (!program) return { success: false, error: 'no active program' }

        const { error } = await supabase
          .from('program_weeks')
          .update({ adjustment_notes: reasoning, status: 'adjusted', prescribed: adjustments })
          .eq('program_id', program.id)
          .eq('week_number', week_number)

        return { success: !error, error: error?.message }
      },
    }),

    add_trainer_message: tool({
      description: 'Insert a trainer message into the conversation history. Always call this to save your reply.',
      inputSchema: z.object({
        content: z.string(),
        type: z.enum(['chat', 'check_in', 'program_adjustment', 'session_feedback', 'weekly_review']).default('chat'),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async (input: { content: string; type: 'chat' | 'check_in' | 'program_adjustment' | 'session_feedback' | 'weekly_review'; metadata?: Record<string, unknown> }) => {
        const { content, type, metadata } = input
        const { error } = await supabase.from('trainer_messages').insert({
          user_id: userId,
          role: 'trainer',
          content,
          message_type: type,
          metadata: metadata ?? null,
        })
        return { success: !error }
      },
    }),

    get_trainer_history: tool({
      description: 'Get past trainer messages for conversation context, newest first',
      inputSchema: z.object({ limit: z.number().int().min(1).max(50) }),
      execute: async (input: { limit: number }) => {
        const { data } = await supabase
          .from('trainer_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(input.limit)
        return { messages: (data ?? []).reverse() }
      },
    }),

    shift_program: tool({
      description: 'Re-anchor all remaining (non-completed) program_weeks forward by shift_days days. Use when user reports an absence or extended break.',
      inputSchema: z.object({
        shift_days: z.number().int().min(1).max(90).describe('Number of days to push remaining weeks forward'),
        reason: z.string(),
      }),
      execute: async (input: { shift_days: number; reason: string }) => {
        const { shift_days, reason } = input
        const { data: program } = await supabase
          .from('training_programs')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single()

        if (!program) return { success: false, error: 'no active program' }

        const { data: remaining } = await supabase
          .from('program_weeks')
          .select('id, week_start')
          .eq('program_id', program.id)
          .in('status', ['upcoming', 'active'])

        if (!remaining?.length) return { success: true, shifted: 0 }

        const updates = remaining.map((row: { id: string; week_start: string }) => ({
          id: row.id,
          week_start: format(addDays(parseISO(row.week_start), shift_days), 'yyyy-MM-dd'),
          adjustment_notes: `Shifted +${shift_days} days: ${reason}`,
        }))

        for (const upd of updates) {
          await supabase.from('program_weeks').update({ week_start: upd.week_start, adjustment_notes: upd.adjustment_notes }).eq('id', upd.id)
        }

        return { success: true, shifted: updates.length }
      },
    }),
  }
}

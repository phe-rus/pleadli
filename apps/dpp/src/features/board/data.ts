import * as z from 'zod'
import { api, seg } from '@/lib/api'

export const taskStatuses = ['todo', 'doing', 'waiting_police', 'waiting_court', 'done'] as const
export type TaskStatus = (typeof taskStatuses)[number]

export const taskSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string().nullable(),
  title: z.string(),
  note: z.string().nullable(),
  status: z.enum(taskStatuses),
  dueAt: z.number().nullable(),
  assignedTo: z.string().nullable(),
  position: z.number(),
  source: z.enum(['person', 'assist', 'direction']),
  proposed: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
  doneAt: z.number().nullable(),
  fileTitle: z.string().nullable(),
  fileReference: z.string().nullable(),
  assigneeName: z.string().nullable(),
})
export type Task = z.infer<typeof taskSchema>

export type NewTask = {
  prosecutionFileId?: string | null
  title: string
  note?: string | null
  status?: TaskStatus
  dueAt?: number | null
  source?: 'person' | 'assist' | 'direction'
  proposed?: boolean
}

export type TaskChange = {
  title?: string
  note?: string | null
  status?: TaskStatus
  dueAt?: number | null
  position?: number
  keep?: boolean
}

export const listTasks = async (fileId?: string) => z.array(taskSchema).parse(await api('GET', '/api/tasks', { query: { fileId } }))
export const createTask = async (task: NewTask) => taskSchema.parse(await api('POST', '/api/tasks', { body: task }))
export const updateTask = async (id: string, change: TaskChange) => taskSchema.parse(await api('PATCH', `/api/tasks/${seg(id)}`, { body: change }))
export const deleteTask = (id: string) => api('DELETE', `/api/tasks/${seg(id)}`)

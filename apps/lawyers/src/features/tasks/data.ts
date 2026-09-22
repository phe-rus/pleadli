import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { taskSchema, type TaskInput, type TaskViewId } from './schema'

export async function listTasks(view: TaskViewId = 'open', matterId = '') {
  return z.array(taskSchema).parse(await api('GET', '/api/tasks', { query: { view: view === 'all' ? '' : view, matterId } }))
}

export async function createTask(input: TaskInput) {
  return taskSchema.parse(await api('POST', '/api/tasks', { body: input }))
}

export async function updateTask(id: string, input: TaskInput) {
  return taskSchema.parse(await api('PUT', `/api/tasks/${seg(id)}`, { body: input }))
}

export async function setTaskDone(id: string, done: boolean) {
  return taskSchema.parse(await api('POST', `/api/tasks/${seg(id)}/done`, { body: { done } }))
}

export async function removeTask(id: string) {
  await api('DELETE', `/api/tasks/${seg(id)}`)
}

import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createTask, listTasks, removeTask, setTaskDone, updateTask } from './data'
import type { TaskInput, TaskViewId } from './schema'

export const tasksOptions = (view: TaskViewId = 'open') => queryOptions({ queryKey: ['tasks', 'list', view] as const, queryFn: () => listTasks(view) })
export const useTasks = (view: TaskViewId = 'open') => useSuspenseQuery(tasksOptions(view))

export const useCreateTask = () => useMutation({ mutationFn: (input: TaskInput) => createTask(input) })
export const useUpdateTask = () => useMutation({ mutationFn: (v: { id: string; input: TaskInput }) => updateTask(v.id, v.input) })
export const useSetTaskDone = () => useMutation({ mutationFn: (v: { id: string; done: boolean }) => setTaskDone(v.id, v.done) })
export const useRemoveTask = () => useMutation({ mutationFn: (id: string) => removeTask(id) })

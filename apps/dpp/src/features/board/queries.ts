import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTask, deleteTask, listTasks, updateTask, type NewTask, type TaskChange } from './data'

export const tasksOptions = (fileId?: string) => queryOptions({ queryKey: ['tasks', fileId ?? 'all'] as const, queryFn: () => listTasks(fileId) })

export const useTasks = (fileId?: string) => useQuery(tasksOptions(fileId))

/** Every task change touches the board, the file's list and the calendar. */
function useRefresh() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: ['tasks'] }), queryClient.invalidateQueries({ queryKey: ['calendar'] })])
}

export function useCreateTask() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (task: NewTask) => createTask(task), onSuccess: refresh })
}

export function useUpdateTask() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: ({ id, change }: { id: string; change: TaskChange }) => updateTask(id, change), onSuccess: refresh })
}

export function useDeleteTask() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => deleteTask(id), onSuccess: refresh })
}

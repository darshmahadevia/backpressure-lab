import type { ExperimentView, ScenarioInfo, Snapshot } from './types'

const jsonHeaders = { 'Content-Type': 'application/json' }

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function fetchScenarios(): Promise<ScenarioInfo[]> {
  return request<ScenarioInfo[]>('/api/scenarios')
}

export function startExperiment(scenario: string, durationSeconds: number): Promise<ExperimentView> {
  return request<ExperimentView>('/api/experiments', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ scenario, durationSeconds }),
  })
}

export function stopExperiment(id: string): Promise<ExperimentView> {
  return request<ExperimentView>(`/api/experiments/${id}/stop`, { method: 'POST' })
}

export function getExperiment(id: string): Promise<ExperimentView> {
  return request<ExperimentView>(`/api/experiments/${id}`)
}

export function streamExperiment(
  id: string,
  onSnapshot: (snapshot: Snapshot) => void,
  onError: (error: Error) => void,
): () => void {
  const source = new EventSource(`/api/experiments/${id}/stream`)
  const handleSnapshot = (event: Event) => {
    const message = event as MessageEvent<string>
    try {
      const snapshot = JSON.parse(message.data) as Snapshot
      onSnapshot(snapshot)
      if (snapshot.status === 'complete' || snapshot.status === 'stopped') source.close()
    } catch {
      onError(new Error('The experiment stream sent an unreadable snapshot.'))
    }
  }
  const handleError = () => onError(new Error('The live stream disconnected.'))

  source.addEventListener('snapshot', handleSnapshot)
  source.addEventListener('error', handleError)

  return () => {
    source.removeEventListener('snapshot', handleSnapshot)
    source.removeEventListener('error', handleError)
    source.close()
  }
}

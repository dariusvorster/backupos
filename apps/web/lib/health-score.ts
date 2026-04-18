export interface HealthFactor {
  label: string
  score: number    // 0–100
  weight: number   // percentage weight in final score
  value: string    // human-readable current value e.g. "3 / 5"
  detail: string   // explanation / what to fix
}

export interface HealthScore {
  score: number       // 0–100
  grade: string       // 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  gradeColor: string  // CSS var string
  factors: HealthFactor[]
}

export interface HealthScoreInput {
  enabledJobs: number
  jobsWithSuccessIn24h: number
  totalRepos: number
  reposWithRecentCheck: number
  totalAgents: number
  onlineAgents: number
  openAlerts: number
}

export function computeGrade(score: number): { grade: string; gradeColor: string } {
  if (score >= 95) return { grade: 'A+', gradeColor: 'var(--ok)' }
  if (score >= 85) return { grade: 'A',  gradeColor: 'var(--ok)' }
  if (score >= 75) return { grade: 'B',  gradeColor: 'var(--ok)' }
  if (score >= 60) return { grade: 'C',  gradeColor: 'var(--warn)' }
  if (score >= 40) return { grade: 'D',  gradeColor: 'var(--err)' }
  return { grade: 'F', gradeColor: 'var(--err)' }
}

export function computeHealthScore(input: HealthScoreInput): HealthScore {
  const jobScore = input.enabledJobs === 0
    ? 100
    : Math.min(100, Math.round((input.jobsWithSuccessIn24h / input.enabledJobs) * 100))

  const repoScore = input.totalRepos === 0
    ? 100
    : Math.min(100, Math.round((input.reposWithRecentCheck / input.totalRepos) * 100))

  const agentScore = input.totalAgents === 0
    ? 100
    : Math.min(100, Math.round((input.onlineAgents / input.totalAgents) * 100))

  const alertScore = Math.max(0, 100 - input.openAlerts * 20)

  const factors: HealthFactor[] = [
    {
      label: 'Jobs backed up in last 24h',
      score: jobScore,
      weight: 40,
      value: `${input.jobsWithSuccessIn24h} / ${input.enabledJobs}`,
      detail: jobScore === 100
        ? 'All enabled jobs ran successfully'
        : `${input.enabledJobs - input.jobsWithSuccessIn24h} job(s) missed their last run`,
    },
    {
      label: 'Repositories checked (7d)',
      score: repoScore,
      weight: 20,
      value: `${input.reposWithRecentCheck} / ${input.totalRepos}`,
      detail: repoScore === 100
        ? 'All repositories have a recent integrity check'
        : `${input.totalRepos - input.reposWithRecentCheck} repo(s) not checked in 7 days`,
    },
    {
      label: 'Agents online',
      score: agentScore,
      weight: 20,
      value: `${input.onlineAgents} / ${input.totalAgents}`,
      detail: agentScore === 100
        ? 'All agents are connected'
        : `${input.totalAgents - input.onlineAgents} agent(s) are offline`,
    },
    {
      label: 'Open alerts',
      score: alertScore,
      weight: 20,
      value: input.openAlerts === 0 ? 'None' : `${input.openAlerts} open`,
      detail: input.openAlerts === 0
        ? 'No open storage alerts'
        : `${input.openAlerts} storage alert(s) need attention (−20 pts each)`,
    },
  ]

  const score = Math.round(
    factors.reduce((acc, f) => acc + f.score * f.weight, 0) / 100,
  )

  const { grade, gradeColor } = computeGrade(score)
  return { score, grade, gradeColor, factors }
}

// Returns 30 values (oldest first) — daily backup success rate 0–100.
// Uses backup run history; days with no runs return 0.
export function buildSparkline(
  runs: { status: string; startedAt: Date | null }[],
): number[] {
  const byDay = new Map<string, { success: number; total: number }>()
  for (const run of runs) {
    if (!run.startedAt) continue
    const day = run.startedAt.toISOString().slice(0, 10)
    const entry = byDay.get(day) ?? { success: 0, total: 0 }
    entry.total++
    if (run.status === 'success') entry.success++
    byDay.set(day, entry)
  }
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10)
    const entry = byDay.get(day)
    return entry ? Math.round((entry.success / entry.total) * 100) : 0
  })
}

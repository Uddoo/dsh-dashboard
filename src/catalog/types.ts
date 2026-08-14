/** Durable Project Catalog records and lossless Host-to-client projections. */

export type ProjectId = string
export type RepositoryId = string
export type DiscoveryRootId = string
export type CatalogSettingId = 'active-project'

export type WorkspaceStrategy = 'worktree' | 'controlled-directory'
export type ProjectRegistrationSource = 'current-workspace' | 'manual' | 'discovery'

/** Filesystem source used to materialize task workspaces for the selected project. */
export type ProjectWorkspaceSource =
  | {
      readonly strategy: 'worktree'
      readonly projectRoot: string
      readonly repositoryRoot: string
    }
  | {
      readonly strategy: 'controlled-directory'
      readonly projectRoot: string
    }

export interface ProjectRecord {
  readonly id: ProjectId
  readonly name: string
  readonly root: string
  readonly policyPath?: string
  readonly repositoryIds: readonly RepositoryId[]
  readonly workspaceStrategy: WorkspaceStrategy
  /** Bounty Hunter remains fail-closed until a later phase adds scoped authorization records. */
  readonly autonomousClaims: false
  readonly source: ProjectRegistrationSource
  readonly createdAt: string
  readonly updatedAt: string
}

export interface RepositoryRecord {
  readonly id: RepositoryId
  readonly kind: 'git'
  readonly root: string
  readonly remoteUrl?: string
  readonly branch?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface DiscoveryRootRecord {
  readonly id: DiscoveryRootId
  readonly path: string
  readonly maxDepth: number
  readonly confirmationRequired: true
  readonly createdAt: string
  readonly updatedAt: string
}

export type ActiveProjectRecord =
  | {
      /** Legacy records omitted `mode`; keep reading them during development upgrades. */
      readonly mode?: 'project'
      readonly projectId: ProjectId
      readonly updatedAt: string
    }
  | {
      readonly mode: 'global'
      readonly updatedAt: string
    }

export type ProjectCatalogSelection =
  | { readonly mode: 'project'; readonly projectId: ProjectId }
  | { readonly mode: 'global' }

export interface RepositoryView extends RepositoryRecord {}

export interface ProjectView extends ProjectRecord {
  readonly repositories: readonly RepositoryView[]
  readonly currentWorkspace: boolean
  readonly trackerKind?: string
  readonly contextLabel?: string
  readonly configurationState?: 'ready' | 'invalid'
  readonly configurationError?: string
  readonly runningAgents?: number
  readonly retryingAgents?: number
}

export interface ProjectCatalogView {
  readonly projects: readonly ProjectView[]
  readonly discoveryRoots: readonly DiscoveryRootRecord[]
  readonly globalBrokerEnabled: false
}

export interface ProjectCandidateView {
  /** Short-lived process-local proof that this exact path came from a bounded scan. */
  readonly token: string
  readonly name: string
  readonly path: string
  readonly policyPath?: string
  readonly repository?: Omit<RepositoryView, 'id' | 'createdAt' | 'updatedAt'>
  readonly alreadyRegisteredProjectId?: ProjectId
}

export interface ProjectScanResult {
  readonly root: DiscoveryRootRecord
  readonly candidates: readonly ProjectCandidateView[]
  readonly truncated: boolean
}

export interface AddDiscoveryRootInput {
  readonly path: string
  readonly maxDepth?: number
}

export interface RegisterProjectInput {
  readonly path: string
  readonly name?: string
}

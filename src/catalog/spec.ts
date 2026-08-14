/** Harness storage-domain declaration for Project Catalog state. */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type {
  DiscoveryRootId,
  DiscoveryRootRecord,
  ProjectId,
  ProjectRecord,
  RepositoryId,
  RepositoryRecord,
} from './types.ts'

const id = z.uuid()
const nonBlank = z.string().trim().min(1)
const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)), 'expected an ISO timestamp')

export const projectRecordSchema = z.object({
  id,
  name: nonBlank,
  root: nonBlank,
  policyPath: nonBlank.optional(),
  repositoryIds: z.array(id),
  workspaceStrategy: z.union([z.literal('worktree'), z.literal('controlled-directory')]),
  autonomousClaims: z.literal(false),
  source: z.union([z.literal('current-workspace'), z.literal('manual'), z.literal('discovery')]),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict() as z.ZodType<ProjectRecord>

export const repositoryRecordSchema = z.object({
  id,
  kind: z.literal('git'),
  root: nonBlank,
  remoteUrl: nonBlank.optional(),
  branch: nonBlank.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict() as z.ZodType<RepositoryRecord>

export const discoveryRootRecordSchema = z.object({
  id,
  path: nonBlank,
  maxDepth: z.number().int().min(1).max(8),
  confirmationRequired: z.literal(true),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict() as z.ZodType<DiscoveryRootRecord>

export const dashboardCatalogDomainSpec = defineDomain({
  name: 'dsh_dashboard',
  version: 0,
  tables: {
    projects: domainTable<ProjectId, ProjectRecord>(projectRecordSchema),
    repositories: domainTable<RepositoryId, RepositoryRecord>(repositoryRecordSchema),
    discovery_roots: domainTable<DiscoveryRootId, DiscoveryRootRecord>(discoveryRootRecordSchema),
  },
})

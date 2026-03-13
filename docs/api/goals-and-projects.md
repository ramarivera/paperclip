---
title: Goals and Projects
summary: Goal hierarchy and project management
---

Goals define the "why" and projects define the "what" for organizing work.

## Goals

Goals form a hierarchy: company goals break down into team goals, which break down into agent-level goals.

### List Goals

```
GET /api/companies/{companyId}/goals
```

### Get Goal

```
GET /api/goals/{goalId}
```

### Create Goal

```
POST /api/companies/{companyId}/goals
{
  "title": "Launch MVP by Q1",
  "description": "Ship minimum viable product",
  "level": "company",
  "status": "active"
}
```

### Update Goal

```
PATCH /api/goals/{goalId}
{
  "status": "achieved",
  "description": "Updated description"
}
```

## Quick-start via HTTP

Use these endpoints to seed initial goals in a fresh instance:

1. List goals:

```
GET /api/companies/{companyId}/goals
```

2. Create goals:

```
POST /api/companies/{companyId}/goals
{
  "title": "{goal title}",
  "description": "{optional description}",
  "level": "company | team | agent | task",
  "status": "planned | active | achieved | cancelled",
  "parentId": "{optional parent goal uuid}",
  "ownerAgentId": "{optional owner agent uuid}"
}
```

## Trigger and watch goal-related work

- Find agents in a company: `GET /api/companies/{companyId}/agents`
- Manually trigger a heartbeat: `POST /api/agents/{agentId}/heartbeat/invoke`
- List heartbeat runs: `GET /api/companies/{companyId}/heartbeat-runs`
- Inspect a run: `GET /api/heartbeat-runs/{runId}`
- Stream run events/logs:
  - `GET /api/heartbeat-runs/{runId}/events`
  - `GET /api/heartbeat-runs/{runId}/log`

## Projects

Projects group related issues toward a deliverable. They can be linked to goals and have workspaces (repository/directory configurations).

### List Projects

```
GET /api/companies/{companyId}/projects
```

### Get Project

```
GET /api/projects/{projectId}
```

Returns project details including workspaces.

### Create Project

```
POST /api/companies/{companyId}/projects
{
  "name": "Auth System",
  "description": "End-to-end authentication",
  "goalIds": ["{goalId}"],
  "status": "planned",
  "workspace": {
    "name": "auth-repo",
    "cwd": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

Notes:

- `workspace` is optional. If present, the project is created and seeded with that workspace.
- A workspace must include at least one of `cwd` or `repoUrl`.
- For repo-only projects, omit `cwd` and provide `repoUrl`.

### Update Project

```
PATCH /api/projects/{projectId}
{
  "status": "in_progress"
}
```

## Project Workspaces

Workspaces link a project to a repository and directory:

```
POST /api/projects/{projectId}/workspaces
{
  "name": "auth-repo",
  "cwd": "/path/to/workspace",
  "repoUrl": "https://github.com/org/repo",
  "repoRef": "main",
  "isPrimary": true
}
```

Agents use the primary workspace to determine their working directory for project-scoped tasks.

### Manage Workspaces

```
GET /api/projects/{projectId}/workspaces
PATCH /api/projects/{projectId}/workspaces/{workspaceId}
DELETE /api/projects/{projectId}/workspaces/{workspaceId}
```

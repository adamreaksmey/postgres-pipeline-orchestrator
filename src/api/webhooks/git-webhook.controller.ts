import { Controller, Post, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PipelinesService } from 'src/api/pipelines/pipelines.service';
import { RunsService } from 'src/api/runs/runs.service';

/**
 * Extract repo identifier from GitHub/GitLab-style webhook payloads.
 * Pipelines are matched by pipelines.repository (e.g. full URL or "owner/repo").
 */
function getRepoFromPayload(body: Record<string, unknown>): string | null {
  if (typeof body.repo === 'string') return body.repo;

  // GitHub: repository.full_name (owner/repo) or repository.clone_url
  const repo = body.repository as Record<string, unknown> | undefined;
  if (repo) {
    if (typeof repo.full_name === 'string') return repo.full_name;
    if (typeof repo.clone_url === 'string') return repo.clone_url;
  }

  // GitLab: project.path_with_namespace or project.web_url
  const project = body.project as Record<string, unknown> | undefined;
  if (project) {
    if (typeof project.path_with_namespace === 'string') return project.path_with_namespace;
    if (typeof project.web_url === 'string') return project.web_url;
  }

  return null;
}

@Controller('webhooks/git')
@ApiTags('webhooks')
export class GitWebhookController {
  constructor(
    private readonly pipelinesService: PipelinesService,
    private readonly runsService: RunsService,
  ) {}

  /**
   * Receive Git push webhook (GitHub, GitLab, or any POST with repo/repository).
   * Resolves pipeline by repository and triggers a run (create run + enqueue jobs).
   */
  @Post('push')
  @ApiOperation({ summary: 'Receive a git push webhook and trigger a run' })
  @ApiBody({
    description:
      'GitHub/GitLab push payload. We derive repo from repo/repository/project fields and store the full body in trigger_metadata.',
    schema: { type: 'object', additionalProperties: true },
  })
  async handlePush(@Body() body: Record<string, unknown>) {
    const repo = getRepoFromPayload(body);
    if (!repo) {
      throw new BadRequestException(
        'Missing repo. Send repo, repository.full_name, repository.clone_url, or project.path_with_namespace',
      );
    }

    const pipeline = await this.pipelinesService.findByRepository(repo);
    if (!pipeline) {
      throw new NotFoundException(`No pipeline found for repository: ${repo}`);
    }

    const run = await this.runsService.triggerRun(
      pipeline.id,
      'git_push',
      body as Record<string, unknown>,
    );
    return { runId: run.id, pipelineId: pipeline.id, status: run.status };
  }
}

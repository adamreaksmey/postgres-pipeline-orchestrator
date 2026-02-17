import { Pipeline } from '../entities/pipeline.entity';

/**
 * Fake pipelines inserted on first app start when no pipelines exist.
 */
export const PIPELINE_SEED: Partial<Pipeline>[] = [
  {
    name: 'frontend-app',
    repository: 'https://github.com/example/frontend-app',
    config: {
      stages: [
        {
          name: 'build',
          steps: [
            { name: 'install', command: 'npm ci', priority: 5 },
            { name: 'build', command: 'npm run build', priority: 5 },
          ],
        },
        {
          name: 'test',
          steps: [{ name: 'test', command: 'npm test', priority: 5 }],
        },
      ],
    },
  },
  {
    name: 'backend-api',
    repository: 'https://github.com/example/backend-api',
    config: {
      stages: [
        {
          name: 'build',
          steps: [
            { name: 'install', command: 'npm ci', priority: 5 },
            { name: 'build', command: 'npm run build', priority: 5 },
          ],
        },
        {
          name: 'deploy',
          steps: [
            { name: 'deploy-staging', command: './deploy.sh staging', priority: 5 },
            { name: 'deploy-production', command: './deploy.sh production', priority: 3 },
          ],
        },
      ],
    },
  },
  {
    name: 'docs',
    repository: 'https://github.com/example/docs',
    config: {
      stages: [
        {
          name: 'build',
          steps: [{ name: 'build', command: 'npm run build', priority: 5 }],
        },
      ],
    },
  },
];

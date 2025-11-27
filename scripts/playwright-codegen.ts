import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetTestDatabase } from '../src/@tests/web-ui/utils/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SEED = 'src/@tests/llm-smoke/chat-tests/scenario-one/seed.json';
const DEFAULT_OUTPUT = path.join('src/@tests/web-ui/tests', 'dependents.spec.ts');
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001/t';

interface CliOptions {
  seedPath: string;
  outputPath: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let seedPath = process.env.PLAYWRIGHT_SEED || DEFAULT_SEED;
  let outputPath = process.env.PLAYWRIGHT_CODEGEN_OUTPUT || DEFAULT_OUTPUT;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--seed' && args[i + 1]) {
      seedPath = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--seed=')) {
      seedPath = arg.split('=')[1] ?? seedPath;
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1] ?? outputPath;
    }
  }

  return {
    seedPath,
    outputPath,
  };
}

async function main() {
  const { seedPath, outputPath } = parseArgs();
  await resetTestDatabase({ seedPath: path.resolve(seedPath) });

  const child = spawn(
    'npx',
    ['playwright', 'codegen', BASE_URL, '--browser=chromium', '--output', outputPath],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    }
  );
  child.on('exit', code => process.exit(code ?? 0));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});


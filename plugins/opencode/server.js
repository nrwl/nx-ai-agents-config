// OpenCode loads this file directly as a plugin module and calls every export
// as a plugin factory. Keep the plugin entry as the only export; put shared or
// testable logic in ./lib/ and import it here.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyNxConfig, loadAgents, loadCommands } from './lib/config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export const NxPlugin = async ({ directory } = {}) => {
  const agents = loadAgents(path.join(packageRoot, 'agents'));
  const commands = loadCommands(path.join(packageRoot, 'commands'));

  return {
    config: async (cfg) => {
      applyNxConfig(cfg, {
        skillsDir: path.join(packageRoot, 'skills'),
        agents,
        commands,
        guidelinesPath: path.join(packageRoot, 'nx-guidelines.md'),
        directory,
      });
    },
  };
};

export default NxPlugin;
